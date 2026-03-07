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

type SummaryRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getSummaryByDiscordId: (discordId: string) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: SummaryRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getSummaryByDiscordId: async (discordId) =>
    fetchQuery(api.queries.chatgpt.getStatsSummaryByDiscordId, {
      discordId,
    }),
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function asRecord(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export async function handleSummaryGet(
  request: Request,
  deps: SummaryRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.statsSummary,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const normalizedDiscordId = authResult.auth.user.discordId.trim();

  if (normalizedDiscordId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load summary stats for this account.",
    );
  }

  const summary = asRecord(await deps.getSummaryByDiscordId(normalizedDiscordId));

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.statsSummary, {
    summary: summary ?? {},
  });
}

export const GET = withChatGptAppRoute("api.app.stats.summary.get", async (request) =>
  handleSummaryGet(request),
);
