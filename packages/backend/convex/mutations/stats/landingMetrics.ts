import type { Doc } from "../../_generated/dataModel";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import {
  EMPTY_LANDING_COUNTERS,
  type LandingCounters,
} from "../../lib/landingMetrics";

function createEmptyCounters(): LandingCounters {
  return {
    ...EMPTY_LANDING_COUNTERS,
  };
}

function addSessionToCounters(
  counters: LandingCounters,
  session: Pick<Doc<"sessions">, "wins" | "losses" | "endedAt">,
): LandingCounters {
  const matchesIndexed = session.wins + session.losses;

  return {
    matchesIndexed: counters.matchesIndexed + matchesIndexed,
    sessionsTracked: counters.sessionsTracked + 1,
    activeSessions: counters.activeSessions + (session.endedAt === null ? 1 : 0),
    wins: counters.wins + session.wins,
    losses: counters.losses + session.losses,
  };
}

export const rebuildLandingMetrics = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").collect();
    const perUserCounters = new Map<string, LandingCounters>();

    let globalCounters = createEmptyCounters();
    for (const session of sessions) {
      globalCounters = addSessionToCounters(globalCounters, session);

      const currentUserCounters = perUserCounters.get(session.userId) ??
        createEmptyCounters();
      perUserCounters.set(
        session.userId,
        addSessionToCounters(currentUserCounters, session),
      );
    }

    const existingGlobalStats = await ctx.db
      .query("landingGlobalStats")
      .withIndex("by_key", (q) => q.eq("key", "global"))
      .collect();
    for (const existingGlobalStat of existingGlobalStats) {
      await ctx.db.delete(existingGlobalStat._id);
    }

    const existingUserStats = await ctx.db.query("landingUserStats").collect();
    for (const existingUserStat of existingUserStats) {
      await ctx.db.delete(existingUserStat._id);
    }

    const now = Date.now();
    await ctx.db.insert("landingGlobalStats", {
      key: "global",
      ...globalCounters,
      updatedAt: now,
    });

    for (const [userId, counters] of perUserCounters.entries()) {
      await ctx.db.insert("landingUserStats", {
        userId,
        ...counters,
        updatedAt: now,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.actions.stats.cache.invalidateLandingMetricsCache,
      {
        invalidateAll: true,
      },
    );

    return {
      sessionsProcessed: sessions.length,
      usersProcessed: perUserCounters.size,
      globalCounters,
    };
  },
});
