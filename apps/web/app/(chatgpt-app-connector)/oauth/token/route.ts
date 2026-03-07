import { fetchMutation } from "convex/nextjs";

import { api } from "@workspace/backend/convex/_generated/api";
import {
  getOAuthServerConfig,
  isAllowedRedirectUri,
  normalizeResourceIdentifier,
  normalizeRedirectUri,
} from "@workspace/backend/server/oauth/config";
import {
  resolveOAuthClient,
  validateOAuthClientAuthentication,
  type ResolvedOAuthClient,
} from "@workspace/backend/server/oauth/clients";
import { generateRandomToken, sha256Base64Url } from "@workspace/backend/server/oauth/crypto";
import {
  getClientAuthenticationInput,
  getSingleSearchParam,
  oauthErrorResponse,
  oauthSuccessResponse,
  parseOAuthRequestBody,
} from "@workspace/backend/server/oauth/http";
import { signOAuthAccessToken } from "@workspace/backend/server/oauth/jwt";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  millisecondsFromNow,
  secondsFromNow,
} from "@workspace/backend/server/oauth/time";
import { assertScopesAllowed, parseScope } from "@workspace/backend/server/oauth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

type TokenResult = {
  userId: string;
  scopes: string[];
  refreshToken: string;
};

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

function buildTokenResponse(
  tokenResult: TokenResult,
  args: {
    jwtSecret: string;
    issuer: string;
    audience: string;
  },
) {
  const iat = secondsFromNow(0);
  const exp = secondsFromNow(ACCESS_TOKEN_TTL_SECONDS);
  const jti = generateRandomToken(24);
  const scope = tokenResult.scopes.join(" ");

  const accessToken = signOAuthAccessToken(
    {
      iss: args.issuer,
      aud: args.audience,
      sub: tokenResult.userId,
      iat,
      exp,
      scope,
      jti,
    },
    args.jwtSecret,
  );

  return oauthSuccessResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: tokenResult.refreshToken,
    scope,
  });
}

async function handleAuthorizationCodeGrant(
  params: URLSearchParams,
  args: {
    client: ResolvedOAuthClient;
    resource: string;
    jwtSecret: string;
    issuer: string;
    allowedRedirectUris: Set<string>;
    allowedScopes: Set<string> | null;
  },
) {
  const code = getSingleSearchParam(params, "code");
  if (!code || code.length < 32 || code.length > 512) {
    return oauthErrorResponse("invalid_grant", 400, "Invalid authorization code");
  }

  const redirectUriRaw = getSingleSearchParam(params, "redirect_uri");
  if (!redirectUriRaw) {
    return oauthErrorResponse("invalid_request", 400, "Missing redirect_uri");
  }

  let redirectUri: string;
  try {
    redirectUri = normalizeRedirectUri(redirectUriRaw);
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Invalid redirect_uri");
  }

  if (!isAllowedRedirectUri(redirectUri, args.allowedRedirectUris)) {
    return oauthErrorResponse("invalid_request", 400, "redirect_uri is not allowlisted");
  }

  if (!args.client.redirectUris.includes(redirectUri)) {
    return oauthErrorResponse(
      "invalid_grant",
      400,
      "redirect_uri is not registered for client",
    );
  }

  let requestedScopes: string[] | undefined;
  const scopeRaw = getSingleSearchParam(params, "scope");
  if (scopeRaw !== null) {
    try {
      const parsed = parseScope(scopeRaw);
      assertScopesAllowed(parsed.scopes, args.allowedScopes);
      requestedScopes = parsed.scopes;
    } catch {
      return oauthErrorResponse("invalid_scope", 400, "Invalid scope");
    }
  }

  const codeVerifier = getSingleSearchParam(params, "code_verifier");
  if (!codeVerifier) {
    return oauthErrorResponse("invalid_request", 400, "Missing code_verifier");
  }

  if (!CODE_VERIFIER_PATTERN.test(codeVerifier)) {
    return oauthErrorResponse("invalid_request", 400, "Invalid code_verifier");
  }

  const refreshToken = generateRandomToken(48);
  const refreshTokenHash = sha256Base64Url(refreshToken);

  let exchangeResult:
    | {
        ok: true;
        userId: string;
        scopes: string[];
      }
    | {
        ok: false;
        error: "invalid_grant" | "invalid_scope";
      };

  try {
    exchangeResult = await fetchMutation(api.mutations.oauth.exchangeAuthorizationCode, {
      clientId: args.client.clientId,
      resource: args.resource,
      codeHash: sha256Base64Url(code),
      redirectUri,
      codeVerifierHash: sha256Base64Url(codeVerifier),
      refreshTokenHash,
      refreshTokenExpiresAt: millisecondsFromNow(REFRESH_TOKEN_TTL_SECONDS),
      requestedScopes,
    });
  } catch (error) {
    console.error("OAuth token authorization_code exchange failed", error);
    return oauthErrorResponse("invalid_grant", 400, "Authorization code exchange failed");
  }

  if (!exchangeResult.ok) {
    return oauthErrorResponse(
      exchangeResult.error,
      400,
      exchangeResult.error === "invalid_scope" ? "Invalid scope" : "Invalid authorization code",
    );
  }

  return buildTokenResponse(
    {
      userId: exchangeResult.userId,
      scopes: exchangeResult.scopes,
      refreshToken,
    },
    {
      jwtSecret: args.jwtSecret,
      issuer: args.issuer,
      audience: args.resource,
    },
  );
}

