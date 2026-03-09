import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingEntitlements = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  featureKey: v.string(),

  source: v.union(
    v.literal("plan"),
    v.literal("manual"),
    v.literal("promo"),
    v.literal("creator_approval")
  ),

  enabled: v.boolean(),

  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),

  notes: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_featureKey", ["featureKey"])
  .index("by_userId_featureKey", ["userId", "featureKey"])
