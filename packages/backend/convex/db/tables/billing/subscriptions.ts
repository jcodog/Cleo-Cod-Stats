import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingSubscriptions = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),
  stripeSubscriptionId: v.string(),
  stripeSubscriptionItemId: v.optional(v.string()),
  stripePriceId: v.string(),
  stripeProductId: v.optional(v.string()),
  stripeScheduleId: v.optional(v.string()),
  stripeLatestInvoiceId: v.optional(v.string()),
  stripeLatestPaymentIntentId: v.optional(v.string()),
  lastStripeEventId: v.optional(v.string()),

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
  defaultPaymentMethodId: v.optional(v.string()),
  attentionStatus: v.union(
    v.literal("none"),
    v.literal("payment_failed"),
    v.literal("past_due"),
    v.literal("requires_action"),
    v.literal("paused")
  ),
  attentionUpdatedAt: v.optional(v.number()),

  cancelAtPeriodEnd: v.boolean(),
  currentPeriodStart: v.optional(v.number()),
  currentPeriodEnd: v.optional(v.number()),
  cancelAt: v.optional(v.number()),
  canceledAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  quantity: v.optional(v.number()),
  startedAt: v.optional(v.number()),
  trialEnd: v.optional(v.number()),
  trialStart: v.optional(v.number()),

  scheduledChangeType: v.optional(
    v.union(v.literal("cancel"), v.literal("plan_change"))
  ),
  scheduledPlanKey: v.optional(v.string()),
  scheduledInterval: v.optional(v.union(v.literal("month"), v.literal("year"))),
  scheduledChangeAt: v.optional(v.number()),
  scheduledChangeRequestedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_stripeSubscriptionId", ["stripeSubscriptionId"])
  .index("by_planKey", ["planKey"])
  .index("by_status", ["status"])
  .index("by_attentionStatus", ["attentionStatus"])
