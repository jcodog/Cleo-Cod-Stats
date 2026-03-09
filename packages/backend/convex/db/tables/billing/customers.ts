import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingCustomers = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),

  email: v.optional(v.string()),
  active: v.boolean(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_active", ["active"])
