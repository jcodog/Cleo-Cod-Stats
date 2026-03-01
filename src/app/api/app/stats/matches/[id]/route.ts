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

const MATCH_ID_PATTERN = /^[a-zA-Z0-9_-]{4,128}$/;

type MatchDetailRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getMatchById: (discordId: string, matchId: string) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: MatchDetailRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getMatchById: async (discordId, matchId) =>
    fetchQuery((api as any).queries.chatgpt.getMatchById, {
      discordId,
      matchId,
    }),
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function asRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export async function handleMatchDetailGet(
  request: Request,
  matchId: string,
  deps: MatchDetailRouteDeps = defaultDeps,
) {
  const normalizedMatchId = matchId.trim();

  if (normalizedMatchId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.validation,
      "match id is required",
      {
        status: 400,
      },
    );
  }

  if (!MATCH_ID_PATTERN.test(normalizedMatchId)) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.validation,
      "match id format is invalid",
      {
        status: 400,
        details: {
          field: "matchId",
        },
      },
    );
  }

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
      "Unable to load match details for this account.",
    );
  }

  const match = asRecord(await deps.getMatchById(normalizedDiscordId, normalizedMatchId));

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  if (!match) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.notFound,
      "match not found",
      {
        status: 404,
      },
    );
  }

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.matchesDetail, {
      match,
    });
}

type MatchDetailRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export const GET = withChatGptAppRoute(
  "api.app.stats.matches.detail.get",
  async (request: Request, context: MatchDetailRouteContext) => {
    const { id } = await context.params;
    return handleMatchDetailGet(request, id);
  },
);
