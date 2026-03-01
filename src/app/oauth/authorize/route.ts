import { auth } from "@clerk/nextjs/server";
import { fetchMutation } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import { generateRandomToken, sha256Base64Url } from "@/lib/server/oauth/crypto";
import {
  getOAuthServerConfig,
  isAllowedRedirectUri,
  normalizeResourceIdentifier,
  normalizeRedirectUri,
} from "@/lib/server/oauth/config";
import { resolveOAuthClient } from "@/lib/server/oauth/clients";
import {
  authorizeRedirectResponse,
  getSingleSearchParam,
  oauthErrorResponse,
} from "@/lib/server/oauth/http";
import { AUTH_CODE_TTL_SECONDS, millisecondsFromNow } from "@/lib/server/oauth/time";
import { assertScopesAllowed, parseScope } from "@/lib/server/oauth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PKCE_CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

type AuthorizeRouteDeps = {
  getAuth: typeof auth;
  runMutation: typeof fetchMutation;
};

const defaultDeps: AuthorizeRouteDeps = {
  getAuth: auth,
  runMutation: fetchMutation,
};

function authorizeError(
  redirectUri: string | null,
  state: string | null,
  error: "invalid_request" | "invalid_client" | "invalid_scope",
  description: string,
) {
  if (!redirectUri) {
    return oauthErrorResponse(error, 400, description);
  }

  const params: Record<string, string> = {
    error,
    error_description: description,
  };

  if (state) {
    params.state = state;
  }

  return authorizeRedirectResponse(redirectUri, params);
}

export async function handleAuthorizeGet(
  request: Request,
  deps: AuthorizeRouteDeps = defaultDeps,
) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth authorize env config error", error);
    return oauthErrorResponse(
      "invalid_request",
      500,
      "OAuth server is not configured",
    );
  }

  const params = requestUrl.searchParams;

  let responseType: string | null;
  let clientId: string | null;
  let redirectUriRaw: string | null;
  let scopeRaw: string | null;
  let state: string | null;
  let resource: string | null;
  let codeChallenge: string | null;
  let codeChallengeMethodRaw: string | null;

  try {
    responseType = getSingleSearchParam(params, "response_type");
    clientId = getSingleSearchParam(params, "client_id");
    redirectUriRaw = getSingleSearchParam(params, "redirect_uri");
    scopeRaw = getSingleSearchParam(params, "scope");
    state = getSingleSearchParam(params, "state");
    resource = getSingleSearchParam(params, "resource");
    codeChallenge = getSingleSearchParam(params, "code_challenge");
    codeChallengeMethodRaw = getSingleSearchParam(
      params,
      "code_challenge_method",
    );
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Duplicate OAuth parameter");
  }

  if (responseType !== "code") {
    return authorizeError(
      null,
      state,
      "invalid_request",
      "response_type must be 'code'",
    );
  }

  let redirectUri: string | null = null;
  if (redirectUriRaw) {
    try {
      redirectUri = normalizeRedirectUri(redirectUriRaw);
    } catch {
      return oauthErrorResponse("invalid_request", 400, "Invalid redirect_uri");
    }
  }

  if (!redirectUri || !isAllowedRedirectUri(redirectUri, config.allowedRedirectUris)) {
    return oauthErrorResponse(
      "invalid_request",
      400,
      "redirect_uri is not allowlisted",
    );
  }

  if (!clientId || clientId.length > 200) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "client_id is required",
    );
  }

  let normalizedResource: string | null = null;
  if (resource) {
    try {
      normalizedResource = normalizeResourceIdentifier(resource);
    } catch {
      normalizedResource = null;
    }
  }

  if (!normalizedResource || normalizedResource !== config.resource) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "resource is required and must match configured resource server",
    );
  }

  const client = await resolveOAuthClient(clientId, requestUrl.origin);
  if (!client) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_client",
      "Unknown client_id",
    );
  }

  if (!client.responseTypes.includes("code")) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_client",
      "Client does not support code response_type",
    );
  }

  if (!client.grantTypes.includes("authorization_code")) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_client",
      "Client does not support authorization_code grant",
    );
  }

  if (!client.redirectUris.includes(redirectUri)) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "redirect_uri is not registered for client",
    );
  }

  if (!state || state.length < 16 || state.length > 512) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "state is required and must be 16-512 chars",
    );
  }

  if (!scopeRaw) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_scope",
      "scope is required",
    );
  }

  let parsedScopes: ReturnType<typeof parseScope>;
  try {
    parsedScopes = parseScope(scopeRaw);
    assertScopesAllowed(parsedScopes.scopes, config.allowedScopes);
  } catch {
    return authorizeError(
      redirectUri,
      state,
      "invalid_scope",
      "Requested scope is invalid",
    );
  }

  let codeChallengeMethod: "S256" | undefined;

  if (!codeChallenge || !codeChallengeMethodRaw) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "PKCE is required: provide code_challenge and code_challenge_method",
    );
  }

  if (codeChallengeMethodRaw !== "S256") {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "Only S256 PKCE is supported",
    );
  }

  if (!PKCE_CODE_CHALLENGE_PATTERN.test(codeChallenge)) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "Invalid code_challenge format",
    );
  }

  codeChallengeMethod = "S256";

  const { userId, sessionId, getToken } = await deps.getAuth();
  if (!userId || !sessionId) {
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "User must be signed in before approving this OAuth client",
    );
  }

  // ChatGPT App endpoints must not require Clerk session.

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    console.error("OAuth authorize missing Convex token for Clerk session");
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "Unable to initialize authorization flow",
    );
  }

  const authorizationCode = generateRandomToken(48);
  const codeHash = sha256Base64Url(authorizationCode);
  const stateHash = sha256Base64Url(state);

  try {
    await deps.runMutation(
      api.mutations.oauth.createAuthorizationCode,
      {
        clientId,
        resource: normalizedResource,
        codeHash,
        stateHash,
        sessionId,
        redirectUri,
        scopes: parsedScopes.scopes,
        codeChallenge: codeChallenge ?? undefined,
        codeChallengeMethod,
        expiresAt: millisecondsFromNow(AUTH_CODE_TTL_SECONDS),
      },
      { token: convexToken },
    );
  } catch (error) {
    console.error("OAuth authorize failed to persist authorization code", error);
    return authorizeError(
      redirectUri,
      state,
      "invalid_request",
      "Unable to create authorization code",
    );
  }

  return authorizeRedirectResponse(redirectUri, {
    code: authorizationCode,
    state,
  });
}

export async function GET(request: Request) {
  return handleAuthorizeGet(request);
}
