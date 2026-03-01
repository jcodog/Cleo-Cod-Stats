import { NextResponse } from "next/server";

import {
  buildOAuthAbsoluteUrlFromIssuer,
  getOAuthServerConfig,
} from "@/lib/server/oauth/config";
import { resolveWidgetUiMeta } from "@/lib/server/widget-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildConfigErrorResponse(error: unknown) {
  const description =
    error instanceof Error ? error.message : "Unable to resolve ChatGPT app config";

  return NextResponse.json(
    {
      ok: false,
      error: "config_error",
      error_description: description,
    },
    {
      status: 500,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error: "not_found",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const requestUrl = new URL(request.url);

  let oauthConfig;
  try {
    oauthConfig = getOAuthServerConfig(requestUrl.origin);
  } catch (error) {
    return buildConfigErrorResponse(error);
  }

  let widgetUiMeta;
  try {
    widgetUiMeta = resolveWidgetUiMeta();
  } catch (error) {
    return buildConfigErrorResponse(error);
  }

  return NextResponse.json(
    {
      ok: true,
      oauthIssuer: oauthConfig.issuer,
      widgetDomain: widgetUiMeta.domain,
      widgetCsp: widgetUiMeta.csp,
      discoveryUrls: {
        authorizationServer: buildOAuthAbsoluteUrlFromIssuer(
          oauthConfig.issuer,
          "/.well-known/oauth-authorization-server",
        ),
        openIdConfiguration: buildOAuthAbsoluteUrlFromIssuer(
          oauthConfig.issuer,
          "/.well-known/openid-configuration",
        ),
        protectedResource: buildOAuthAbsoluteUrlFromIssuer(
          oauthConfig.issuer,
          "/.well-known/oauth-protected-resource",
        ),
        protectedResourceMcp: buildOAuthAbsoluteUrlFromIssuer(
          oauthConfig.issuer,
          "/.well-known/oauth-protected-resource/mcp",
        ),
      },
      mcpUrl: buildOAuthAbsoluteUrlFromIssuer(oauthConfig.issuer, "/mcp"),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
