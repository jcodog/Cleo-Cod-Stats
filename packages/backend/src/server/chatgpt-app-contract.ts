import { buildOAuthAbsoluteUrlFromIssuer, getOAuthServerConfig } from "@workspace/backend/server/oauth/config";

export const CHATGPT_APP_VIEWS = {
  uiOpen: "ui.open",
  sessionCurrent: "session.current",
  sessionLast: "session.last",
  matchesHistory: "matches.history",
  matchesDetail: "matches.detail",
  rankLadder: "rank.ladder",
  rankProgress: "rank.progress",
  settings: "settings",
  statsSummary: "stats.summary",
  statsDaily: "stats.daily",
  statsRecent: "stats.recent",
} as const;

export type ChatGptAppView =
  (typeof CHATGPT_APP_VIEWS)[keyof typeof CHATGPT_APP_VIEWS];

export const CHATGPT_APP_ERROR_CODES = {
  unauthorized: "unauthorized",
  notLinked: "unauthorized",
  notFound: "not_found",
  validation: "invalid_request",
  rateLimit: "rate_limit",
  internal: "internal",
} as const;

export type ChatGptAppErrorCode =
  (typeof CHATGPT_APP_ERROR_CODES)[keyof typeof CHATGPT_APP_ERROR_CODES];

export const CHATGPT_APP_JSON_CONTENT_TYPE = "application/json; charset=utf-8";

export type ChatGptAppOAuthMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  scopes: string[];
};

export type ChatGptAppSuccessPayload<Data extends Record<string, unknown>> = {
  ok: true;
  view: ChatGptAppView;
  data: Data;
  meta: {
    generatedAt: number;
  };
};

export type ChatGptAppErrorPayload = {
  ok: false;
  error: {
    code: ChatGptAppErrorCode;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
  };
  oauth?: ChatGptAppOAuthMetadata;
  meta: {
    generatedAt: number;
  };
};

type ChatGptAppResponseInit = {
  status?: number;
  requestId?: string;
  headers?: HeadersInit;
};

type ChatGptAppErrorPayloadOptions = {
  requestId?: string;
  details?: Record<string, unknown>;
  oauth?: ChatGptAppOAuthMetadata;
  generatedAt?: number;
};

type ChatGptAppErrorResponseOptions = ChatGptAppResponseInit & {
  details?: Record<string, unknown>;
  oauth?: ChatGptAppOAuthMetadata;
};

type NormalizedChatGptAppError = {
  code: ChatGptAppErrorCode;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  oauth?: ChatGptAppOAuthMetadata;
};

