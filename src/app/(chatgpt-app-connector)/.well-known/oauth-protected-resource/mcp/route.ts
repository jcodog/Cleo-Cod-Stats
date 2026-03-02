import { NextResponse } from "next/server";

import {
  buildOAuthAbsoluteUrlFromIssuer,
  getOAuthServerConfig,
  getOAuthSupportedScopes,
} from "@/lib/server/oauth/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  let config;
  try {
    config = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    console.error("OAuth protected resource metadata config error", error);
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
      resource: buildOAuthAbsoluteUrlFromIssuer(config.issuer, "/mcp"),
      authorization_servers: [config.issuer],
      scopes_supported: scopesSupported,
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_post",
        "client_secret_basic",
      ],
      resource_documentation: process.env.OAUTH_RESOURCE_DOCUMENTATION,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
