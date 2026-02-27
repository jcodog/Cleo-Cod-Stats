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

import { CHATGPT_APP_TOOL_SECURITY_SCHEMES } from "@/lib/server/chatgpt-app-scopes";

const WIDGET_RESOURCE_URI = "ui://codstats/widget.html";

const DEFAULT_RECENT_LIMIT = 8;
const HOME_CALCULATION_LIMIT = 25;

type ToolExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

type SummaryPayload = {
  totalMatches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  totalSrChange: number;
  winRate: number | null;
  kdRatio: number | null;
  bestStreak: number;
  currentSr: number | null;
  lastSessionStartedAt: number | null;
  lastSessionEndedAt: number | null;
  lastSessionUuid: string | null;
  lastMatchAt: number | null;
};

type RecentGame = {
  sessionId: string;
  createdAt: number;
  mode: string;
  outcome: "win" | "loss";
  srChange: number;
  kills: number;
  deaths: number;
};

type RecentPayload = {
  games: RecentGame[];
};

type ProfilePayload = {
  name: string;
  plan: "free" | "premium";
};

type DisconnectPayload = {
  disconnected: boolean;
  revokedAt: number;
};

type ApiCallResult =
  | {
      ok: true;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      result: CallToolResult;
    };

type ApiFieldResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      result: CallToolResult;
    };

type AggregateStats = {
  totalMatches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  totalSrChange: number;
  winRate: number | null;
  kdRatio: number | null;
};

type HomeStructuredContent = {
  generatedAt: number;
  today: AggregateStats;
  overall: {
    bestStreak: number;
    currentSr: number | null;
    lastMatchAt: number | null;
  };
  lastSession:
    | (AggregateStats & {
        sessionUuid: string;
        startedAt: number | null;
        endedAt: number | null;
        hasData: boolean;
      })
    | null;
  recentMatches: Array<{
    createdAt: number;
    mode: string;
    outcome: "win" | "loss";
    srChange: number;
    kills: number;
    deaths: number;
  }>;
};

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toStringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function parseOutcome(value: unknown): "win" | "loss" {
  return value === "win" ? "win" : "loss";
}

function parseSummaryPayload(value: unknown): SummaryPayload | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    totalMatches: toNumber(record.totalMatches),
    wins: toNumber(record.wins),
    losses: toNumber(record.losses),
    kills: toNumber(record.kills),
    deaths: toNumber(record.deaths),
    totalSrChange: toNumber(record.totalSrChange),
    winRate: toNullableNumber(record.winRate),
    kdRatio: toNullableNumber(record.kdRatio),
    bestStreak: toNumber(record.bestStreak),
    currentSr: toNullableNumber(record.currentSr),
    lastSessionStartedAt: toNullableNumber(record.lastSessionStartedAt),
    lastSessionEndedAt: toNullableNumber(record.lastSessionEndedAt),
    lastSessionUuid:
      typeof record.lastSessionUuid === "string" ? record.lastSessionUuid : null,
    lastMatchAt: toNullableNumber(record.lastMatchAt),
  };
}

function parseRecentPayload(value: unknown): RecentPayload | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.games)) {
    return null;
  }

  return {
    games: record.games
      .map((game): RecentGame | null => {
        const gameRecord = asRecord(game);
        if (!gameRecord) {
          return null;
        }

        return {
          sessionId: toStringValue(gameRecord.sessionId, ""),
          createdAt: toNumber(gameRecord.createdAt),
          mode: toStringValue(gameRecord.mode, "unknown"),
          outcome: parseOutcome(gameRecord.outcome),
          srChange: toNumber(gameRecord.srChange),
          kills: toNumber(gameRecord.kills),
          deaths: toNumber(gameRecord.deaths),
        };
      })
      .filter((game): game is RecentGame => game !== null),
  };
}

function parseProfilePayload(value: unknown): ProfilePayload | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    name: toStringValue(record.name, "Unknown player"),
    plan: record.plan === "premium" ? "premium" : "free",
  };
}

function parseDisconnectPayload(value: unknown): DisconnectPayload | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return {
    disconnected: record.disconnected === true,
    revokedAt: toNumber(record.revokedAt),
  };
}

function buildTextContent(text: string): Array<{ type: "text"; text: string }> {
  return [{ type: "text", text }];
}

