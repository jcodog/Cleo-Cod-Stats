import { fetchQuery } from "convex/nextjs";

import { api } from "@/convex/_generated/api";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
  createChatGptAppErrorResponse,
  createChatGptAppSuccessResponse,
  withChatGptAppRoute,
} from "@/lib/server/chatgpt-app-contract";
import {
  requireAuthenticatedAppRequest,
  touchChatGptConnectionLastUsedAt,
} from "@/lib/server/chatgpt-app-auth";
import { CHATGPT_APP_ROUTE_REQUIRED_SCOPES } from "@/lib/server/chatgpt-app-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function asRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

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
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.statsRecent,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const normalizedDiscordId = authResult.auth.user.discordId.trim();

  if (normalizedDiscordId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load recent stats for this account.",
    );
  }

  const requestUrl = new URL(request.url);
  const limit = parseLimit(requestUrl.searchParams.get("limit"));

  if (limit === null) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.validation,
      "limit must be a positive integer",
      {
        status: 400,
      },
    );
  }

  const recent = asRecord(await deps.getRecentByDiscordId(normalizedDiscordId, limit));

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.statsRecent, {
    limit,
    recent: recent ?? {},
  });
}

export const GET = withChatGptAppRoute("api.app.stats.recent.get", async (request) =>
  handleRecentGet(request),
);
