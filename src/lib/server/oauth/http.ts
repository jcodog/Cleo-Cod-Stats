import { NextResponse } from "next/server";

export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_grant"
  | "invalid_client"
  | "invalid_scope";

const OAUTH_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

type ClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export type OAuthClientAuthenticationInput = {
  clientId: string;
  clientSecret: string | null;
  usedBasicAuth: boolean;
};

export function oauthErrorResponse(
  error: OAuthErrorCode,
  status: number,
  description?: string,
  extraHeaders?: Record<string, string>,
) {
  const payload = description
    ? { error, error_description: description }
    : { error };

  return NextResponse.json(payload, {
    status,
    headers: {
      ...OAUTH_RESPONSE_HEADERS,
      ...(extraHeaders ?? {}),
    },
  });
}

export function oauthSuccessResponse(payload: Record<string, unknown>) {
  return NextResponse.json(payload, {
    headers: OAUTH_RESPONSE_HEADERS,
  });
}

export function authorizeRedirectResponse(
  redirectUri: string,
  params: Record<string, string>,
) {
  const url = new URL(redirectUri);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url.toString(), {
    headers: OAUTH_RESPONSE_HEADERS,
  });
}

export function getSingleSearchParam(
  params: URLSearchParams,
  key: string,
): string | null {
  const values = params.getAll(key);
  if (values.length === 0) {
    return null;
  }

  if (values.length > 1) {
    throw new Error(`duplicate_param:${key}`);
  }

  return values[0] ?? null;
}

function parseBasicAuthorizationHeader(
  authorizationHeader: string | null,
): ClientCredentials | null {
  if (!authorizationHeader) {
    return null;
  }

  if (!authorizationHeader.startsWith("Basic ")) {
    return null;
  }

  const encoded = authorizationHeader.slice("Basic ".length).trim();
  if (encoded.length === 0) {
    throw new Error("invalid_basic_auth");
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    throw new Error("invalid_basic_auth");
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex <= 0) {
    throw new Error("invalid_basic_auth");
  }

  const clientId = decoded.slice(0, separatorIndex);
  const clientSecret = decoded.slice(separatorIndex + 1);

  if (clientId.length === 0 || clientSecret.length === 0) {
    throw new Error("invalid_basic_auth");
  }

  return {
    clientId,
    clientSecret,
  };
}

export async function parseOAuthRequestBody(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const rawBody = await request.text();
    return new URLSearchParams(rawBody);
  }

  if (contentType.includes("application/json")) {
    const json = (await request.json()) as Record<string, unknown>;
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(json)) {
      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value !== "string") {
        throw new Error(`invalid_param_type:${key}`);
      }

      params.set(key, value);
    }

    return params;
  }

  const fallbackBody = await request.text();
  return new URLSearchParams(fallbackBody);
}

export function getClientCredentials(
  request: Request,
  params: URLSearchParams,
): ClientCredentials {
  const authInput = getClientAuthenticationInput(request, params);
  if (!authInput.clientSecret) {
    throw new Error("missing_client_credentials");
  }

  return {
    clientId: authInput.clientId,
    clientSecret: authInput.clientSecret,
  };
}

export function getClientAuthenticationInput(
  request: Request,
  params: URLSearchParams,
): OAuthClientAuthenticationInput {
  const basicCredentials = parseBasicAuthorizationHeader(
    request.headers.get("authorization"),
  );
  const bodyClientId = getSingleSearchParam(params, "client_id");
  const bodyClientSecret = getSingleSearchParam(params, "client_secret");

  if (basicCredentials) {
    if (bodyClientId && bodyClientId !== basicCredentials.clientId) {
      throw new Error("client_id_mismatch");
    }

    if (bodyClientSecret && bodyClientSecret !== basicCredentials.clientSecret) {
      throw new Error("client_secret_mismatch");
    }

    return {
      clientId: basicCredentials.clientId,
      clientSecret: basicCredentials.clientSecret,
      usedBasicAuth: true,
    };
  }

  if (!bodyClientId) {
    throw new Error("missing_client_id");
  }

  return {
    clientId: bodyClientId,
    clientSecret: bodyClientSecret,
    usedBasicAuth: false,
  };
}
