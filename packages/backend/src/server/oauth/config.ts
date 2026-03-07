import { CHATGPT_APP_SCOPES } from "@workspace/backend/server/chatgpt-app-scopes";

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

const REFRESH_TOKEN_SCOPE = "offline_access";
const ENFORCED_CHATGPT_APP_SCOPES = [
  CHATGPT_APP_SCOPES.profileRead,
  CHATGPT_APP_SCOPES.statsRead,
] as const;

let didWarnMissingIssuer = false;
let didWarnIssuerOriginMismatch = false;

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

function normalizeOrigin(rawUrl: string, fieldName: string) {
  const normalized = normalizeAbsoluteUrl(rawUrl, fieldName);
  const url = new URL(normalized);

  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      `${fieldName} must be an origin URL without path, query, or fragment`,
    );
  }

  return {
    input: rawUrl.trim(),
    origin: url.origin,
  };
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

  const scopeSet = new Set(scopes);

  for (const requiredScope of ENFORCED_CHATGPT_APP_SCOPES) {
    if (!scopeSet.has(requiredScope)) {
      throw new Error(
        `OAUTH_ALLOWED_SCOPES must include required scope: ${requiredScope}`,
      );
    }
  }

  scopeSet.add(REFRESH_TOKEN_SCOPE);

  return scopeSet;
}

function resolveIssuer(requestOrigin: string) {
  const rawIssuer = optionalEnv("OAUTH_ISSUER");

  if (!rawIssuer) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Missing required env var: OAUTH_ISSUER. Set OAUTH_ISSUER to your canonical HTTPS app origin (for example https://stats.cleoai.cloud).",
      );
    }

    if (!didWarnMissingIssuer) {
      didWarnMissingIssuer = true;
      console.warn(
        "OAUTH_ISSUER is not set. Falling back to request origin in non-production.",
      );
    }

    const fallbackOrigin = normalizeResourceIdentifier(requestOrigin);
    return {
      issuer: fallbackOrigin,
      origin: new URL(fallbackOrigin).origin,
    };
  }

  const issuer = normalizeOrigin(rawIssuer, "OAUTH_ISSUER");
  const requestUrl = new URL(normalizeResourceIdentifier(requestOrigin));

  if (requestUrl.origin !== issuer.origin) {
    const message =
      `Request origin ${requestUrl.origin} does not match configured OAUTH_ISSUER origin ${issuer.origin}. ` +
      "Refusing to serve OAuth discovery metadata with a swapped issuer.";

    if (process.env.NODE_ENV === "production") {
      throw new Error(message);
    }

    if (!didWarnIssuerOriginMismatch) {
      didWarnIssuerOriginMismatch = true;
      console.warn(`${message} Continuing in non-production.`);
    }
  }

  return {
    issuer: issuer.input,
    origin: issuer.origin,
  };
}

export function getOAuthSupportedScopes(allowedScopes: Set<string> | null) {
  const scopeSet = new Set<string>(ENFORCED_CHATGPT_APP_SCOPES);

  for (const scope of allowedScopes ?? []) {
    scopeSet.add(scope);
  }

  scopeSet.add(REFRESH_TOKEN_SCOPE);

  return Array.from(scopeSet);
}

export function buildOAuthAbsoluteUrlFromIssuer(issuer: string, path: string) {
  return new URL(path, issuer).toString();
}

export function getOAuthServerConfig(requestOrigin: string): OAuthServerConfig {
  const issuer = resolveIssuer(requestOrigin);
  const resource = process.env.OAUTH_RESOURCE
    ? normalizeResourceIdentifier(process.env.OAUTH_RESOURCE)
    : normalizeResourceIdentifier(issuer.issuer);

  const audienceFromEnv = optionalEnv("OAUTH_AUDIENCE");
  const audience = audienceFromEnv ?? resource;
  if (audienceFromEnv && audienceFromEnv !== resource) {
    throw new Error(
      "OAUTH_AUDIENCE must match OAUTH_RESOURCE for Apps SDK resource binding",
    );
  }

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
    issuer: issuer.issuer,
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
  const issuer = resolveIssuer(requestOrigin);
  return buildOAuthAbsoluteUrlFromIssuer(
    issuer.issuer,
    "/.well-known/oauth-protected-resource",
  );
}
