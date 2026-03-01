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

type LastSessionRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  getLastCompletedSessionByDiscordId: (discordId: string) => Promise<unknown>;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: LastSessionRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  getLastCompletedSessionByDiscordId: async (discordId) =>
    fetchQuery((api as any).queries.chatgpt.getLastCompletedSessionByDiscordId, {
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

export async function handleLastSessionGet(
  request: Request,
  deps: LastSessionRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.sessionLast,
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

  const lastSession = await deps.getLastCompletedSessionByDiscordId(normalizedDiscordId);

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  const sessionRecord = asRecord(lastSession);

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.sessionLast, {
      found: sessionRecord !== null,
      ...(sessionRecord ? { session: sessionRecord } : {}),
    });
}

export const GET = withChatGptAppRoute("api.app.stats.session.last.get", async (request) =>
  handleLastSessionGet(request),
);
