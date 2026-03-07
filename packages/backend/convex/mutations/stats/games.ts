import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { mutation } from "../../_generated/server";
import {
  applyGlobalLandingStatsDelta,
  applyUserLandingStatsDelta,
} from "../../lib/landingMetrics";
import { getStatsUserIdCandidatesForInvalidation } from "../../lib/userIds";

export type Outcome = "win" | "loss";
export type Mode = "hardpoint" | "snd" | "overload";

export const logMatch = mutation({
  args: {
    sessionUuid: v.string(),
    mode: v.union(
      v.literal("hardpoint"),
      v.literal("snd"),
      v.literal("overload"),
    ),
    outcome: v.union(v.literal("win"), v.literal("loss")),
    kills: v.number(),
    deaths: v.number(),
    srChange: v.number(),
    lossProtected: v.boolean(),
    teamScore: v.optional(v.union(v.null(), v.number())),
    enemyScore: v.optional(v.union(v.null(), v.number())),
    hillTimeSeconds: v.optional(v.union(v.null(), v.number())),
    plants: v.optional(v.union(v.null(), v.number())),
    defuses: v.optional(v.union(v.null(), v.number())),
    overloads: v.optional(v.union(v.null(), v.number())),
  },
  handler: async (ctx, args) => {
    const {
      sessionUuid,
      mode,
      outcome,
      kills,
      deaths,
      srChange,
      lossProtected,
    } = args;
    // 1. Fetch the session document to get current aggregates
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_uuid", (q) => q.eq("uuid", sessionUuid))
      .filter((q) => q.eq(q.field("endedAt"), null))
      .first();
    if (!session) {
      throw new Error("Session not found in Convex");
    }
    // 2. Compute new aggregate values (replicate logic from Prisma)
    const newCurrentSr = session.currentSr + srChange;
    const newStreak = outcome === "win" ? session.streak + 1 : 0;
    const newBestStreak =
      newStreak > session.bestStreak ? newStreak : session.bestStreak;
    const now = Date.now();
    // 3. Insert the new game document
    await ctx.db.insert("games", {
      sessionId: sessionUuid,
      userId: session.userId,
      mode,
      outcome,
      kills,
      deaths,
      srChange,
      lossProtected,
      teamScore: args.teamScore ?? null,
      enemyScore: args.enemyScore ?? null,
      hillTimeSeconds: args.hillTimeSeconds ?? null,
      plants: args.plants ?? null,
      defuses: args.defuses ?? null,
      overloads: args.overloads ?? null,
      createdAt: now,
    });
    // 4. Update the session document aggregates
    await ctx.db.patch(session._id, {
      // Use patch to increment and set fields atomically
      wins: outcome === "win" ? session.wins + 1 : session.wins,
      losses: outcome === "loss" ? session.losses + 1 : session.losses,
      kills: session.kills + kills,
      deaths: session.deaths + deaths,
      currentSr: newCurrentSr,
      streak: newStreak,
      bestStreak: newBestStreak,
    });

    const statsDelta = {
      matchesIndexed: 1,
      wins: outcome === "win" ? 1 : 0,
      losses: outcome === "loss" ? 1 : 0,
    };
    await applyGlobalLandingStatsDelta(ctx, statsDelta);
    await applyUserLandingStatsDelta(ctx, session.userId, statsDelta);

    const invalidationUserIds = await getStatsUserIdCandidatesForInvalidation(
      ctx,
      session.userId,
    );

    await Promise.all(
      invalidationUserIds.map((invalidationUserId) =>
        ctx.scheduler.runAfter(
          0,
          internal.actions.stats.cache.invalidateLandingMetricsCache,
          {
            userId: invalidationUserId,
          },
        )
      ),
    );
  },
});
