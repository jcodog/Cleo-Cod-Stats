import { mutation } from "../../_generated/server";
import { v } from "convex/values";

export const importSession = mutation({
  args: {
    uuid: v.string(),
    userId: v.string(),
    codTitle: v.string(),
    season: v.number(),
    startSr: v.number(),
    currentSr: v.number(),
    wins: v.number(),
    losses: v.number(),
    kills: v.number(),
    deaths: v.number(),
    streak: v.number(),
    bestStreak: v.number(),
    startedAt: v.number(),
    endedAt: v.union(v.null(), v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", {
      ...args,
    });
  },
});