async function handleRefreshTokenGrant(
  params: URLSearchParams,
  args: {
    client: ResolvedOAuthClient;
    resource: string;
    jwtSecret: string;
    issuer: string;
    allowedScopes: Set<string> | null;
  },
) {
  const refreshToken = getSingleSearchParam(params, "refresh_token");
  if (!refreshToken || refreshToken.length < 32 || refreshToken.length > 512) {
    return oauthErrorResponse("invalid_grant", 400, "Invalid refresh_token");
  }

  let requestedScopes: string[] | undefined;
  const scopeRaw = getSingleSearchParam(params, "scope");
  if (scopeRaw !== null) {
    try {
      const parsed = parseScope(scopeRaw);
      assertScopesAllowed(parsed.scopes, args.allowedScopes);
      requestedScopes = parsed.scopes;
    } catch {
      return oauthErrorResponse("invalid_scope", 400, "Invalid scope");
    }
  }

  const newRefreshToken = generateRandomToken(48);

  let rotateResult:
    | {
        ok: true;
        userId: string;
        scopes: string[];
      }
    | {
        ok: false;
        error: "invalid_grant" | "invalid_scope";
      };

  try {
    rotateResult = await fetchMutation(api.mutations.oauth.rotateRefreshToken, {
      clientId: args.client.clientId,
      resource: args.resource,
      refreshTokenHash: sha256Base64Url(refreshToken),
      newRefreshTokenHash: sha256Base64Url(newRefreshToken),
      newRefreshTokenExpiresAt: millisecondsFromNow(REFRESH_TOKEN_TTL_SECONDS),
      requestedScopes,
    });
  } catch (error) {
    console.error("OAuth token refresh_token exchange failed", error);
    return oauthErrorResponse("invalid_grant", 400, "Refresh token exchange failed");
  }

  if (!rotateResult.ok) {
    return oauthErrorResponse(
      rotateResult.error,
      400,
      rotateResult.error === "invalid_scope" ? "Invalid scope" : "Invalid refresh_token",
    );
  }

  return buildTokenResponse(
    {
      userId: rotateResult.userId,
      scopes: rotateResult.scopes,
      refreshToken: newRefreshToken,
    },
    {
      jwtSecret: args.jwtSecret,
      issuer: args.issuer,
      audience: args.resource,
    },
  );
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth token env config error", error);
    return oauthErrorResponse(
      "invalid_request",
      500,
      "OAuth server is not configured",
    );
  }

  let params: URLSearchParams;
  try {
    params = await parseOAuthRequestBody(request);
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Invalid request body");
  }

  let grantType: string | null;
  try {
    grantType = getSingleSearchParam(params, "grant_type");
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Duplicate grant_type");
  }

  if (!grantType) {
    return oauthErrorResponse("invalid_request", 400, "Missing grant_type");
  }

  let authInput;
  try {
    authInput = getClientAuthenticationInput(request, params);
  } catch {
    return invalidClientResponse();
  }

  const client = await resolveOAuthClient(authInput.clientId, requestUrl.origin);
  if (!client || !validateOAuthClientAuthentication(client, authInput)) {
    return invalidClientResponse();
  }

  if (!client.grantTypes.includes(grantType)) {
    return oauthErrorResponse("invalid_request", 400, "grant_type not allowed for client");
  }

  let resource: string | null;
  try {
    resource = getSingleSearchParam(params, "resource");
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Duplicate resource");
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
    return oauthErrorResponse(
      "invalid_request",
      400,
      "resource is required and must match configured resource server",
    );
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(params, {
      client,
      resource: normalizedResource,
      jwtSecret: config.jwtSecret,
      issuer: config.issuer,
      allowedRedirectUris: config.allowedRedirectUris,
      allowedScopes: config.allowedScopes,
    });
  }

  if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(params, {
      client,
      resource: normalizedResource,
      jwtSecret: config.jwtSecret,
      issuer: config.issuer,
      allowedScopes: config.allowedScopes,
    });
  }

  return oauthErrorResponse("invalid_request", 400, "Unsupported grant_type");
}
