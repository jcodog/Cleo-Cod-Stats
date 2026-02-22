import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import {
  applyGlobalLandingStatsDelta,
  applyUserLandingStatsDelta,
} from "../../lib/landingMetrics";

export const createSession = mutation({
  args: {
    uuid: v.string(),
    userId: v.string(),
    codTitle: v.string(),
    season: v.number(),
    startSr: v.number(),
  },
  handler: async (ctx, args) => {
    const { uuid, userId, codTitle, season, startSr } = args;
    const now = Date.now();

    const userSessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const activeSessions = userSessions.filter(
      (session) => session.endedAt === null,
    );

    const matchingSession = activeSessions.find(
      (session) => session.codTitle === codTitle && session.season === season,
    );

    const sessionsToClose = matchingSession
      ? activeSessions.filter((session) => session._id !== matchingSession._id)
      : activeSessions;

    for (const session of sessionsToClose) {
      await ctx.db.patch(session._id, { endedAt: now });
    }

    if (matchingSession) {
      const activeSessionsDelta = -sessionsToClose.length;
      if (activeSessionsDelta !== 0) {
        const statsDelta = {
          activeSessions: activeSessionsDelta,
        };

        await applyGlobalLandingStatsDelta(ctx, statsDelta);
        await applyUserLandingStatsDelta(ctx, userId, statsDelta);

        await ctx.scheduler.runAfter(
          0,
          internal.actions.stats.cache.invalidateLandingMetricsCache,
          {
            userId,
          },
        );
      }

      return {
        created: false,
        session: matchingSession,
        closedSessionCount: sessionsToClose.length,
      };
    }

    const sessionId = await ctx.db.insert("sessions", {
      uuid,
      userId,
      codTitle,
      season,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      startSr,
      currentSr: startSr,
      streak: 0,
      bestStreak: 0,
      startedAt: now,
      endedAt: null,
    });

    const createdSession = await ctx.db.get(sessionId);
    if (!createdSession) {
      throw new Error("Failed to create session");
    }

    const statsDelta = {
      sessionsTracked: 1,
      activeSessions: 1 - sessionsToClose.length,
    };
    await applyGlobalLandingStatsDelta(ctx, statsDelta);
    await applyUserLandingStatsDelta(ctx, userId, statsDelta);

    await ctx.scheduler.runAfter(
      0,
      internal.actions.stats.cache.invalidateLandingMetricsCache,
      {
        userId,
      },
    );

    return {
      created: true,
      session: createdSession,
      closedSessionCount: sessionsToClose.length,
    };
  },
});
