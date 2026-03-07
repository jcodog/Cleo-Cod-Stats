import { fetchMutation } from "convex/nextjs";

import { api } from "@workspace/backend/convex/_generated/api";
import {
  getOAuthServerConfig,
  isAllowedRedirectUri,
  normalizeRedirectUri,
} from "@workspace/backend/server/oauth/config";
import { generateRandomToken, sha256Base64Url } from "@workspace/backend/server/oauth/crypto";
import { oauthErrorResponse } from "@workspace/backend/server/oauth/http";
import { nowInSeconds } from "@workspace/backend/server/oauth/time";
import { assertScopesAllowed, parseScope } from "@workspace/backend/server/oauth/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_TOKEN_AUTH_METHODS = new Set([
  "none",
  "client_secret_post",
  "client_secret_basic",
]);
const SUPPORTED_GRANT_TYPES = new Set(["authorization_code", "refresh_token"]);
const SUPPORTED_RESPONSE_TYPES = new Set(["code"]);

type RegistrationPayload = {
  redirect_uris?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  scope?: unknown;
  client_name?: unknown;
  client_uri?: unknown;
};

function parseStringArray(rawValue: unknown, fieldName: string) {
  if (!Array.isArray(rawValue)) {
    throw new Error(`invalid_${fieldName}`);
  }

  const values = rawValue
    .map((value) => {
      if (typeof value !== "string") {
        throw new Error(`invalid_${fieldName}`);
      }

      return value.trim();
    })
    .filter((value) => value.length > 0);

  if (values.length === 0) {
    throw new Error(`invalid_${fieldName}`);
  }

  return Array.from(new Set(values));
}

function parseOptionalString(
  rawValue: unknown,
  fieldName: string,
  maxLength: number,
) {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  if (typeof rawValue !== "string") {
    throw new Error(`invalid_${fieldName}`);
  }

  const trimmed = rawValue.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`invalid_${fieldName}`);
  }

  return trimmed;
}

function normalizeAndValidateRedirectUris(
  redirectUris: string[],
  allowedRedirectUris: Set<string>,
) {
  return redirectUris.map((redirectUri) => {
    const normalizedRedirectUri = normalizeRedirectUri(redirectUri);
    if (!isAllowedRedirectUri(normalizedRedirectUri, allowedRedirectUris)) {
      throw new Error("invalid_redirect_uri");
    }

    return normalizedRedirectUri;
  });
}

function assertSupportedValues(
  values: string[],
  allowedValues: Set<string>,
  fieldName: string,
) {
  for (const value of values) {
    if (!allowedValues.has(value)) {
      throw new Error(`invalid_${fieldName}`);
    }
  }
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth register env config error", error);
    return oauthErrorResponse(
      "invalid_request",
      500,
      "OAuth server is not configured",
    );
  }

  let payload: RegistrationPayload;
  try {
    payload = (await request.json()) as RegistrationPayload;
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Invalid registration payload");
  }

  let redirectUris: string[];
  let tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
  let grantTypes: string[];
  let responseTypes: string[];
  let scope: string | undefined;
  let clientName: string | undefined;
  let clientUri: string | undefined;

  try {
    redirectUris = normalizeAndValidateRedirectUris(
      parseStringArray(payload.redirect_uris, "redirect_uris"),
      config.allowedRedirectUris,
    );

    const tokenMethodRaw = parseOptionalString(
      payload.token_endpoint_auth_method,
      "token_endpoint_auth_method",
      64,
    );
    tokenEndpointAuthMethod =
      (tokenMethodRaw as "none" | "client_secret_post" | "client_secret_basic") ??
      "none";

    if (!SUPPORTED_TOKEN_AUTH_METHODS.has(tokenEndpointAuthMethod)) {
      throw new Error("invalid_token_endpoint_auth_method");
    }

    grantTypes = payload.grant_types
      ? parseStringArray(payload.grant_types, "grant_types")
      : ["authorization_code", "refresh_token"];
    assertSupportedValues(grantTypes, SUPPORTED_GRANT_TYPES, "grant_types");

    if (!grantTypes.includes("authorization_code")) {
      throw new Error("invalid_grant_types");
    }

    responseTypes = payload.response_types
      ? parseStringArray(payload.response_types, "response_types")
      : ["code"];
    assertSupportedValues(responseTypes, SUPPORTED_RESPONSE_TYPES, "response_types");

    if (!responseTypes.includes("code")) {
      throw new Error("invalid_response_types");
    }

    const scopeRaw = parseOptionalString(payload.scope, "scope", 1000);
    if (scopeRaw) {
      const parsed = parseScope(scopeRaw);
      assertScopesAllowed(parsed.scopes, config.allowedScopes);
      scope = parsed.scope;
    }

    clientName = parseOptionalString(payload.client_name, "client_name", 200);

    const clientUriRaw = parseOptionalString(payload.client_uri, "client_uri", 500);
    clientUri = clientUriRaw
      ? normalizeRedirectUri(clientUriRaw)
      : undefined;
  } catch {
    return oauthErrorResponse("invalid_request", 400, "Invalid client metadata");
  }

  const clientId = `chatgpt_dcr_${generateRandomToken(24)}`;
  const generatedClientSecret =
    tokenEndpointAuthMethod === "none" ? undefined : generateRandomToken(48);

  try {
    await fetchMutation(api.mutations.oauth.registerClient, {
      clientId,
      clientSecretHash: generatedClientSecret
        ? sha256Base64Url(generatedClientSecret)
        : undefined,
      tokenEndpointAuthMethod,
      redirectUris,
      grantTypes,
      responseTypes,
      scope,
      clientName,
      clientUri,
    });
  } catch (error) {
    console.error("OAuth dynamic client registration failed", error);
    return oauthErrorResponse("invalid_request", 500, "Client registration failed");
  }

  const issuedAt = nowInSeconds();

  return Response.json(
    {
      client_id: clientId,
      client_id_issued_at: issuedAt,
      client_secret: generatedClientSecret,
      client_secret_expires_at: generatedClientSecret ? 0 : 0,
      redirect_uris: redirectUris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: tokenEndpointAuthMethod,
      scope,
      client_name: clientName,
      client_uri: clientUri,
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    },
  );
}