type ChatGptAppRouteHandler<TArgs extends unknown[]> = (
  request: Request,
  ...args: TArgs
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getRequestIdFromRequest(request: Request) {
  const requestId = request.headers.get("x-request-id")?.trim();
  return requestId && requestId.length > 0 ? requestId : createChatGptAppRequestId();
}

function cloneResponseWithContractHeaders(response: Response, requestId: string) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", CHATGPT_APP_JSON_CONTENT_TYPE);
  headers.set("X-Request-Id", requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeChatGptAppThrownError(
  error: unknown,
  requestId: string,
): NormalizedChatGptAppError {
  if (error instanceof ChatGptAppRouteError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
      oauth: error.oauth,
    };
  }

  if (
    error instanceof Error &&
    error.name === "ZodError" &&
    isRecord(error) &&
    Array.isArray(error.issues)
  ) {
    return {
      code: CHATGPT_APP_ERROR_CODES.validation,
      message: "Invalid request payload.",
      status: 400,
      details: {
        issues: error.issues,
      },
    };
  }

  if (error instanceof SyntaxError) {
    return {
      code: CHATGPT_APP_ERROR_CODES.validation,
      message: "Invalid request payload.",
      status: 400,
    };
  }

  return {
    code: CHATGPT_APP_ERROR_CODES.internal,
    message: "CodStats is temporarily unavailable.",
    status: 502,
    details:
      error instanceof Error
        ? {
            cause: error.message,
            requestId,
          }
        : undefined,
  };
}

export function createChatGptAppSuccessPayload<Data extends Record<string, unknown>>(
  view: ChatGptAppView,
  data: Data,
  generatedAt = Date.now(),
): ChatGptAppSuccessPayload<Data> {
  return {
    ok: true,
    view,
    data,
    meta: {
      generatedAt,
    },
  };
}

export function createChatGptAppErrorPayload(
  code: ChatGptAppErrorCode,
  message: string,
  options?: ChatGptAppErrorPayloadOptions,
): ChatGptAppErrorPayload {
  const error: ChatGptAppErrorPayload["error"] = {
    code,
    message,
  };

  if (options?.requestId) {
    error.requestId = options.requestId;
  }

  if (options?.details) {
    error.details = options.details;
  }

  return {
    ok: false,
    error,
    ...(options?.oauth
      ? {
          oauth: options.oauth,
        }
      : {}),
    meta: {
      generatedAt: options?.generatedAt ?? Date.now(),
    },
  };
}

export class ChatGptAppRouteError extends Error {
  readonly code: ChatGptAppErrorCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly oauth?: ChatGptAppOAuthMetadata;

  constructor(
    code: ChatGptAppErrorCode,
    message: string,
    options?: {
      status?: number;
      details?: Record<string, unknown>;
      oauth?: ChatGptAppOAuthMetadata;
    },
  ) {
    super(message);
    this.name = "ChatGptAppRouteError";
    this.code = code;
    this.status = options?.status ?? getStatusForChatGptAppErrorCode(code);
    this.details = options?.details;
    this.oauth = options?.oauth;
  }
}

export function getStatusForChatGptAppErrorCode(code: ChatGptAppErrorCode) {
  switch (code) {
    case CHATGPT_APP_ERROR_CODES.validation:
      return 400;
    case CHATGPT_APP_ERROR_CODES.unauthorized:
      return 401;
    case CHATGPT_APP_ERROR_CODES.notFound:
      return 404;
    case CHATGPT_APP_ERROR_CODES.rateLimit:
      return 429;
    case CHATGPT_APP_ERROR_CODES.internal:
    default:
      return 502;
  }
}

export function createChatGptAppRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatGptAppJsonResponse(
  payload: Record<string, unknown>,
  options?: ChatGptAppResponseInit,
) {
  const headers = new Headers(options?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", CHATGPT_APP_JSON_CONTENT_TYPE);

  if (options?.requestId) {
    headers.set("X-Request-Id", options.requestId);
  }

  return new Response(JSON.stringify(payload), {
    status: options?.status ?? 200,
    headers,
  });
}

export function createChatGptAppSuccessResponse<Data extends Record<string, unknown>>(
  view: ChatGptAppView,
  data: Data,
  options?: ChatGptAppResponseInit,
) {
  return createChatGptAppJsonResponse(createChatGptAppSuccessPayload(view, data), {
    ...options,
    status: options?.status ?? 200,
  });
}

export function createChatGptAppErrorResponse(
  code: ChatGptAppErrorCode,
  message: string,
  options?: ChatGptAppErrorResponseOptions,
) {
  return createChatGptAppJsonResponse(
    createChatGptAppErrorPayload(code, message, {
      requestId: options?.requestId,
      details: options?.details,
      oauth: options?.oauth,
    }),
    {
      status: options?.status ?? getStatusForChatGptAppErrorCode(code),
      headers: options?.headers,
      requestId: options?.requestId,
    },
  );
}

export function resolveChatGptAppOAuthMetadata(
  requestOrigin: string,
  scopes: readonly string[] = [],
): ChatGptAppOAuthMetadata | undefined {
  try {
    const config = getOAuthServerConfig(requestOrigin);
    const normalizedScopes = Array.from(
      new Set(
        scopes
          .map((scope) => scope.trim())
          .filter((scope) => scope.length > 0),
      ),
    );

    return {
      issuer: config.issuer,
      authorization_endpoint: buildOAuthAbsoluteUrlFromIssuer(
        config.issuer,
        "/oauth/authorize",
      ),
      token_endpoint: buildOAuthAbsoluteUrlFromIssuer(config.issuer, "/oauth/token"),
      scopes: normalizedScopes,
    };
  } catch {
    return undefined;
  }
}

export function withChatGptAppRoute<TArgs extends unknown[]>(
  routeName: string,
  handler: ChatGptAppRouteHandler<TArgs>,
) {
  return async (request: Request, ...args: TArgs) => {
    const requestId = getRequestIdFromRequest(request);

    try {
      const response = await handler(request, ...args);
      return cloneResponseWithContractHeaders(response, requestId);
    } catch (error) {
      const requestUrl = new URL(request.url);
      const normalizedError = normalizeChatGptAppThrownError(error, requestId);

      console.error("[chatgpt-app] route failure", {
        route: routeName,
        requestId,
        method: request.method,
        path: requestUrl.pathname,
        code: normalizedError.code,
        message: normalizedError.message,
      });

      return createChatGptAppErrorResponse(
        normalizedError.code,
        normalizedError.message,
        {
          status: normalizedError.status,
          requestId,
          details: normalizedError.details,
          oauth: normalizedError.oauth,
        },
      );
    }
  };
}
