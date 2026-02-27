import { v } from "convex/values";

import { mutation } from "../_generated/server";

export const touchConnectionLastUsedAt = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("chatgptAppConnections")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    if (!connection || connection.status !== "active") {
      return {
        ok: false as const,
      };
    }

    const touchedAt = Date.now();

    await ctx.db.patch(connection._id, {
      lastUsedAt: touchedAt,
      updatedAt: touchedAt,
    });

    return {
      ok: true as const,
      touchedAt,
    };
  },
});
