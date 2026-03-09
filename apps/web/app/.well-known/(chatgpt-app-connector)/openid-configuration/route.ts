import { NextResponse } from "next/server";

import {
  buildOAuthAbsoluteUrlFromIssuer,
  getOAuthServerConfig,
  getOAuthSupportedScopes,
} from "@workspace/backend/server/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OpenID metadata env config error", error);
    const description =
      error instanceof Error ? error.message : "OAuth server is not configured";

    return NextResponse.json(
      {
        error: "server_error",
        error_description: description,
      },
      {
        status: 500,
      },
    );
  }

  const scopesSupported = getOAuthSupportedScopes(config.allowedScopes);

  return NextResponse.json(
    {
      issuer: config.issuer,
      authorization_endpoint: buildOAuthAbsoluteUrlFromIssuer(
        config.issuer,
        "/oauth/authorize",
      ),
      token_endpoint: buildOAuthAbsoluteUrlFromIssuer(config.issuer, "/oauth/token"),
      registration_endpoint: buildOAuthAbsoluteUrlFromIssuer(
        config.issuer,
        "/oauth/register",
      ),
      revocation_endpoint: buildOAuthAbsoluteUrlFromIssuer(
        config.issuer,
        "/oauth/revoke",
      ),
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256", "ES256", "HS256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: scopesSupported,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
