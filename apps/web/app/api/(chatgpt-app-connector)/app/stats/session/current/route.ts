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

type CurrentSessionRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getActiveSessionByDiscordId: (discordId: string) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: CurrentSessionRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getActiveSessionByDiscordId: async (discordId) =>
    fetchQuery((api as any).queries.chatgpt.getActiveSessionByDiscordId, {
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

export async function handleCurrentSessionGet(
  request: Request,
  deps: CurrentSessionRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.sessionCurrent,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const normalizedDiscordId = authResult.auth.user.discordId.trim();

  if (normalizedDiscordId.length === 0) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load session data for this account.",
    );
  }

  const activeSession = await deps.getActiveSessionByDiscordId(normalizedDiscordId);

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  const sessionRecord = asRecord(activeSession);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.sessionCurrent, {
      active: sessionRecord !== null,
      ...(sessionRecord ? { session: sessionRecord } : {}),
    });
}

export const GET = withChatGptAppRoute(
  "api.app.stats.session.current.get",
  async (request) => handleCurrentSessionGet(request),
);
