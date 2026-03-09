import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingPlans = defineTable({
  key: v.string(),
  name: v.string(),
  description: v.string(),

  active: v.boolean(),
  sortOrder: v.number(),

  planType: v.union(v.literal("free"), v.literal("paid")),
  archivedAt: v.optional(v.number()),

  stripeProductId: v.optional(v.string()),

  monthlyPriceId: v.optional(v.string()),
  yearlyPriceId: v.optional(v.string()),

  monthlyPriceAmount: v.number(),
  yearlyPriceAmount: v.number(),

  currency: v.string(), // gbp

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key", ["key"])
  .index("by_active", ["active"])
