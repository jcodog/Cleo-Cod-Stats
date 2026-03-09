import { v } from "convex/values"
import { internalMutation } from "../../_generated/server"

export const upsertFromVercel = internalMutation({
  args: {
    key: v.string(),
    enabled: v.boolean(),
    rolloutPercent: v.number(),
    premiumBypass: v.boolean(),
    creatorBypass: v.boolean(),
    adminBypass: v.boolean(),
    staffBypass: v.boolean(),
    allowlistUserIds: v.array(v.string()),
    syncedFrom: v.string(),
    syncedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique()

    if (existing) {
      await ctx.db.patch(existing._id, args)

      return existing._id
    }

    return await ctx.db.insert("featureFlags", args)
  },
})
