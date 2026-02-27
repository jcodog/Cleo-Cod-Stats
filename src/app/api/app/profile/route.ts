import { NextResponse } from "next/server";

import {
  APP_API_NO_STORE_HEADERS,
  requireAuthenticatedAppRequest,
  touchChatGptConnectionLastUsedAt,
} from "@/lib/server/chatgpt-app-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROFILE_REQUIRED_SCOPES = ["profile.read"];

type ProfileRouteDeps = {
  authenticate: typeof requireAuthenticatedAppRequest;
  touchConnectionLastUsedAt: typeof touchChatGptConnectionLastUsedAt;
};

const defaultDeps: ProfileRouteDeps = {
  authenticate: requireAuthenticatedAppRequest,
  touchConnectionLastUsedAt: touchChatGptConnectionLastUsedAt,
};

export async function handleProfileGet(
  request: Request,
  deps: ProfileRouteDeps = defaultDeps,
) {
  const authResult = await deps.authenticate(request, PROFILE_REQUIRED_SCOPES);

  if (!authResult.ok) {
    return authResult.response;
  }

  await deps.touchConnectionLastUsedAt(authResult.auth.user._id);

  return NextResponse.json(
    {
      ok: true,
      profile: {
        id: authResult.auth.user._id,
        clerkUserId: authResult.auth.user.clerkUserId,
        discordId: authResult.auth.user.discordId,
        name: authResult.auth.user.name,
        plan: authResult.auth.user.plan,
      },
    },
    {
      headers: APP_API_NO_STORE_HEADERS,
    },
  );
}

export async function GET(request: Request) {
  return handleProfileGet(request);
}
