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

export async function POST(request: Request) {
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

  const client = await resolveOAuthClient(authInput.clientId, requestUrl.origin);
  if (!client || !validateOAuthClientAuthentication(client, authInput)) {
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
    await fetchMutation(api.mutations.oauth.revokeByRefreshToken, {
      clientId: client.clientId,
      refreshTokenHash: sha256Base64Url(token),
    });
  } catch (error) {
    console.error("OAuth revoke failed", error);
    return oauthErrorResponse("invalid_request", 500, "Token revocation failed");
  }

  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      Pragma: "no-cache",
    },
  });
}
