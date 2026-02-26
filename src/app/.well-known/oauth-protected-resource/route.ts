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
    console.error("OAuth protected resource metadata config error", error);
    return NextResponse.json(
      {
        error: "server_error",
      },
      {
        status: 500,
      },
    );
  }

  return NextResponse.json(
    {
      resource: config.resource,
      authorization_servers: [config.issuer],
      scopes_supported: config.allowedScopes ? Array.from(config.allowedScopes) : [],
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
