import { fetchQuery } from "convex/nextjs";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import {
  APP_API_NO_STORE_HEADERS,
  requireAuthenticatedAppRequest,
  touchChatGptConnectionLastUsedAt,
} from "@/lib/server/chatgpt-app-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAILY_REQUIRED_SCOPES = ["stats.read"];
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
  const authResult = await deps.authenticate(request, DAILY_REQUIRED_SCOPES);

  if (!authResult.ok) {
    return authResult.response;
  }

  const requestUrl = new URL(request.url);
  const date = requestUrl.searchParams.get("date");

  if (!date || !isValidIsoDate(date)) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        error_description: "date is required and must be YYYY-MM-DD",
      },
      {
        status: 400,
        headers: APP_API_NO_STORE_HEADERS,
      },
    );
  }

  const daily = await deps.getDailyByDiscordId(authResult.auth.user.discordId, date);

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return NextResponse.json(
    {
      ok: true,
      daily,
    },
    {
      headers: APP_API_NO_STORE_HEADERS,
    },
  );
}

export async function GET(request: Request) {
  return handleDailyGet(request);
}
