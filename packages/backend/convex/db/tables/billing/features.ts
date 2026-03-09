import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingFeatures = defineTable({
  key: v.string(),
  name: v.string(),
  description: v.string(),

  stripeFeatureId: v.optional(v.string()),

  category: v.optional(v.string()),
  appliesTo: v.optional(
    v.union(v.literal("entitlement"), v.literal("marketing"), v.literal("both"))
  ),
  active: v.boolean(),
  archivedAt: v.optional(v.number()),
  sortOrder: v.number(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key", ["key"])
  .index("by_active", ["active"])
