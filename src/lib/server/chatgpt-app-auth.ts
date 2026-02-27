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

export type RequiredAppScopes =
  | string[]
  | {
      allOf?: string[];
      anyOf?: string[];
      challengeScope?: string;
    };

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

type NormalizedScopeRequirement = {
  allOf: string[];
  anyOf: string[];
  challengeScope?: string;
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

function normalizeScopeRequirement(
  requirement: RequiredAppScopes,
): NormalizedScopeRequirement {
  if (Array.isArray(requirement)) {
    const allOf = normalizeRequiredScopes(requirement);
    return {
      allOf,
      anyOf: [],
      challengeScope: allOf.join(" "),
    };
  }

  const allOf = normalizeRequiredScopes(requirement.allOf ?? []);
  const anyOf = normalizeRequiredScopes(requirement.anyOf ?? []);
  const challengeScope = requirement.challengeScope?.trim();

  return {
    allOf,
    anyOf,
    challengeScope: challengeScope && challengeScope.length > 0 ? challengeScope : undefined,
  };
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

  const scopeRequirement = normalizeScopeRequirement(requiredScopes);
  const missingAllOfScopes = getMissingScopes(
    verifiedToken.scopes,
    scopeRequirement.allOf,
  );

  const hasAnyOfScope =
    scopeRequirement.anyOf.length === 0 ||
    scopeRequirement.anyOf.some((scope) => verifiedToken.scopes.includes(scope));

  if (missingAllOfScopes.length > 0 || !hasAnyOfScope) {
    const requirementDescription = [
      missingAllOfScopes.length > 0
        ? `all scopes: ${scopeRequirement.allOf.join(" ")}`
        : null,
      !hasAnyOfScope && scopeRequirement.anyOf.length > 0
        ? `one of: ${scopeRequirement.anyOf.join(" ")}`
        : null,
    ]
      .filter((value): value is string => value !== null)
      .join(" and ");

    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        error: "insufficient_scope",
        description: `Missing required scope requirement: ${requirementDescription}`,
        scope: (() => {
          if (scopeRequirement.challengeScope) {
            return scopeRequirement.challengeScope;
          }

          if (scopeRequirement.allOf.length > 0) {
            return scopeRequirement.allOf.join(" ");
          }

          if (scopeRequirement.anyOf.length > 0) {
            return scopeRequirement.anyOf.join(" ");
          }

          return undefined;
        })(),
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
