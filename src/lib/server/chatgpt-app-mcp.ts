import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type {
  CallToolResult,
  IsomorphicHeaders,
  ServerNotification,
  ServerRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  getAppPublicOrigin,
  getCodstatsTemplateResourceUri,
  getCodstatsTemplateUrl,
  type CodstatsTemplateName,
} from "@/lib/server/app-public-origin";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
  createChatGptAppErrorPayload,
  createChatGptAppSuccessPayload,
  type ChatGptAppErrorCode,
  type ChatGptAppErrorPayload,
  type ChatGptAppSuccessPayload,
} from "@/lib/server/chatgpt-app-contract";
import {
  getCodstatsTemplateCatalog,
  getCodstatsTemplateResourceMeta,
  renderCodstatsTemplateHtml,
} from "@/lib/server/chatgpt-app-ui-templates";
import { attachCodstatsUiToPayload } from "@/lib/server/chatgpt-app-ui";
import { CHATGPT_APP_TOOL_SECURITY_SCHEMES } from "@/lib/server/chatgpt-app-scopes";

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type ContractSuccess = ChatGptAppSuccessPayload<Record<string, unknown>>;
type ContractError = ChatGptAppErrorPayload;

type ApiCallResult =
  | {
      ok: true;
      payload: ContractSuccess;
    }
  | {
      ok: false;
      result: CallToolResult;
    };

const NO_AUTH_SECURITY_SCHEMES = [{ type: "noauth" }] as const;

const TOOL_TEMPLATE_MAP = {
  codstats_open: "widget",
  codstats_get_current_session: "session",
  codstats_get_last_session: "session",
  codstats_get_match_history: "matches",
  codstats_get_rank_progress: "rank",
  codstats_get_settings: "settings",
} as const satisfies Partial<Record<string, CodstatsTemplateName>>;

const CHATGPT_APP_TOOL_NAMES = [
  "codstats_open",
  "codstats_get_current_session",
  "codstats_get_last_session",
  "codstats_get_match_history",
  "codstats_get_match",
  "codstats_get_rank_ladder",
  "codstats_get_rank_progress",
  "codstats_get_settings",
  "codstats_disconnect",
] as const;

type ChatGptAppToolName = (typeof CHATGPT_APP_TOOL_NAMES)[number];

export type ChatGptAppToolTemplateDebugEntry = {
  name: ChatGptAppToolName;
  resourceUri: string | null;
  outputTemplate: string | null;
  hostedTemplateUrl: string | null;
};

function getToolTemplateName(toolName: ChatGptAppToolName): CodstatsTemplateName | null {
  const templateMap =
    TOOL_TEMPLATE_MAP as Partial<Record<ChatGptAppToolName, CodstatsTemplateName>>;
  return templateMap[toolName] ?? null;
}

export function getChatGptAppToolTemplateDebugEntries(requestOrigin?: string) {
  return CHATGPT_APP_TOOL_NAMES.map((toolName) => {
    const templateName = getToolTemplateName(toolName);

    return {
      name: toolName,
      resourceUri: templateName ? getCodstatsTemplateResourceUri(templateName) : null,
      outputTemplate: templateName ? getCodstatsTemplateResourceUri(templateName) : null,
      hostedTemplateUrl: templateName ? getCodstatsTemplateUrl(templateName, requestOrigin) : null,
    } satisfies ChatGptAppToolTemplateDebugEntry;
  });
}