function buildToolError(message: string, wwwAuthenticate?: string): CallToolResult {
  return {
    isError: true,
    content: buildTextContent(message),
    _meta: wwwAuthenticate
      ? {
          "mcp/www_authenticate": [wwwAuthenticate],
        }
      : undefined,
  };
}

function getHeaderValue(
  headers: IsomorphicHeaders | undefined,
  targetHeaderName: string,
) {
  if (!headers) {
    return null;
  }

  const expectedName = targetHeaderName.toLowerCase();

  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== expectedName) {
      continue;
    }

    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  return null;
}

function resolveOrigin(extra: ToolExtra) {
  const requestOrigin = extra.requestInfo?.url?.origin;
  if (requestOrigin) {
    return requestOrigin;
  }

  if (process.env.OAUTH_RESOURCE) {
    try {
      return new URL(process.env.OAUTH_RESOURCE).origin;
    } catch {
      return null;
    }
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readErrorDescription(payload: Record<string, unknown> | null) {
  const description = payload?.error_description;
  if (typeof description === "string" && description.trim().length > 0) {
    return description;
  }

  const error = payload?.error;
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return null;
}

async function requestAppApi(
  extra: ToolExtra,
  endpointPath: string,
  init?: RequestInit,
): Promise<ApiCallResult> {
  const origin = resolveOrigin(extra);
  if (!origin) {
    return {
      ok: false,
      result: buildToolError(
        "Unable to resolve app origin. Reconnect the connector and try again.",
      ),
    };
  }

  const url = new URL(endpointPath, origin);
  const authorizationHeader = getHeaderValue(
    extra.requestInfo?.headers,
    "authorization",
  );

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (authorizationHeader) {
    headers.Authorization = authorizationHeader;
  }

  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      cache: "no-store",
      signal: extra.signal,
      headers,
      body: init?.body,
    });
  } catch (error) {
    return {
      ok: false,
      result: buildToolError(
        error instanceof Error ? error.message : "Unable to reach CodStats API.",
      ),
    };
  }

  let payload: Record<string, unknown> | null = null;
  try {
    payload = asRecord(await response.json());
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      readErrorDescription(payload) ?? `Request failed with status ${response.status}.`;
    return {
      ok: false,
      result: buildToolError(message, response.headers.get("www-authenticate") ?? undefined),
    };
  }

  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      result: buildToolError("Unexpected CodStats API response."),
    };
  }

  return {
    ok: true,
    payload,
  };
}

async function requestAppApiField<T>(
  extra: ToolExtra,
  endpointPath: string,
  field: string | null,
  init?: RequestInit,
): Promise<ApiFieldResult<T>> {
  const result = await requestAppApi(extra, endpointPath, init);

  if (!result.ok) {
    return result;
  }

  if (field === null) {
    return {
      ok: true,
      data: result.payload as T,
    };
  }

  if (!(field in result.payload)) {
    return {
      ok: false,
      result: buildToolError(`CodStats API response missing ${field}.`),
    };
  }

  return {
    ok: true,
    data: result.payload[field] as T,
  };
}

