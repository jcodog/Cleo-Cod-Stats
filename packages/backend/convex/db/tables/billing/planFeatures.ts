import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingPlanFeatures = defineTable({
  planKey: v.string(),
  featureKey: v.string(),

  enabled: v.boolean(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_planKey", ["planKey"])
  .index("by_featureKey", ["featureKey"])
  .index("by_planKey_featureKey", ["planKey", "featureKey"])
