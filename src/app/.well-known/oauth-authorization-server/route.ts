import { NextResponse } from "next/server";

import { getOAuthServerConfig } from "@/lib/server/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth metadata env config error", error);
    return NextResponse.json(
      {
        error: "server_error",
      },
      {
        status: 500,
      },
    );
  }

  const scopesSupported = config.allowedScopes
    ? Array.from(config.allowedScopes)
    : [];

  return NextResponse.json(
    {
      issuer: config.issuer,
      authorization_endpoint: `${requestUrl.origin}/oauth/authorize`,
      token_endpoint: `${requestUrl.origin}/oauth/token`,
      revocation_endpoint: `${requestUrl.origin}/oauth/revoke`,
      registration_endpoint: `${requestUrl.origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      revocation_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      code_challenge_methods_supported: ["S256"],
      resource_parameter_supported: true,
      scopes_supported: scopesSupported,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
