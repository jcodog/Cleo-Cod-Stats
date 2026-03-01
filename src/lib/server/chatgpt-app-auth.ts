import { fetchMutation, fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_JSON_CONTENT_TYPE,
  createChatGptAppErrorResponse,
  createChatGptAppRequestId,
  resolveChatGptAppOAuthMetadata,
  type ChatGptAppErrorCode,
} from "@/lib/server/chatgpt-app-contract";
import {
  buildOAuthWwwAuthenticate,
  extractBearerToken,
  type VerifiedOAuthAccessToken,
  verifyOAuthAccessToken,
} from "@/lib/server/oauth/access-token";

export const APP_API_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": CHATGPT_APP_JSON_CONTENT_TYPE,
} as const;

type RequiredAppScopes = readonly string[];

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
  connectionLinkedAt?: number | null;
  connectionRevokedAt?: number | null;
  connectionLastUsedAt?: number | null;
};

type AuthFailureParams = {
  status: number;
  code: ChatGptAppErrorCode;
  error: "invalid_token" | "insufficient_scope";
  description: string;
  scope?: string;
  oauthScopes?: string[];
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
      response: Response;
    };

function buildAuthFailureResponse(request: Request, params: AuthFailureParams) {
  const requestUrl = new URL(request.url);
  const requestId = createChatGptAppRequestId();

  let wwwAuthenticate: string | null = null;

  try {
    wwwAuthenticate = buildOAuthWwwAuthenticate(requestUrl.origin, {
      error: params.error,
      errorDescription: params.description,
      scope: params.scope,
    });
  } catch (error) {
    console.error("Unable to build OAuth challenge metadata", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return createChatGptAppErrorResponse(params.code, params.description, {
    status: params.status,
    requestId,
    oauth: resolveChatGptAppOAuthMetadata(requestUrl.origin, params.oauthScopes),
    headers: wwwAuthenticate
      ? {
          "WWW-Authenticate": wwwAuthenticate,
        }
      : undefined,
  });
}

function normalizeRequiredScopes(requiredScopes: readonly string[]) {
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
  // ChatGPT App endpoints must not require Clerk session.
  const normalizedRequiredScopes = normalizeRequiredScopes(requiredScopes);

  const token = extractBearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 401,
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "invalid_token",
        description: "Missing bearer token",
        oauthScopes: normalizedRequiredScopes,
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
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "invalid_token",
        description: "Invalid or expired access token",
        oauthScopes: normalizedRequiredScopes,
      }),
    };
  }

  const missingScopes = getMissingScopes(
    verifiedToken.scopes,
    normalizedRequiredScopes,
  );

  if (missingScopes.length > 0) {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "insufficient_scope",
        description: `Missing required scope: ${missingScopes.join(" ")}`,
        scope: normalizedRequiredScopes.join(" "),
        oauthScopes: normalizedRequiredScopes,
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
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "invalid_token",
        description: "Token subject does not map to an active account",
        oauthScopes: normalizedRequiredScopes,
      }),
    };
  }

  if (typeof user.discordId !== "string" || user.discordId.trim().length === 0) {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 401,
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "invalid_token",
        description: "Token subject is missing a CodStats account identity",
        oauthScopes: normalizedRequiredScopes,
      }),
    };
  }

  if (user.status !== "active") {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "invalid_token",
        description: "User account is not active",
        oauthScopes: normalizedRequiredScopes,
      }),
    };
  }

  if (!user.chatgptLinked || user.connectionStatus !== "active") {
    return {
      ok: false,
      response: buildAuthFailureResponse(request, {
        status: 403,
        code: CHATGPT_APP_ERROR_CODES.unauthorized,
        error: "insufficient_scope",
        description: "ChatGPT app is not linked for this account",
        scope: normalizedRequiredScopes.join(" "),
        oauthScopes: normalizedRequiredScopes,
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
