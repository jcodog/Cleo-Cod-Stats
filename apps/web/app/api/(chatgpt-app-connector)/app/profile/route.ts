import {
  CHATGPT_APP_VIEWS,
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

type ProfileRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: ProfileRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

function maskDiscordId(discordId: string) {
  const normalizedDiscordId = discordId.trim();
  if (normalizedDiscordId.length <= 4) {
    return "****";
  }

  return `${normalizedDiscordId.slice(0, 2)}****${normalizedDiscordId.slice(-2)}`;
}

export async function handleProfileGet(
  request: Request,
  deps: ProfileRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.profile,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  const normalizedUserName =
    typeof authResult.auth.user.name === "string" &&
    authResult.auth.user.name.trim().length > 0
      ? authResult.auth.user.name
      : "CodStats User";

  const normalizedPlan = authResult.auth.user.plan === "premium" ? "premium" : "free";

  const chatgptLinked =
    authResult.auth.user.chatgptLinked === true &&
    authResult.auth.user.connectionStatus === "active";

  const lastSyncAt =
    typeof authResult.auth.user.connectionLastUsedAt === "number"
      ? authResult.auth.user.connectionLastUsedAt
      : null;

  return createChatGptAppSuccessResponse(CHATGPT_APP_VIEWS.settings, {
      connected: true,
      chatgptLinked,
      connectionStatus: authResult.auth.user.connectionStatus,
      user: {
        name: normalizedUserName,
        plan: normalizedPlan,
        discordIdMasked: maskDiscordId(authResult.auth.user.discordId),
        lastSyncAt,
      },
    });
}

export const GET = withChatGptAppRoute("api.app.profile.get", async (request) =>
  handleProfileGet(request),
);
