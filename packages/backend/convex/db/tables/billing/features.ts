import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingFeatures = defineTable({
  key: v.string(),
  name: v.string(),
  description: v.string(),

  category: v.optional(v.string()),
  active: v.boolean(),
  sortOrder: v.number(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_key", ["key"])
  .index("by_active", ["active"])
