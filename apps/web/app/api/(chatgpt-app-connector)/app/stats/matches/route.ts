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

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 15;

type MatchHistoryRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getMatchesByDiscordIdPaginated: (
    discordId: string,
    paginationOpts: {
      cursor: string | null;
      numItems: number;
    },
  ) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: MatchHistoryRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getMatchesByDiscordIdPaginated: async (discordId, paginationOpts) =>
    fetchQuery((api as any).queries.chatgpt.getMatchesByDiscordIdPaginated, {
      discordId,
      paginationOpts,
    }),
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function parseRequestedLimit(rawLimit: string | null) {
  if (rawLimit === null) {
    return {
      ok: true as const,
      limit: DEFAULT_LIMIT,
    };
  }

  if (!/^\d+$/.test(rawLimit)) {
    return {
      ok: false as const,
    };
  }

  const parsedLimit = Number(rawLimit);

  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    return {
      ok: false as const,
    };
  }

  return {
    ok: true as const,
    limit: Math.min(parsedLimit, MAX_LIMIT),
  };
}

function asRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === "object" && !Array.isArray(item),
  );
}

export async function handleMatchHistoryGet(
  request: Request,
  deps: MatchHistoryRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.matches,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const normalizedDiscordId = authResult.auth.user.discordId.trim();

  if (normalizedDiscordId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load match history for this account.",
    );
  }

  const requestUrl = new URL(request.url);
  const requestedLimit = parseRequestedLimit(requestUrl.searchParams.get("limit"));

  if (!requestedLimit.ok) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.validation,
      "limit must be a positive integer",
      {
        status: 400,
      },
    );
  }

  const cursorParam = requestUrl.searchParams.get("cursor");
  const cursor = cursorParam && cursorParam.trim().length > 0 ? cursorParam : null;

  const paginatedMatches = asRecord(
    await deps.getMatchesByDiscordIdPaginated(normalizedDiscordId, {
      cursor,
      numItems: requestedLimit.limit,
    }),
  );

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.matchesHistory, {
      items: asItems(paginatedMatches?.items),
      nextCursor:
        typeof paginatedMatches?.nextCursor === "string"
          ? paginatedMatches.nextCursor
          : null,
      hasMore: paginatedMatches?.hasMore === true,
      limit: requestedLimit.limit,
    });
}

export const GET = withChatGptAppRoute("api.app.stats.matches.get", async (request) =>
  handleMatchHistoryGet(request),
);
