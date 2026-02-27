import { fetchMutation } from "convex/nextjs";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  APP_API_NO_STORE_HEADERS,
  requireAuthenticatedAppRequest,
} from "@/lib/server/chatgpt-app-auth";
import { CHATGPT_APP_ROUTE_REQUIRED_SCOPES } from "@/lib/server/chatgpt-app-scopes";

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
    return NextResponse.json(
      {
        ok: false,
        error: "disconnect_failed",
        error_description: "Unable to disconnect right now.",
      },
      {
        status: 500,
        headers: APP_API_NO_STORE_HEADERS,
      },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      disconnected: true,
      revokedAt: disconnectResult.revokedAt,
      revokedTokenCount: disconnectResult.revokedTokenCount,
    },
    {
      headers: APP_API_NO_STORE_HEADERS,
    },
  );
}

export async function POST(request: Request) {
  return handleDisconnectPost(request);
}
