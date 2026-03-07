import type { Doc } from "../../_generated/dataModel";
import { query, type QueryCtx } from "../../_generated/server";
import {
  getGlobalLandingCounters,
  getUserLandingCounters,
  toWinRate,
} from "../../lib/landingMetrics";
import { getStatsUserIdCandidatesForIdentity } from "../../lib/userIds";

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
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const canReadPersonal = Boolean(identity?.subject);
    const userIdCandidatesPromise = canReadPersonal && identity
      ? getStatsUserIdCandidatesForIdentity(ctx, identity)
      : Promise.resolve([]);

    const globalCountersPromise = getGlobalLandingCounters(ctx);
    const latestGlobalGamePromise = ctx.db
      .query("games")
      .withIndex("by_createdat")
      .order("desc")
      .first();
    const userIdCandidates = await userIdCandidatesPromise;
    const personalCountersPromise = canReadPersonal
      ? getUserLandingCounters(ctx, userIdCandidates)
      : Promise.resolve(null);
    const latestUserGamePromise = canReadPersonal
      ? getLatestUserGameForCandidates(ctx, userIdCandidates)
      : Promise.resolve(null);

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