function buildTextContent(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

function buildToolError(
  code: ChatGptAppErrorCode,
  message: string,
  options?: {
    wwwAuthenticate?: string;
    requestId?: string;
    details?: Record<string, unknown>;
  },
): CallToolResult {
  const neutralText =
    code === CHATGPT_APP_ERROR_CODES.internal
      ? "CodStats data is temporarily unavailable."
      : message;
  const meta: Record<string, unknown> = {};

  if (options?.wwwAuthenticate) {
    meta["mcp/www_authenticate"] = [options.wwwAuthenticate];
  }

  if (options?.requestId) {
    meta.codstats = {
      requestId: options.requestId,
    };
  }

  return {
    isError: true,
    structuredContent: createChatGptAppErrorPayload(code, message, {
      requestId: options?.requestId,
      details: options?.details,
    }),
    content: buildTextContent(neutralText),
    _meta: Object.keys(meta).length > 0 ? meta : undefined,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asInteger(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function getHeaderValue(
  headers: IsomorphicHeaders | undefined,
  targetHeaderName: string,
) {
  if (!headers) {
    return null;
  }

  const expectedHeaderName = targetHeaderName.toLowerCase();

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== expectedHeaderName) {
      continue;
    }

    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  return null;
}

function resolveApiOrigin(extra: ToolExtra) {
  return extra.requestInfo?.url?.origin ?? getAppPublicOrigin();
}

type CreateChatGptAppMcpServerOptions = {
  requestOrigin?: string;
};

function parseContractSuccess(payload: Record<string, unknown>): ContractSuccess | null {
  const view = payload.view;
  const data = payload.data;
  const meta = asRecord(payload.meta);

  if (
    payload.ok === true &&
    typeof view === "string" &&
    data !== null &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    typeof meta?.generatedAt === "number"
  ) {
    return payload as ContractSuccess;
  }

  return null;
}

function parseContractError(payload: Record<string, unknown>): ContractError | null {
  const error = asRecord(payload.error);
  const meta = asRecord(payload.meta);

  if (
    payload.ok === false &&
    typeof error?.code === "string" &&
    typeof error?.message === "string" &&
    typeof meta?.generatedAt === "number"
  ) {
    return payload as ContractError;
  }

  return null;
}

function summarizeContractView(payload: ContractSuccess) {
  switch (payload.view) {
    case CHATGPT_APP_VIEWS.uiOpen:
      return "CodStats opened.";
    case CHATGPT_APP_VIEWS.sessionCurrent:
      return payload.data.active === false
        ? "No active session."
        : "Current session loaded.";
    case CHATGPT_APP_VIEWS.sessionLast:
      return payload.data.found === false
        ? "No completed session found."
        : "Last session loaded.";
    case CHATGPT_APP_VIEWS.matchesHistory:
      return "Match history loaded.";
    case CHATGPT_APP_VIEWS.matchesDetail:
      return "Match details loaded.";
    case CHATGPT_APP_VIEWS.rankLadder:
      return "Rank ladder loaded.";
    case CHATGPT_APP_VIEWS.rankProgress:
      return "Rank progress loaded.";
    case CHATGPT_APP_VIEWS.settings:
      return "Settings loaded.";
    default:
      return "CodStats data loaded.";
  }
}

function getResponseRequestId(response: Response): string | undefined {
  const candidates = [
    response.headers.get("x-request-id"),
    response.headers.get("request-id"),
    response.headers.get("x-vercel-id"),
  ];

  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

function logContractApiFailure(args: {
  endpointPath: string;
  method: string;
  reason: string;
  status?: number;
  requestId?: string;
  message?: string;
}) {
  console.error("[chatgpt-app] upstream API failure", {
    endpointPath: args.endpointPath,
    method: args.method,
    reason: args.reason,
    status: args.status,
    requestId: args.requestId,
    message: args.message,
  });
}

async function requestContractApi(
  extra: ToolExtra,
  endpointPath: string,
  init?: RequestInit,
): Promise<ApiCallResult> {
  const apiOrigin = resolveApiOrigin(extra);
  const endpointUrl = new URL(endpointPath, apiOrigin);
  const authorization = getHeaderValue(extra.requestInfo?.headers, "authorization");
  const method = init?.method ?? "GET";

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (authorization) {
    headers.Authorization = authorization;
  }

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(endpointUrl, {
      method,
      cache: "no-store",
      signal: extra.signal,
      headers,
      body: init?.body,
    });
  } catch (error) {
    logContractApiFailure({
      endpointPath,
      method,
      reason: "network_failure",
      message: error instanceof Error ? error.message : String(error),
    });

    return {
      ok: false,
      result: buildToolError(
        CHATGPT_APP_ERROR_CODES.internal,
        "Unable to reach CodStats API.",
        {
          details: {
            reason: "network_failure",
          },
        },
      ),
    };
  }

  const requestId = getResponseRequestId(response);
  const wwwAuthenticate = response.headers.get("www-authenticate") ?? undefined;
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.includes("application/json")) {
    if (!response.ok && wwwAuthenticate) {
      logContractApiFailure({
        endpointPath,
        method,
        reason: "oauth_challenge_non_json",
        status: response.status,
        requestId,
      });

      return {
        ok: false,
        result: buildToolError(CHATGPT_APP_ERROR_CODES.unauthorized, "Authentication required.", {
          wwwAuthenticate,
          requestId,
          details: {
            reason: "oauth_challenge",
            status: response.status,
          },
        }),
      };
    }

    logContractApiFailure({
      endpointPath,
      method,
      reason: "non_json_response",
      status: response.status,
      requestId,
      message: contentType,
    });

    return {
      ok: false,
      result: buildToolError(
        CHATGPT_APP_ERROR_CODES.internal,
        response.ok
          ? "CodStats API returned non-JSON response."
          : `CodStats API request failed with status ${response.status}.`,
        {
          requestId,
          details: {
            reason: "non_json_response",
            status: response.status,
          },
          ...(wwwAuthenticate
            ? {
                wwwAuthenticate,
              }
            : {}),
        },
      ),
    };
  }

  let parsedJson: unknown;

  try {
    parsedJson = await response.json();
  } catch {
    logContractApiFailure({
      endpointPath,
      method,
      reason: "json_parse_failure",
      status: response.status,
      requestId,
    });

    return {
      ok: false,
      result: buildToolError(
        CHATGPT_APP_ERROR_CODES.internal,
        "CodStats API returned malformed JSON.",
        {
          requestId,
          details: {
            reason: "json_parse_failure",
            status: response.status,
          },
          ...(wwwAuthenticate
            ? {
                wwwAuthenticate,
              }
            : {}),
        },
      ),
    };
  }

  const payloadRecord = asRecord(parsedJson);

  if (!payloadRecord) {
    if (!response.ok && wwwAuthenticate) {
      logContractApiFailure({
        endpointPath,
        method,
        reason: "oauth_challenge_non_contract",
        status: response.status,
        requestId,
      });

      return {
        ok: false,
        result: buildToolError(CHATGPT_APP_ERROR_CODES.unauthorized, "Authentication required.", {
          wwwAuthenticate,
          requestId,
          details: {
            reason: "oauth_challenge",
            status: response.status,
          },
        }),
      };
    }

    logContractApiFailure({
      endpointPath,
      method,
      reason: "non_object_json",
      status: response.status,
      requestId,
    });

    return {
      ok: false,
      result: buildToolError(
        CHATGPT_APP_ERROR_CODES.internal,
        response.ok
          ? "CodStats API returned malformed contract payload."
          : `CodStats API request failed with status ${response.status}.`,
        {
          requestId,
          details: {
            reason: "non_object_json",
            status: response.status,
          },
          ...(wwwAuthenticate
            ? {
                wwwAuthenticate,
              }
            : {}),
        },
      ),
    };
  }

  const parsedSuccess = parseContractSuccess(payloadRecord);
  const parsedError = parseContractError(payloadRecord);

  if (response.ok && parsedSuccess) {
    return {
      ok: true,
      payload: parsedSuccess,
    };
  }

  if (parsedError) {
    return {
      ok: false,
      result: buildToolError(
        parsedError.error.code,
        parsedError.error.message,
        {
          requestId,
          ...(wwwAuthenticate
            ? {
                wwwAuthenticate,
              }
            : {}),
          details: {
            reason: "contract_error_payload",
            status: response.status,
          },
        },
      ),
    };
  }

  if (!response.ok && wwwAuthenticate) {
    logContractApiFailure({
      endpointPath,
      method,
      reason: "oauth_challenge_unparsed",
      status: response.status,
      requestId,
    });

    return {
      ok: false,
      result: buildToolError(CHATGPT_APP_ERROR_CODES.unauthorized, "Authentication required.", {
        wwwAuthenticate,
        requestId,
        details: {
          reason: "oauth_challenge",
          status: response.status,
        },
      }),
    };
  }

  if (!response.ok) {
    logContractApiFailure({
      endpointPath,
      method,
      reason: "http_error",
      status: response.status,
      requestId,
    });

    return {
      ok: false,
      result: buildToolError(
        CHATGPT_APP_ERROR_CODES.internal,
        `CodStats API request failed with status ${response.status}.`,
        {
          requestId,
          details: {
            reason: "http_error",
            status: response.status,
          },
        },
      ),
    };
  }

  logContractApiFailure({
    endpointPath,
    method,
    reason: "malformed_contract_payload",
    status: response.status,
    requestId,
  });

  return {
    ok: false,
    result: buildToolError(
      CHATGPT_APP_ERROR_CODES.internal,
      "CodStats API returned malformed contract payload.",
      {
        requestId,
        details: {
          reason: "malformed_contract_payload",
          status: response.status,
        },
      },
    ),
  };
}

async function fetchContractToolPayload(
  extra: ToolExtra,
  endpointPath: string,
  requestOrigin: string,
  init?: RequestInit,
): Promise<CallToolResult> {
  const result = await requestContractApi(extra, endpointPath, init);

  if (!result.ok) {
    return result.result;
  }

  const withUi = attachCodstatsUiToPayload(result.payload, requestOrigin);

  return {
    structuredContent: withUi.structuredContent,
    content: buildTextContent(summarizeContractView(withUi.structuredContent)),
    _meta: withUi.meta,
  };
}

function createToolMeta(args: {
  templateName?: CodstatsTemplateName;
  securitySchemes?: readonly unknown[];
}) {
  const templateUri = args.templateName
    ? getCodstatsTemplateResourceUri(args.templateName)
    : null;

  return {
    ...(templateUri
      ? {
          ui: {
            resourceUri: templateUri,
          },
          "openai/outputTemplate": templateUri,
        }
      : {}),
    ...(args.securitySchemes
      ? {
          securitySchemes: args.securitySchemes,
        }
      : {}),
  };
}

function withHistoryQuery(params: { cursor?: string; limit?: number }) {
  const queryParams = new URLSearchParams();

  if (params.cursor && params.cursor.trim().length > 0) {
    queryParams.set("cursor", params.cursor);
  }

  if (typeof params.limit === "number" && Number.isFinite(params.limit)) {
    const clampedLimit = Math.min(15, Math.max(1, Math.trunc(params.limit)));
    queryParams.set("limit", String(clampedLimit));
  }

  const queryString = queryParams.toString();
  return queryString.length > 0
    ? `/api/app/stats/matches?${queryString}`
    : "/api/app/stats/matches";
}

type DashboardSnapshot = {
  session: {
    srCurrent: number | null;
    srChange: number | null;
    matches: number | null;
    wins: number | null;
    losses: number | null;
    kd: number | null;
    kills: number | null;
    deaths: number | null;
    bestStreak: number | null;
    startedAt: number | null;
  };
  rank: {
    currentRank: string | null;
    currentSr: number | null;
    nextTierTarget: string | null;
    nextDivisionTarget: string | null;
    nextRankTarget: string | null;
    srNeeded: number | null;
  };
  recentMatches: Array<{
    mode: string | null;
    outcome: string | null;
    srDelta: number | null;
    kd: number | null;
    playedAt: number | null;
  }>;
  connection: {
    connected: boolean;
    status: string;
    actionsHint: string;
  };
};

function createEmptyDashboardSnapshot(): DashboardSnapshot {
  return {
    session: {
      srCurrent: null,
      srChange: null,
      matches: null,
      wins: null,
      losses: null,
      kd: null,
      kills: null,
      deaths: null,
      bestStreak: null,
      startedAt: null,
    },
    rank: {
      currentRank: null,
      currentSr: null,
      nextTierTarget: null,
      nextDivisionTarget: null,
      nextRankTarget: null,
      srNeeded: null,
    },
    recentMatches: [],
    connection: {
      connected: false,
      status: "Disconnected",
      actionsHint: "Open settings to connect your CodStats account.",
    },
  };
}

function buildRankLabel(value: Record<string, unknown> | null): string | null {
  if (!value) {
    return null;
  }

  const displayName = asString(value.displayName);
  if (displayName) {
    return displayName;
  }

  const rank = asString(value.rank);
  if (!rank) {
    return null;
  }

  const division = asString(value.division);
  return division ? `${rank} ${division}` : rank;
}

function hydrateDashboardSession(snapshot: DashboardSnapshot, payload: ContractSuccess) {
  const data = asRecord(payload.data);
  const session = asRecord(data?.session);

  if (!session) {
    return;
  }

  const wins = asInteger(session.wins);
  const losses = asInteger(session.losses);

  snapshot.session.srCurrent = asNumber(session.srCurrent);
  snapshot.session.srChange =
    asNumber(session.srChange) ?? asNumber(session.srDelta) ?? asNumber(session.delta);
  snapshot.session.wins = wins;
  snapshot.session.losses = losses;
  snapshot.session.matches =
    wins !== null && losses !== null ? Math.max(0, wins + losses) : asInteger(session.matches);
  snapshot.session.kd = asNumber(session.kd);
  snapshot.session.kills = asInteger(session.kills);
  snapshot.session.deaths = asInteger(session.deaths);
  snapshot.session.bestStreak = asInteger(session.bestStreak);
  snapshot.session.startedAt = asNumber(session.startedAt);
}

function hydrateDashboardRank(snapshot: DashboardSnapshot, payload: ContractSuccess) {
  const data = asRecord(payload.data);
  const current = asRecord(data?.current);
  const nextTier =
    asRecord(data?.next) ??
    asRecord(data?.nextDivision) ??
    asRecord(data?.nextRank);
  const nextDivision = asRecord(data?.nextDivision) ?? nextTier;
  const nextRank = asRecord(data?.nextRank) ?? nextDivision;

  snapshot.rank.currentRank = buildRankLabel(current);
  snapshot.rank.currentSr = asNumber(data?.currentSr) ?? snapshot.session.srCurrent;

  snapshot.rank.nextTierTarget = buildRankLabel(nextTier);
  snapshot.rank.nextDivisionTarget = buildRankLabel(nextDivision);
  snapshot.rank.nextRankTarget = buildRankLabel(nextRank);
  snapshot.rank.srNeeded =
    asInteger(data?.srToNextTier) ??
    asInteger(nextDivision?.srNeeded) ??
    asInteger(nextRank?.srNeeded) ??
    null;
}

function hydrateDashboardMatches(snapshot: DashboardSnapshot, payload: ContractSuccess) {
  const data = asRecord(payload.data);

  snapshot.recentMatches = asArray(data?.items)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null)
    .slice(0, 5)
    .map((item) => ({
      mode: asString(item.mode),
      outcome: asString(item.outcome),
      srDelta:
        asNumber(item.srDelta) ?? asNumber(item.srChange) ?? asNumber(item.delta),
      kd: asNumber(item.kd),
      playedAt: asNumber(item.playedAt),
    }));
}

function hydrateDashboardConnection(snapshot: DashboardSnapshot, payload: ContractSuccess) {
  const data = asRecord(payload.data);
  const connected = asBoolean(data?.connected);

  snapshot.connection.connected = connected;
  snapshot.connection.status = connected ? "Connected" : "Disconnected";
  snapshot.connection.actionsHint = connected
    ? "Open settings to review connection details. Disconnect revokes this ChatGPT link."
    : "Open settings to connect your CodStats account. Disconnect becomes available once linked.";
}

async function buildOpenDashboardSnapshot(extra: ToolExtra): Promise<DashboardSnapshot> {
  const snapshot = createEmptyDashboardSnapshot();
  const authorization = getHeaderValue(extra.requestInfo?.headers, "authorization");

  if (!authorization) {
    return snapshot;
  }

  const [sessionResult, rankResult, matchesResult, settingsResult] = await Promise.all([
    requestContractApi(extra, "/api/app/stats/session/current"),
    requestContractApi(extra, "/api/app/stats/rank/progress"),
    requestContractApi(extra, withHistoryQuery({ limit: 5 })),
    requestContractApi(extra, "/api/app/profile"),
  ]);

  if (sessionResult.ok) {
    hydrateDashboardSession(snapshot, sessionResult.payload);
  }

  if (rankResult.ok) {
    hydrateDashboardRank(snapshot, rankResult.payload);
  }

  if (matchesResult.ok) {
    hydrateDashboardMatches(snapshot, matchesResult.payload);
  }

  if (settingsResult.ok) {
    hydrateDashboardConnection(snapshot, settingsResult.payload);
  }

  return snapshot;
}

export function createChatGptAppMcpServer(
  options: CreateChatGptAppMcpServerOptions = {},
) {
  const server = new McpServer({
    name: "codstats-app",
    version: "2.0.0",
  });

  const requestOrigin = getAppPublicOrigin(options.requestOrigin);
  const templateCatalog = getCodstatsTemplateCatalog(requestOrigin);
  const templateResourceMeta = getCodstatsTemplateResourceMeta(requestOrigin);

  for (const template of templateCatalog) {
    registerAppResource(
      server,
      template.title,
      template.resourceUri,
      {
        description: template.description,
        _meta: templateResourceMeta,
      },
      async () => ({
        contents: [
          {
            uri: template.resourceUri,
            mimeType: RESOURCE_MIME_TYPE,
            text: renderCodstatsTemplateHtml(template.name, requestOrigin),
            _meta: {
              ...templateResourceMeta,
              "openai/widgetDescription": template.description,
            },
          },
        ],
      }),
    );
  }

  registerAppTool(
    server,
    "codstats_open",
    {
      title: "Open CodStats",
      description: "Open the CodStats app widget.",
      inputSchema: {
        tab: z.enum(["overview", "matches", "rank", "settings"]).optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "widget",
        securitySchemes: NO_AUTH_SECURITY_SCHEMES,
      }),
    },
    async ({ tab }, extra) => {
      const dashboard = await buildOpenDashboardSnapshot(extra);
      const payload = createChatGptAppSuccessPayload(CHATGPT_APP_VIEWS.uiOpen, {
        tab: tab ?? "overview",
        dashboard,
      });
      const withUi = attachCodstatsUiToPayload(payload, requestOrigin);

      return {
        structuredContent: withUi.structuredContent,
        content: buildTextContent("CodStats opened."),
        _meta: withUi.meta,
      };
    },
  );

  registerAppTool(
    server,
    "codstats_get_current_session",
    {
      title: "Get Current Session",
      description: "Fetch only the currently active CodStats session.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "session",
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.currentSession,
      }),
    },
    async (_args, extra) => {
      return fetchContractToolPayload(
        extra,
        "/api/app/stats/session/current",
        requestOrigin,
      );
    },
  );

  registerAppTool(
    server,
    "codstats_get_last_session",
    {
      title: "Get Last Session",
      description: "Fetch the most recent completed CodStats session.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "session",
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.lastSession,
      }),
    },
    async (_args, extra) => {
      return fetchContractToolPayload(extra, "/api/app/stats/session/last", requestOrigin);
    },
  );

  registerAppTool(
    server,
    "codstats_get_match_history",
    {
      title: "Get Match History",
      description: "Fetch paginated match history using cursor-based pagination.",
      inputSchema: {
        cursor: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "matches",
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.matchHistory,
      }),
    },
    async ({ cursor, limit }, extra) => {
      return fetchContractToolPayload(
        extra,
        withHistoryQuery({ cursor, limit }),
        requestOrigin,
      );
    },
  );

  registerAppTool(
    server,
    "codstats_get_match",
    {
      title: "Get Match Detail",
      description: "Fetch a single match by match id.",
      inputSchema: {
        matchId: z.string().min(1),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.matchDetail,
      }),
    },
    async ({ matchId }, extra) => {
      return fetchContractToolPayload(
        extra,
        `/api/app/stats/matches/${encodeURIComponent(matchId)}`,
        requestOrigin,
      );
    },
  );

  registerAppTool(
    server,
    "codstats_get_rank_ladder",
    {
      title: "Get Rank Ladder",
      description: "Fetch explicit SR ranges for the rank ladder.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.rankLadder,
      }),
    },
    async (_args, extra) => {
      return fetchContractToolPayload(extra, "/api/app/stats/rank/ladder", requestOrigin);
    },
  );

  registerAppTool(
    server,
    "codstats_get_rank_progress",
    {
      title: "Get Rank Progress",
      description: "Fetch current rank position and SR movement targets.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "rank",
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.rankProgress,
      }),
    },
    async (_args, extra) => {
      return fetchContractToolPayload(extra, "/api/app/stats/rank/progress", requestOrigin);
    },
  );

  registerAppTool(
    server,
    "codstats_get_settings",
    {
      title: "Get Settings",
      description: "Fetch CodStats app settings and connection status.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        templateName: "settings",
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.profile,
      }),
    },
    async (_args, extra) => {
      return fetchContractToolPayload(extra, "/api/app/profile", requestOrigin);
    },
  );

  registerAppTool(
    server,
    "codstats_disconnect",
    {
      title: "Disconnect CodStats",
      description: "Disconnect the current ChatGPT app connection.",
      inputSchema: {
        confirm: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: false,
        destructiveHint: true,
      },
      _meta: createToolMeta({
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.disconnect,
      }),
    },
    async ({ confirm }, extra) => {
      if (confirm !== true) {
        return buildToolError(
          CHATGPT_APP_ERROR_CODES.validation,
          "Disconnect requires confirm=true.",
        );
      }

      return fetchContractToolPayload(extra, "/api/app/disconnect", requestOrigin, {
        method: "POST",
        body: "{}",
      });
    },
  );

  return server;
}
