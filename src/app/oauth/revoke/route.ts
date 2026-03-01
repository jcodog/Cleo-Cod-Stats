import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { getOAuthServerConfig } from "@/lib/server/oauth/config";
import {
  resolveOAuthClient,
  validateOAuthClientAuthentication,
} from "@/lib/server/oauth/clients";
import { sha256Base64Url } from "@/lib/server/oauth/crypto";
import {
  getClientAuthenticationInput,
  getSingleSearchParam,
  oauthErrorResponse,
  parseOAuthRequestBody,
} from "@/lib/server/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_CSRF_HEADER = "x-codstats-csrf";
const SETTINGS_CSRF_HEADER_VALUE = "1";

type RevokeRouteDeps = {
  getAuth: typeof auth;
  runMutation: typeof fetchMutation;
  resolveClient: typeof resolveOAuthClient;
  validateClientAuth: typeof validateOAuthClientAuthentication;
};

const defaultDeps: RevokeRouteDeps = {
  getAuth: auth,
  runMutation: fetchMutation,
  resolveClient: resolveOAuthClient,
  validateClientAuth: validateOAuthClientAuthentication,
};

function successNoStoreResponse() {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}

function getPrimaryForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() ?? null;
}

function normalizeOrigin(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getExpectedOrigin(request: Request, requestUrl: URL) {
  const forwardedHost = getPrimaryForwardedValue(
    request.headers.get("x-forwarded-host"),
  );
  const forwardedProto = getPrimaryForwardedValue(
    request.headers.get("x-forwarded-proto"),
  );

  if (forwardedHost && forwardedProto) {
    const forwardedOrigin = normalizeOrigin(`${forwardedProto}://${forwardedHost}`);
    if (forwardedOrigin) {
      return forwardedOrigin;
    }
  }

  const host = getPrimaryForwardedValue(request.headers.get("host"));
  if (host) {
    const hostOrigin = normalizeOrigin(`${requestUrl.protocol}//${host}`);
    if (hostOrigin) {
      return hostOrigin;
    }
  }

  return requestUrl.origin;
}

function getRequestOrigin(request: Request) {
  const origin = normalizeOrigin(request.headers.get("origin"));
  if (origin) {
    return origin;
  }

  return normalizeOrigin(request.headers.get("referer"));
}

function validateSettingsRevocationRequest(request: Request, requestUrl: URL) {
  if (request.headers.get(SETTINGS_CSRF_HEADER) !== SETTINGS_CSRF_HEADER_VALUE) {
    return "Missing CSRF protection header";
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return "Invalid content type";
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") {
    return "Cross-site request blocked";
  }

  const expectedOrigin = getExpectedOrigin(request, requestUrl);
  const requestOrigin = getRequestOrigin(request);
  if (!requestOrigin || requestOrigin !== expectedOrigin) {
    return "Origin validation failed";
  }

  return null;
}

function invalidClientResponse() {
  return oauthErrorResponse(
    "invalid_client",
    401,
    "Client authentication failed",
    {
      "WWW-Authenticate": 'Basic realm="oauth"',
    },
  );
}

async function revokeForSettingsUser(deps: RevokeRouteDeps) {
  const { userId, sessionId, getToken } = await deps.getAuth();

  if (!userId || !sessionId) {
    return oauthErrorResponse("invalid_request", 401, "Authentication required");
  }

  const convexToken = await getToken({ template: "convex" });

  if (!convexToken) {
    console.error("OAuth settings revoke missing Convex token for Clerk session");
    return oauthErrorResponse(
      "invalid_request",
      500,
      "Unable to initialize revocation request",
    );
  }

  try {
    await deps.runMutation(
      api.mutations.oauth.revokeForCurrentUser,
      {},
      { token: convexToken },
    );
  } catch (error) {
    console.error("OAuth settings revoke failed", error);
    return oauthErrorResponse("invalid_request", 500, "Token revocation failed");
  }

  return successNoStoreResponse();
}

export async function handleRevokePost(
  request: Request,
  deps: RevokeRouteDeps = defaultDeps,
) {
  const requestUrl = new URL(request.url);

  try {
    getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth revoke env config error", error);
    return oauthErrorResponse(
      "invalid_request",
      500,
      "OAuth server is not configured",
    );
  }

  if (requestUrl.searchParams.get("source") === "settings") {
    const validationError = validateSettingsRevocationRequest(request, requestUrl);
    if (validationError) {
      return oauthErrorResponse("invalid_request", 403, validationError);
    }

    return revokeForSettingsUser(deps);
  }

  let params: URLSearchParams;
  try {
    params = await parseOAuthRequestBody(request);
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Invalid request body");
  }

  let authInput;
  try {
    authInput = getClientAuthenticationInput(request, params);
  } catch {
    return invalidClientResponse();
  }

  const client = await deps.resolveClient(authInput.clientId, requestUrl.origin);
  if (!client || !deps.validateClientAuth(client, authInput)) {
    return invalidClientResponse();
  }

  let token: string | null;
  let tokenTypeHint: string | null;
  try {
    token = getSingleSearchParam(params, "token");
    tokenTypeHint = getSingleSearchParam(params, "token_type_hint");
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Duplicate revoke parameter");
  }

  if (!token || token.length < 32 || token.length > 512) {
    return oauthErrorResponse("invalid_request", 400, "Invalid token");
  }

  if (tokenTypeHint && tokenTypeHint !== "refresh_token") {
    return oauthErrorResponse(
      "invalid_request",
      400,
      "token_type_hint must be refresh_token",
    );
  }

  try {
    await deps.runMutation(api.mutations.oauth.revokeByRefreshToken, {
      clientId: client.clientId,
      refreshTokenHash: sha256Base64Url(token),
    });
  } catch (error) {
    console.error("OAuth revoke failed", error);
    return oauthErrorResponse("invalid_request", 500, "Token revocation failed");
  }

  return successNoStoreResponse();
}

export async function POST(request: Request) {
  return handleRevokePost(request);
}
