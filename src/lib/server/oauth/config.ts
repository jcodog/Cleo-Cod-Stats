type OAuthServerConfig = {
  staticClientId: string | null;
  staticClientSecret: string | null;
  jwtSecret: string;
  audience: string;
  issuer: string;
  resource: string;
  allowedRedirectUris: Set<string>;
  allowedScopes: Set<string> | null;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalizeAbsoluteUrl(rawUrl: string, fieldName: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL in ${fieldName}`);
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`Unsupported protocol in ${fieldName}`);
  }

  return url.toString();
}

export function normalizeResourceIdentifier(rawResource: string) {
  const normalized = normalizeAbsoluteUrl(rawResource, "resource");
  const url = new URL(normalized);

  if (url.pathname === "/" && !url.search && !url.hash) {
    return url.origin;
  }

  return normalized;
}

function parseAllowedRedirectUris() {
  const csv = requireEnv("OAUTH_ALLOWED_REDIRECT_URIS");
  const values = parseCsv(csv);

  if (values.length === 0) {
    throw new Error("OAUTH_ALLOWED_REDIRECT_URIS must include at least one URI");
  }

  return new Set(
    values.map((value) => normalizeAbsoluteUrl(value, "OAUTH_ALLOWED_REDIRECT_URIS")),
  );
}

function parseAllowedScopes() {
  const raw = process.env.OAUTH_ALLOWED_SCOPES?.trim();
  if (!raw) {
    return null;
  }

  const scopes = parseCsv(raw);
  if (scopes.length === 0) {
    return null;
  }

  return new Set(scopes);
}

export function getOAuthServerConfig(requestOrigin: string): OAuthServerConfig {
  const fallbackOrigin = normalizeResourceIdentifier(requestOrigin);
  const resource = process.env.OAUTH_RESOURCE
    ? normalizeResourceIdentifier(process.env.OAUTH_RESOURCE)
    : fallbackOrigin;

  const audienceFromEnv = optionalEnv("OAUTH_AUDIENCE");
  const audience = audienceFromEnv ?? resource;
  if (audienceFromEnv && audienceFromEnv !== resource) {
    throw new Error(
      "OAUTH_AUDIENCE must match OAUTH_RESOURCE for Apps SDK resource binding",
    );
  }

  const issuer = process.env.OAUTH_ISSUER
    ? normalizeAbsoluteUrl(process.env.OAUTH_ISSUER, "OAUTH_ISSUER")
    : fallbackOrigin;

  const staticClientId = optionalEnv("OAUTH_CLIENT_ID");
  const staticClientSecret = optionalEnv("OAUTH_CLIENT_SECRET");
  if (Boolean(staticClientId) !== Boolean(staticClientSecret)) {
    throw new Error(
      "OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET must be set together, or both omitted",
    );
  }

  return {
    staticClientId,
    staticClientSecret,
    jwtSecret: requireEnv("OAUTH_JWT_SECRET"),
    audience,
    issuer,
    resource,
    allowedRedirectUris: parseAllowedRedirectUris(),
    allowedScopes: parseAllowedScopes(),
  };
}

export function normalizeRedirectUri(rawRedirectUri: string) {
  return normalizeAbsoluteUrl(rawRedirectUri, "redirect_uri");
}

export function isAllowedRedirectUri(
  redirectUri: string,
  allowedRedirectUris: Set<string>,
) {
  return allowedRedirectUris.has(redirectUri);
}

export function getOAuthProtectedResourceMetadataUrl(requestOrigin: string) {
  const origin = normalizeResourceIdentifier(requestOrigin);
  const url = new URL(origin);
  return `${url.origin}/.well-known/oauth-protected-resource`;
}
