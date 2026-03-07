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
import { getCodstatsRankLadder } from "@workspace/backend/server/codstats-rank";
import { CHATGPT_APP_ROUTE_REQUIRED_SCOPES } from "@workspace/backend/server/chatgpt-app-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RankLadderRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: RankLadderRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

export async function handleRankLadderGet(
  request: Request,
  deps: RankLadderRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(
    request,
    CHATGPT_APP_ROUTE_REQUIRED_SCOPES.rankLadder,
  );

  if (!authResult.ok) {
    return authResult.response;
  }

  if (typeof authResult.auth.user.discordId !== "string") {
    return createChatGptAppErrorResponse(
      CHATGPT_APP_ERROR_CODES.internal,
      "Unable to load rank ladder for this account.",
    );
  }

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return createChatGptAppSuccessResponse(
    CHATGPT_APP_VIEWS.rankLadder,
    getCodstatsRankLadder(),
  );
}

export const GET = withChatGptAppRoute("api.app.stats.rank.ladder.get", async (request) =>
  handleRankLadderGet(request),
);
