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

const SUMMARY_REQUIRED_SCOPES = ["stats.read"];

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

export async function handleSummaryGet(
  request: Request,
  deps: SummaryRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(request, SUMMARY_REQUIRED_SCOPES);

  if (!authResult.ok) {
    return authResult.response;
  }

  const summary = await deps.getSummaryByDiscordId(authResult.auth.user.discordId);

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return NextResponse.json(
    {
      ok: true,
      summary,
    },
    {
      headers: APP_API_NO_STORE_HEADERS,
    },
  );
}

export async function GET(request: Request) {
  return handleSummaryGet(request);
}
