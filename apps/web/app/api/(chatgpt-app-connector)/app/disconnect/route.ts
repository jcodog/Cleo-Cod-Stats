import { fetchMutation } from "convex/nextjs";

import { api } from "@workspace/backend/convex/_generated/api";
import type { Id } from "@workspace/backend/convex/_generated/dataModel";
import {
  CHATGPT_APP_ERROR_CODES,
  CHATGPT_APP_VIEWS,
  createChatGptAppErrorResponse,
  createChatGptAppSuccessResponse,
  withChatGptAppRoute,
} from "@workspace/backend/server/chatgpt-app-contract";
import { requireAuthenticatedAppRequest } from "@workspace/backend/server/chatgpt-app-auth";
import { CHATGPT_APP_ROUTE_REQUIRED_SCOPES } from "@workspace/backend/server/chatgpt-app-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DisconnectMutationResult =
  | {
      ok: true;
      revokedTokenCount: number;
      revokedAt: number;
    }
  | {
      ok: false;
      error: string;
    };

type DisconnectRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  disconnectByUserId: (
    userId: Id<"users">,
  ) => Promise<DisconnectMutationResult>;
};

const defaultDeps: DisconnectRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  disconnectByUserId: async (userId) =>
    fetchMutation(api.mutations.chatgpt.disconnectByUserId, {
      userId,
    }),
};

export async function handleDisconnectPost(
  request: Request,
  deps: DisconnectRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.disconnect,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  const disconnectResult = await deps.disconnectByUserId(authResult.auth.user._id);

  if (!disconnectResult.ok) {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to disconnect right now.",
    );
  }

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.settings, {
      connected: false,
      disconnected: true,
      revokedAt: disconnectResult.revokedAt,
      revokedTokenCount: disconnectResult.revokedTokenCount,
    });
}

export const POST = withChatGptAppRoute("api.app.disconnect.post", async (request) =>
  handleDisconnectPost(request),
);
