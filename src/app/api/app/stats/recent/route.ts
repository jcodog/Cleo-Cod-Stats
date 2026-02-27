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

const RECENT_REQUIRED_SCOPES = ["stats.read"];
const DEFAULT_LIMIT = 10;

type RecentRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getRecentByDiscordId: (discordId: string, limit: number) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: RecentRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getRecentByDiscordId: async (discordId, limit) =>
    fetchQuery(api.queries.chatgpt.getRecentStatsByDiscordId, {
      discordId,
      limit,
    }),
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function parseLimit(rawLimit: string | null) {
  if (rawLimit === null) {
    return DEFAULT_LIMIT;
  }

  if (!/^\d+$/.test(rawLimit)) {
    return null;
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

export async function handleRecentGet(
  request: Request,
  deps: RecentRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(request, RECENT_REQUIRED_SCOPES);

  if (!authResult.ok) {
    return authResult.response;
  }

  const requestUrl = new URL(request.url);
  const limit = parseLimit(requestUrl.searchParams.get("limit"));

  if (limit === null) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_request",
        error_description: "limit must be a positive integer",
      },
      {
        status: 400,
        headers: APP_API_NO_STORE_HEADERS,
      },
    );
  }

  const recent = await deps.getRecentByDiscordId(authResult.auth.user.discordId, limit);

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return NextResponse.json(
    {
      ok: true,
      recent,
    },
    {
      headers: APP_API_NO_STORE_HEADERS,
    },
  );
}

export async function GET(request: Request) {
  return handleRecentGet(request);
}
