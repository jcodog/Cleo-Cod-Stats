import { fetchMutation, fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildOAuthWwwAuthenticate,
  extractBearerToken,
  type VerifiedOAuthAccessToken,
  verifyOAuthAccessToken,
} from "@/lib/server/oauth/access-token";

export const APP_API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

type RequiredAppScopes = string[];

type AppUserRecord = {
  _id: Id<"users">;
  clerkUserId: string;
  discordId: string;
  name: string;
  plan: "free" | "premium";
  status: "active" | "disabled";
  chatgptLinked: boolean;
  connectionStatus: "active" | "revoked" | null;
  connectionScopes: string[];
};

type AuthFailureParams = {
  status: number;
  error: "invalid_token" | "insufficient_scope";
  description: string;
  scope?: string;
};

export type AuthenticatedAppRequest = {
  token: VerifiedOAuthAccessToken;
  user: AppUserRecord;
};

export type AuthenticatedAppRequestResult =
  | {
      ok: true;
      auth: AuthenticatedAppRequest;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function buildAuthFailureResponse(request: Request, params: AuthFailureParams) {
  const requestUrl = new URL(request.url);

  return NextResponse.json(
    {
      ok: false,
      error: params.error,
      error_description: params.description,
    },
    {
      status: params.status,
      headers: {
        ...APP_API_NO_STORE_HEADERS,
        "WWW-Authenticate": buildOAuthWwwAuthenticate(requestUrl.origin, {
          error: params.error,
          errorDescription: params.description,
          scope: params.scope,
        }),
      },
    },
  );
}

function normalizeRequiredScopes(requiredScopes: string[]) {
  return Array.from(
    new Set(
      requiredScopes
        .map((scope) => scope.trim())
        .filter((scope) => scope.length > 0),
    ),
  );
}

function getMissingScopes(tokenScopes: string[], requiredScopes: string[]) {
  const tokenScopeSet = new Set(tokenScopes);
  return requiredScopes.filter((scope) => !tokenScopeSet.has(scope));
}

export async function requireAuthenticatedAppRequest(
  request: Request,
  requiredScopes: RequiredAppScopes,
): Promise<AuthenticatedAppRequestResult> {
  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 401,
        error: "invalid_token",
        description: "Missing bearer token",
      }),
    };
  }

  let verifiedToken: VerifiedOAuthAccessToken;

  try {
    const requestUrl = new URL(request.url);
    verifiedToken = verifyOAuthAccessToken(token, requestUrl.origin);
  } catch {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 401,
        error: "invalid_token",
        description: "Invalid or expired access token",
      }),
    };
  }

  const normalizedRequiredScopes = normalizeRequiredScopes(requiredScopes);
  const missingScopes = getMissingScopes(
    verifiedToken.scopes,
    normalizedRequiredScopes,
  );

  if (missingScopes.length > 0) {

    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        error: "insufficient_scope",
        description: `Missing required scope: ${missingScopes.join(" ")}`,
        scope: normalizedRequiredScopes.join(" "),
      }),
    };
  }

  const user = (await fetchQuery(api.queries.chatgpt.getUserByOAuthSubject, {
    sub: verifiedToken.sub,
  })) as AppUserRecord | null;

  if (!user) {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 401,
        error: "invalid_token",
        description: "Token subject does not map to an active account",
      }),
    };
  }

  if (user.status !== "active") {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        error: "invalid_token",
        description: "User account is not active",
      }),
    };
  }

  if (!user.chatgptLinked || user.connectionStatus !== "active") {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        error: "invalid_token",
        description: "ChatGPT app is not linked for this account",
      }),
    };
  }

  return {
    ok: true,
    auth: {
      token: verifiedToken,
      user,
    },
  };
}

export async function touchChatGptConnectionLastUsedAt(userId: Id<"users">) {
  const result = await fetchMutation(api.mutations.chatgpt.touchConnectionLastUsedAt, {
    userId,
  });

  if (!result?.ok) {
    throw new Error("chatgpt_connection_not_active");
  }

  return result;
}
