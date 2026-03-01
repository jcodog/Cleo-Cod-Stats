import {
  getOAuthProtectedResourceMetadataUrl,
  getOAuthServerConfig,
} from "./config";
import {
  type OAuthAccessTokenClaims,
  verifyOAuthAccessTokenJwt,
} from "./jwt";

export type VerifiedOAuthAccessToken = OAuthAccessTokenClaims & {
  scopes: string[];
};

type VerifyOptions = {
  expectedAudiences?: string[];
};

type WwwAuthenticateOptions = {
  error?: string;
  errorDescription?: string;
  scope?: string;
};

export function extractBearerToken(request: Request) {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token) {
    return null;
  }

  if (scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
}

export function verifyOAuthAccessToken(
  token: string,
  requestOrigin: string,
  options?: VerifyOptions,
) {
  const config = getOAuthServerConfig(requestOrigin);

  const expectedAudiences =
    options?.expectedAudiences && options.expectedAudiences.length > 0
      ? options.expectedAudiences
      : Array.from(new Set([config.resource, config.audience]));

  const payload = verifyOAuthAccessTokenJwt(token, config.jwtSecret, {
    expectedIssuer: config.issuer,
    expectedAudiences,
  });

  return {
    ...payload,
    scopes: payload.scope
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  } satisfies VerifiedOAuthAccessToken;
}

export function buildOAuthWwwAuthenticate(
  requestOrigin: string,
  options?: WwwAuthenticateOptions,
) {
  const parts = [
    `resource_metadata="${getOAuthProtectedResourceMetadataUrl(requestOrigin)}"`,
  ];

  if (options?.scope) {
    parts.push(`scope="${options.scope}"`);
  }

  if (options?.error) {
    parts.push(`error="${options.error}"`);
  }

  if (options?.errorDescription) {
    parts.push(`error_description="${options.errorDescription}"`);
  }

  return `Bearer ${parts.join(", ")}`;
}
