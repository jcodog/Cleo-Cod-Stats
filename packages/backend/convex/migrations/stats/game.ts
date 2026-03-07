import { mutation } from "../../_generated/server";
import { v } from "convex/values";

export const importGame = mutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
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
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("games", {
      ...args,
    });
  },
});
