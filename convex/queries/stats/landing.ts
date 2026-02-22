import type { UserIdentity } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../../_generated/dataModel";
import { query, type QueryCtx } from "../../_generated/server";
import {
  getGlobalLandingCounters,
  getUserLandingCounters,
  toWinRate,
} from "../../lib/landingMetrics";

function addCandidate(candidates: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length > 0) {
    candidates.add(trimmedValue);
  }
}

function getUserIdCandidates(
  userId: string | undefined,
  identity: UserIdentity | null,
) {
  const candidates = new Set<string>();

  addCandidate(candidates, userId);
  addCandidate(candidates, identity?.subject);
  addCandidate(candidates, identity?.tokenIdentifier);

  const tokenIdentifier = identity?.tokenIdentifier;
  if (tokenIdentifier && tokenIdentifier.includes("|")) {
    const tokenParts = tokenIdentifier.split("|");
    addCandidate(candidates, tokenParts[tokenParts.length - 1]);
  }

  return Array.from(candidates);
}

async function getLatestUserGameForCandidates(
  ctx: QueryCtx,
  userIdCandidates: string[],
) {
  if (userIdCandidates.length === 0) {
    return null;
  }

  const latestGames = await Promise.all(
    Array.from(new Set(userIdCandidates)).map((candidate) =>
      ctx.db
        .query("games")
        .withIndex("by_user_createdat", (q) => q.eq("userId", candidate))
        .order("desc")
        .first(),
    ),
  );

  return latestGames.reduce<Doc<"games"> | null>((latest, game) => {
    if (!game) {
      return latest;
    }

    if (!latest || game.createdAt > latest.createdAt) {
      return game;
    }

    return latest;
  }, null);
}

export const getLandingMetrics = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userIdCandidates = getUserIdCandidates(userId, identity);

    const globalCountersPromise = getGlobalLandingCounters(ctx);
    const latestGlobalGamePromise = ctx.db
      .query("games")
      .withIndex("by_createdat")
      .order("desc")
      .first();
    const personalCountersPromise = getUserLandingCounters(ctx, userIdCandidates);
    const latestUserGamePromise = getLatestUserGameForCandidates(
      ctx,
      userIdCandidates,
    );

    const [
      globalCounters,
      latestGlobalGame,
      personalCounters,
      latestUserGame,
    ] = await Promise.all([
      globalCountersPromise,
      latestGlobalGamePromise,
      personalCountersPromise,
      latestUserGamePromise,
    ]);

    const personal = personalCounters
      ? {
          matchesIndexed: personalCounters.matchesIndexed,
          sessionsTracked: personalCounters.sessionsTracked,
          activeSessions: personalCounters.activeSessions,
          latestIngestedAt: latestUserGame?.createdAt ?? null,
          winRate: toWinRate(personalCounters.wins, personalCounters.losses),
        }
      : null;

    return {
      global: {
        matchesIndexed: globalCounters.matchesIndexed,
        sessionsTracked: globalCounters.sessionsTracked,
        activeSessions: globalCounters.activeSessions,
        latestIngestedAt: latestGlobalGame?.createdAt ?? null,
        winRate: toWinRate(globalCounters.wins, globalCounters.losses),
      },
      personal,
    };
  },
});
