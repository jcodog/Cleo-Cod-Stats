import { fetchQuery } from "convex/nextjs";

import { api } from "@workspace/backend/convex/_generated/api";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
  createChatGptAppErrorResponse,
  createChatGptAppSuccessResponse,
  withChatGptAppRoute,
} from "@workspace/backend/server/chatgpt-app-contract";
import {
  requireAuthenticatedAppRequest,
  touchChatGptConnectionLastUsedAt,
} from "@workspace/backend/server/chatgpt-app-auth";
import { CHATGPT_APP_ROUTE_REQUIRED_SCOPES } from "@workspace/backend/server/chatgpt-app-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type DailyRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getDailyByDiscordId: (discordId: string, date: string) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: DailyRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getDailyByDiscordId: async (discordId, date) =>
    fetchQuery(api.queries.chatgpt.getDailyStatsByDiscordId, {
      discordId,
      date,
    }),
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function asRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function isValidIsoDate(date: string) {
  if (!DATE_PATTERN.test(date)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const normalized = new Date(Date.UTC(year, month - 1, day));

  return (
    normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() + 1 === month &&
    normalized.getUTCDate() === day
  );
}

export async function handleDailyGet(
  request: Request,
  deps: DailyRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.statsDaily,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const normalizedDiscordId = authResult.auth.user.discordId.trim();

  if (normalizedDiscordId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load daily stats for this account.",
    );
  }

  const requestUrl = new URL(request.url);
  const date = requestUrl.searchParams.get("date");

  if (!date || !isValidIsoDate(date)) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.validation,
      "date is required and must be YYYY-MM-DD",
      {
        status: 400,
      },
    );
  }

  const daily = asRecord(await deps.getDailyByDiscordId(normalizedDiscordId, date));

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.statsDaily, {
    date,
    daily: daily ?? {},
  });
}

export const GET = withChatGptAppRoute("api.app.stats.daily.get", async (request) =>
  handleDailyGet(request),
);
