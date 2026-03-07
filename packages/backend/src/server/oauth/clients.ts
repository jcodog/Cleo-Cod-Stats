import { fetchQuery } from "convex/nextjs";

import { api } from "@workspace/backend/convex/_generated/api";

import { getOAuthServerConfig } from "./config";
import { safeStringEqual, sha256Base64Url } from "./crypto";
import type { OAuthClientAuthenticationInput } from "./http";

export type ResolvedOAuthClient = {
  clientId: string;
  tokenEndpointAuthMethod:
    | "none"
    | "client_secret_post"
    | "client_secret_basic";
  redirectUris: string[];
  grantTypes: string[];
  responseTypes: string[];
  scope?: string;
  type: "static" | "dynamic";
  clientSecretHash?: string;
  staticClientSecret?: string;
};

const STATIC_GRANT_TYPES = ["authorization_code", "refresh_token"];
const STATIC_RESPONSE_TYPES = ["code"];

export async function resolveOAuthClient(
  clientId: string,
  requestOrigin: string,
): Promise<ResolvedOAuthClient | null> {
  const config = getOAuthServerConfig(requestOrigin);

  if (
    config.staticClientId &&
    config.staticClientSecret &&
    safeStringEqual(clientId, config.staticClientId)
  ) {
    return {
      type: "static",
      clientId: config.staticClientId,
      tokenEndpointAuthMethod: "client_secret_post",
      redirectUris: Array.from(config.allowedRedirectUris),
      grantTypes: STATIC_GRANT_TYPES,
      responseTypes: STATIC_RESPONSE_TYPES,
      staticClientSecret: config.staticClientSecret,
    };
  }

  const dynamicClient = await fetchQuery(api.queries.oauth.getClientByClientId, {
    clientId,
  });

  if (!dynamicClient) {
    return null;
  }

  return {
    type: "dynamic",
    clientId: dynamicClient.clientId,
    tokenEndpointAuthMethod: dynamicClient.tokenEndpointAuthMethod,
    redirectUris: dynamicClient.redirectUris,
    grantTypes: dynamicClient.grantTypes,
    responseTypes: dynamicClient.responseTypes,
    scope: dynamicClient.scope,
    clientSecretHash: dynamicClient.clientSecretHash,
  };
}

export function validateOAuthClientAuthentication(
  client: ResolvedOAuthClient,
  authInput: OAuthClientAuthenticationInput,
) {
  if (client.type === "static") {
    if (!authInput.clientSecret || !client.staticClientSecret) {
      return false;
    }

    return safeStringEqual(authInput.clientSecret, client.staticClientSecret);
  }

  if (client.tokenEndpointAuthMethod === "none") {
    return authInput.clientSecret === null;
  }

  if (!authInput.clientSecret || !client.clientSecretHash) {
    return false;
  }

  return safeStringEqual(
    client.clientSecretHash,
    sha256Base64Url(authInput.clientSecret),
  );
}