function roundRatio(value: number | null) {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function aggregateGames(games: RecentGame[]): AggregateStats {
  const totalMatches = games.length;
  const wins = games.filter((game) => game.outcome === "win").length;
  const losses = totalMatches - wins;
  const kills = games.reduce((total, game) => total + game.kills, 0);
  const deaths = games.reduce((total, game) => total + game.deaths, 0);
  const totalSrChange = games.reduce((total, game) => total + game.srChange, 0);

  return {
    totalMatches,
    wins,
    losses,
    kills,
    deaths,
    totalSrChange,
    winRate: roundRatio(totalMatches > 0 ? wins / totalMatches : null),
    kdRatio: roundRatio(deaths > 0 ? kills / deaths : null),
  };
}

function getUtcDayStartMs(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function buildHomeContent(
  summary: SummaryPayload,
  recent: RecentPayload,
  recentLimit: number,
): HomeStructuredContent {
  const now = Date.now();
  const todayStartMs = getUtcDayStartMs(now);
  const tomorrowStartMs = todayStartMs + 24 * 60 * 60 * 1_000;

  const todayGames = recent.games.filter(
    (game) => game.createdAt >= todayStartMs && game.createdAt < tomorrowStartMs,
  );

  const recentMatches = recent.games.slice(0, recentLimit).map((game) => ({
    createdAt: game.createdAt,
    mode: game.mode,
    outcome: game.outcome,
    srChange: game.srChange,
    kills: game.kills,
    deaths: game.deaths,
  }));

  const lastSessionGames = summary.lastSessionUuid
    ? recent.games.filter((game) => game.sessionId === summary.lastSessionUuid)
    : [];

  return {
    generatedAt: now,
    today: aggregateGames(todayGames),
    overall: {
      bestStreak: summary.bestStreak,
      currentSr: summary.currentSr,
      lastMatchAt: summary.lastMatchAt,
    },
    lastSession: summary.lastSessionUuid
      ? {
          ...aggregateGames(lastSessionGames),
          sessionUuid: summary.lastSessionUuid,
          startedAt: summary.lastSessionStartedAt,
          endedAt: summary.lastSessionEndedAt,
          hasData: lastSessionGames.length > 0,
        }
      : null,
    recentMatches,
  };
}

const WIDGET_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CodStats</title>
    <style>
      :root {
        color-scheme: light dark;
        --surface: #f6f7fb;
        --surface-elevated: #ffffff;
        --text: #112138;
        --muted: #5b6c87;
        --line: #d7deea;
        --accent: #0f9f9f;
        --accent-strong: #0d7f7f;
        --positive-bg: #daf7e8;
        --positive-text: #0f7040;
        --negative-bg: #ffe4e1;
        --negative-text: #9b3030;
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --surface: #101620;
          --surface-elevated: #1a2432;
          --text: #e7ecf7;
          --muted: #a2b2cb;
          --line: #314056;
          --accent: #37c7c7;
          --accent-strong: #55dfdf;
          --positive-bg: #173a2b;
          --positive-text: #93efbd;
          --negative-bg: #462327;
          --negative-text: #ffb3ba;
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
        background: radial-gradient(circle at 15% 0%, rgba(15, 159, 159, 0.18), transparent 44%),
          var(--surface);
        color: var(--text);
      }

      button {
        font: inherit;
      }

      .shell {
        padding: 14px;
      }

      .panel {
        border: 1px solid var(--line);
        border-radius: 14px;
        background: var(--surface-elevated);
        box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08);
        overflow: hidden;
      }

      .header {
        padding: 12px 14px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .title {
        margin: 0;
        font-size: 14px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .tabs {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }

      .tab {
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--line);
        color: var(--muted);
        background: transparent;
        cursor: pointer;
      }

      .tab[aria-pressed="true"] {
        color: #ffffff;
        background: var(--accent);
        border-color: var(--accent);
      }

      .tab:focus-visible,
      .button:focus-visible,
      .retry:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
      }

      .content {
        padding: 14px;
      }

      .cards {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .card {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px;
        min-width: 0;
        background: linear-gradient(140deg, rgba(15, 159, 159, 0.06), transparent 52%);
      }

      .card h2 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 10px;
      }

      .stat {
        min-width: 0;
      }

      .stat-label {
        display: block;
        color: var(--muted);
        font-size: 11px;
      }

      .stat-value {
        display: block;
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        margin-top: 2px;
      }

      .recent {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px;
      }

      .recent h2 {
        margin: 0 0 8px;
        font-size: 12px;
        letter-spacing: 0.03em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .recent-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 8px;
      }

      .recent-item {
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 8px;
        display: grid;
        gap: 4px;
      }

      .recent-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .recent-mode {
        color: var(--muted);
        font-size: 12px;
      }

      .pill {
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 600;
      }

      .pill.win {
        background: var(--positive-bg);
        color: var(--positive-text);
      }

      .pill.loss {
        background: var(--negative-bg);
        color: var(--negative-text);
      }

      .meta {
        color: var(--muted);
        font-size: 12px;
        font-variant-numeric: tabular-nums;
      }

      .settings-block {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 12px;
        display: grid;
        gap: 10px;
      }

      .user-name {
        margin: 0;
        font-size: 16px;
      }

      .helper {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      .actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .button {
        border: 1px solid #bf3d3d;
        background: #e65656;
        color: #ffffff;
        padding: 7px 12px;
        border-radius: 10px;
        cursor: pointer;
      }

      .button[disabled] {
        cursor: not-allowed;
        opacity: 0.65;
      }

      .notice {
        margin: 0;
        color: var(--muted);
        font-size: 12px;
      }

      .empty,
      .loading,
      .error {
        border: 1px dashed var(--line);
        border-radius: 10px;
        padding: 12px;
        color: var(--muted);
        font-size: 13px;
      }

      .loading {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .spinner {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        border: 2px solid var(--line);
        border-top-color: var(--accent);
        animation: spin 0.9s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      @media (max-width: 560px) {
        .cards {
          grid-template-columns: minmax(0, 1fr);
        }

        .header {
          flex-direction: column;
          align-items: flex-start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .spinner {
          animation: none;
        }
      }
    </style>
  </head>
  <body>
    <div id="codstats-root" class="shell"></div>

    <script>
      (function () {
        var DEFAULT_RECENT_LIMIT = ${String(DEFAULT_RECENT_LIMIT)};
        var root = document.getElementById("codstats-root");

        if (!root) {
          return;
        }

        var state = {
          activeTab: "home",
          loading: false,
          error: null,
          notice: "",
          home: null,
          settings: null,
          disconnecting: false,
        };

        function escapeHtml(value) {
          return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function clampNumber(value, min, max) {
          if (typeof value !== "number" || Number.isNaN(value)) {
            return min;
          }
          return Math.min(max, Math.max(min, Math.floor(value)));
        }

        function formatNumber(value) {
          return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
            typeof value === "number" ? value : 0,
          );
        }

        function formatSigned(value) {
          var numeric = typeof value === "number" ? value : 0;
          var sign = numeric > 0 ? "+" : "";
          return sign + formatNumber(numeric);
        }

        function formatPercent(value) {
          if (typeof value !== "number") {
            return "-";
          }
          return formatNumber(value * 100) + "%";
        }

        function formatRatio(value) {
          if (typeof value !== "number") {
            return "-";
          }

          return formatNumber(value);
        }

        function formatTime(timestamp) {
          if (typeof timestamp !== "number") {
            return "-";
          }

          return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(timestamp);
        }

        function normalizeTab(tab) {
          return tab === "settings" ? "settings" : "home";
        }

        function extractResultText(result) {
          if (!result || !Array.isArray(result.content)) {
            return null;
          }

          var text = result.content
            .filter(function (item) {
              return item && item.type === "text" && typeof item.text === "string";
            })
            .map(function (item) {
              return item.text;
            })
            .join(" ")
            .trim();

          return text.length > 0 ? text : null;
        }

        async function callTool(name, args) {
          if (!window.openai || typeof window.openai.callTool !== "function") {
            throw new Error("Tool bridge unavailable. Refresh the connector and try again.");
          }

          var result = await window.openai.callTool(name, args || {});

          if (result && result.isError) {
            throw new Error(extractResultText(result) || "Request failed.");
          }

          if (!result || typeof result !== "object") {
            throw new Error("Tool response was invalid.");
          }

          return result.structuredContent || {};
        }

        function renderStat(label, value) {
          return (
            '<div class="stat"><span class="stat-label">' +
            escapeHtml(label) +
            '</span><span class="stat-value">' +
            escapeHtml(value) +
            "</span></div>"
          );
        }

        function renderLoading() {
          return (
            '<div class="loading"><span class="spinner" aria-hidden="true"></span><span>Loading ' +
            escapeHtml(state.activeTab === "home" ? "home" : "settings") +
            "...</span></div>"
          );
        }

        function renderError() {
          return (
            '<div class="error"><p>' +
            escapeHtml(state.error || "Unable to load data.") +
            '</p><p><button class="retry" type="button" data-action="retry">Retry</button></p></div>'
          );
        }

        function renderHome() {
          if (!state.home) {
            return '<div class="empty">No home data loaded yet.</div>';
          }

          var today = state.home.today || {};
          var session = state.home.lastSession;
          var sessionSummary = session
            ? renderStat("Matches", formatNumber(session.totalMatches)) +
              renderStat("W/L", formatNumber(session.wins) + " / " + formatNumber(session.losses)) +
              renderStat("K/D", formatRatio(session.kdRatio)) +
              renderStat("SR", formatSigned(session.totalSrChange))
            : '<div class="empty">No tracked session yet.</div>';

          var recentMatches = Array.isArray(state.home.recentMatches)
            ? state.home.recentMatches
            : [];

          var recentItems =
            recentMatches.length === 0
              ? '<li class="empty">No recent matches available.</li>'
              : recentMatches
                  .map(function (match) {
                    var outcome = match.outcome === "win" ? "win" : "loss";
                    return (
                      '<li class="recent-item">' +
                      '<div class="recent-row">' +
                      '<span class="pill ' +
                      outcome +
                      '">' +
                      escapeHtml(outcome.toUpperCase()) +
                      "</span>" +
                      '<span class="recent-mode">' +
                      escapeHtml(String(match.mode || "Unknown")) +
                      "</span>" +
                      "</div>" +
                      '<div class="recent-row meta">' +
                      '<span>' +
                      escapeHtml(formatTime(match.createdAt)) +
                      "</span>" +
                      '<span>SR ' +
                      escapeHtml(formatSigned(match.srChange)) +
                      "</span>" +
                      '<span>K/D ' +
                      escapeHtml(formatNumber(match.kills)) +
                      "/" +
                      escapeHtml(formatNumber(match.deaths)) +
                      "</span>" +
                      "</div>" +
                      "</li>"
                    );
                  })
                  .join("");

          var generatedAt =
            typeof state.home.generatedAt === "number"
              ? "Updated " + formatTime(state.home.generatedAt)
              : "";

          return (
            '<div class="cards">' +
            '<article class="card"><h2>Today</h2><div class="stats">' +
            renderStat("Matches", formatNumber(today.totalMatches)) +
            renderStat("W/L", formatNumber(today.wins) + " / " + formatNumber(today.losses)) +
            renderStat("Win Rate", formatPercent(today.winRate)) +
            renderStat("K/D", formatRatio(today.kdRatio)) +
            renderStat("Kills", formatNumber(today.kills)) +
            renderStat("Deaths", formatNumber(today.deaths)) +
            renderStat("SR", formatSigned(today.totalSrChange)) +
            "</div></article>" +
            '<article class="card"><h2>Last Session</h2><div class="stats">' +
            sessionSummary +
            '</div><p class="helper">Started ' +
            escapeHtml(formatTime(session && session.startedAt)) +
            " | Ended " +
            escapeHtml(formatTime(session && session.endedAt)) +
            "</p></article>" +
            "</div>" +
            '<section class="recent"><h2>Recent Matches</h2><ul class="recent-list">' +
            recentItems +
            "</ul><p class=\"helper\">" +
            escapeHtml(generatedAt) +
            "</p></section>"
          );
        }

        function renderSettings() {
          if (!state.settings) {
            return '<div class="empty">No settings data loaded yet.</div>';
          }

          var user = state.settings.user || {};
          var connected = state.settings.connected !== false;

          return (
            '<section class="settings-block">' +
            '<div><h2 class="user-name">' +
            escapeHtml(user.name || "Unknown user") +
            "</h2>" +
            '<p class="helper">Plan: ' +
            escapeHtml(String(user.plan || "free")) +
            "</p></div>" +
            '<p class="helper">Status: ' +
            escapeHtml(connected ? "Connected" : "Disconnected") +
            "</p>" +
            '<div class="actions"><button class="button" type="button" data-action="disconnect" ' +
            (state.disconnecting || !connected ? "disabled" : "") +
            ">" +
            escapeHtml(state.disconnecting ? "Disconnecting..." : "Disconnect") +
            "</button></div>" +
            (state.notice
              ? '<p class="notice" aria-live="polite">' + escapeHtml(state.notice) + "</p>"
              : "") +
            "</section>"
          );
        }

        function render() {
          var body = "";

          if (state.loading) {
            body = renderLoading();
          } else if (state.error) {
            body = renderError();
          } else if (state.activeTab === "home") {
            body = renderHome();
          } else {
            body = renderSettings();
          }

          root.innerHTML =
            '<section class="panel" aria-label="CodStats app">' +
            '<header class="header">' +
            '<h1 class="title">CodStats</h1>' +
            '<div class="tabs" role="tablist" aria-label="CodStats sections">' +
            '<button class="tab" type="button" role="tab" data-tab="home" aria-pressed="' +
            (state.activeTab === "home") +
            '">Home</button>' +
            '<button class="tab" type="button" role="tab" data-tab="settings" aria-pressed="' +
            (state.activeTab === "settings") +
            '">Settings</button>' +
            "</div></header>" +
            '<main class="content">' +
            body +
            "</main></section>";

          root.querySelectorAll("[data-tab]").forEach(function (element) {
            element.addEventListener("click", function () {
              var tab = element.getAttribute("data-tab");
              if (tab === "home" || tab === "settings") {
                setActiveTab(tab);
              }
            });
          });

          var retryButton = root.querySelector("[data-action=retry]");
          if (retryButton) {
            retryButton.addEventListener("click", function () {
              if (state.activeTab === "home") {
                void loadHome(true);
              } else {
                void loadSettings(true);
              }
            });
          }

          var disconnectButton = root.querySelector("[data-action=disconnect]");
          if (disconnectButton) {
            disconnectButton.addEventListener("click", function () {
              void disconnect();
            });
          }
        }

        function setActiveTab(tab) {
          var normalizedTab = normalizeTab(tab);
          if (normalizedTab === state.activeTab) {
            return;
          }

          state.activeTab = normalizedTab;
          state.error = null;
          render();

          if (normalizedTab === "home") {
            void loadHome(false);
          } else {
            void loadSettings(false);
          }
        }

        async function loadHome(forceRefresh) {
          if (state.loading) {
            return;
          }

          if (!forceRefresh && state.home) {
            return;
          }

          state.loading = true;
          state.error = null;
          render();

          try {
            state.home = await callTool("codstats_get_home", {
              recentLimit: DEFAULT_RECENT_LIMIT,
            });
          } catch (error) {
            state.error =
              error instanceof Error ? error.message : "Unable to load home data.";
          } finally {
            state.loading = false;
            render();
          }
        }

        async function loadSettings(forceRefresh) {
          if (state.loading) {
            return;
          }

          if (!forceRefresh && state.settings) {
            return;
          }

          state.loading = true;
          state.error = null;
          render();

          try {
            state.settings = await callTool("codstats_get_settings", {});
          } catch (error) {
            state.error =
              error instanceof Error ? error.message : "Unable to load settings.";
          } finally {
            state.loading = false;
            render();
          }
        }

        async function disconnect() {
          if (state.disconnecting) {
            return;
          }

          if (!window.confirm("Disconnect CodStats for this ChatGPT app connection?")) {
            return;
          }

          state.disconnecting = true;
          state.error = null;
          state.notice = "";
          render();

          try {
            var result = await callTool("codstats_disconnect", {
              confirm: true,
            });

            state.settings = {
              user: state.settings ? state.settings.user : null,
              connected: false,
              revokedAt: result && result.revokedAt,
            };
            state.home = null;
            state.notice = "Disconnected. Reconnect before loading new CodStats data.";
          } catch (error) {
            state.error =
              error instanceof Error ? error.message : "Unable to disconnect right now.";
          } finally {
            state.disconnecting = false;
            render();
          }
        }

        function readInitialTab() {
          if (!window.openai) {
            return "home";
          }

          var fromInput = window.openai.toolInput && window.openai.toolInput.tab;
          if (fromInput === "home" || fromInput === "settings") {
            return fromInput;
          }

          var fromOutput = window.openai.toolOutput && window.openai.toolOutput.tab;
          if (fromOutput === "home" || fromOutput === "settings") {
            return fromOutput;
          }

          return "home";
        }

        window.addEventListener("openai:set_globals", function (event) {
          var globals = event && event.detail && event.detail.globals;
          if (!globals) {
            return;
          }

          var fromInput = globals.toolInput && globals.toolInput.tab;
          var fromOutput = globals.toolOutput && globals.toolOutput.tab;
          var tab = fromInput === "home" || fromInput === "settings"
            ? fromInput
            : fromOutput === "home" || fromOutput === "settings"
              ? fromOutput
              : null;

          if (tab) {
            setActiveTab(tab);
          }
        });

        state.activeTab = readInitialTab();
        render();

        if (state.activeTab === "home") {
          void loadHome(false);
        } else {
          void loadSettings(false);
        }
      })();
    </script>
  </body>
</html>`;

function createToolMeta(args: {
  includeWidget?: boolean;
  securitySchemes?: unknown;
}) {
  return {
    ...(args.includeWidget
      ? {
          ui: {
            resourceUri: WIDGET_RESOURCE_URI,
          },
          "openai/outputTemplate": WIDGET_RESOURCE_URI,
        }
      : {}),
    ...(args.securitySchemes
      ? {
          securitySchemes: args.securitySchemes,
        }
      : {}),
  };
}

export function createChatGptAppMcpServer() {
  const server = new McpServer({
    name: "codstats-app",
    version: "1.0.0",
  });

  registerAppResource(
    server,
    "CodStats Widget",
    WIDGET_RESOURCE_URI,
    {
      description: "Compact CodStats dashboard with Home and Settings tabs.",
    },
    async () => ({
      contents: [
        {
          uri: WIDGET_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
            },
            "openai/widgetDescription":
              "Compact CodStats dashboard with today stats, last session, recent matches, and connection settings.",
          },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "codstats_open",
    {
      title: "Open CodStats Dashboard",
      description: "Open the compact CodStats dashboard UI.",
      inputSchema: {
        tab: z.enum(["home", "settings"]).optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        includeWidget: true,
      }),
    },
    async ({ tab }) => ({
      structuredContent: {
        tab: tab === "settings" ? "settings" : "home",
      },
      content: buildTextContent("Opened CodStats dashboard."),
    }),
  );

  registerAppTool(
    server,
    "codstats_get_home",
    {
      title: "Load CodStats Home",
      description:
        "Load today summary, last session summary, and recent matches for CodStats.",
      inputSchema: {
        recentLimit: z.number().int().min(5).max(20).optional(),
      },
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.statsSummary,
      }),
    },
    async ({ recentLimit }, extra) => {
      const uiRecentLimit = clampNumber(recentLimit ?? DEFAULT_RECENT_LIMIT, 5, 20);
      const queryLimit = Math.max(uiRecentLimit, HOME_CALCULATION_LIMIT);

      const [summaryResult, recentResult] = await Promise.all([
        requestAppApiField<SummaryPayload>(extra, "/api/app/stats/summary", "summary"),
        requestAppApiField<RecentPayload>(
          extra,
          `/api/app/stats/recent?limit=${queryLimit}`,
          "recent",
        ),
      ]);

      if (!summaryResult.ok) {
        return summaryResult.result;
      }

      if (!recentResult.ok) {
        return recentResult.result;
      }

      const summaryPayload = parseSummaryPayload(summaryResult.data);
      const recentPayload = parseRecentPayload(recentResult.data);

      if (!summaryPayload || !recentPayload) {
        return buildToolError("CodStats returned malformed home data.");
      }

      const home = buildHomeContent(summaryPayload, recentPayload, uiRecentLimit);

      return {
        structuredContent: home,
        content: buildTextContent(
          `Loaded home with ${home.today.totalMatches} matches today and ${home.recentMatches.length} recent matches.`,
        ),
      };
    },
  );

  registerAppTool(
    server,
    "codstats_get_settings",
    {
      title: "Load CodStats Settings",
      description:
        "Load connected user details and status for CodStats settings.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
      },
      _meta: createToolMeta({
        securitySchemes: CHATGPT_APP_TOOL_SECURITY_SCHEMES.profile,
      }),
    },
    async (_args, extra) => {
      const profileResult = await requestAppApiField<ProfilePayload>(
        extra,
        "/api/app/profile",
        "profile",
      );

      if (!profileResult.ok) {
        return profileResult.result;
      }

      const profilePayload = parseProfilePayload(profileResult.data);
      if (!profilePayload) {
        return buildToolError("CodStats returned malformed profile data.");
      }

      const settings = {
        connected: true,
        user: {
          name: profilePayload.name,
          plan: profilePayload.plan,
        },
      };

      return {
        structuredContent: settings,
        content: buildTextContent(`Loaded settings for ${profilePayload.name}.`),
      };
    },
  );

  registerAppTool(
    server,
    "codstats_disconnect",
    {
      title: "Disconnect CodStats",
      description:
        "Disconnect this ChatGPT app connection from CodStats for the signed-in user.",
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
        return buildToolError("Disconnect requires an explicit confirmation.");
      }

      const disconnectResult = await requestAppApiField<DisconnectPayload>(
        extra,
        "/api/app/disconnect",
        null,
        {
          method: "POST",
          body: "{}",
        },
      );

      if (!disconnectResult.ok) {
        return disconnectResult.result;
      }

      const disconnectPayload = parseDisconnectPayload(disconnectResult.data);
      if (!disconnectPayload) {
        return buildToolError("CodStats returned malformed disconnect data.");
      }

      return {
        structuredContent: {
          disconnected: disconnectPayload.disconnected,
          revokedAt: disconnectPayload.revokedAt,
        },
        content: buildTextContent("Disconnected CodStats for this ChatGPT app connection."),
      };
    },
  );

  return server;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
