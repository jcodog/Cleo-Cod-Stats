import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingSubscriptions = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),
  stripeSubscriptionId: v.string(),
  stripePriceId: v.string(),
  stripeProductId: v.optional(v.string()),

  planKey: v.string(),

  status: v.union(
    v.literal("incomplete"),
    v.literal("trialing"),
    v.literal("active"),
    v.literal("past_due"),
    v.literal("canceled"),
    v.literal("unpaid"),
    v.literal("paused"),
    v.literal("incomplete_expired")
  ),

  interval: v.union(v.literal("month"), v.literal("year")),

  cancelAtPeriodEnd: v.boolean(),
  currentPeriodStart: v.optional(v.number()),
  currentPeriodEnd: v.optional(v.number()),
  canceledAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
