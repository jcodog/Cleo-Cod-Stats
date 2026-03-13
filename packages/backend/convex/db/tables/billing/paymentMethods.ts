import { defineTable } from "convex/server"
import { v } from "convex/values"

import { billingAddressValidator } from "./shared"

export const billingPaymentMethods = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),
  stripePaymentMethodId: v.string(),

  active: v.boolean(),
  isDefault: v.boolean(),
  type: v.string(),

  bankName: v.optional(v.string()),
  billingAddress: v.optional(billingAddressValidator),
  brand: v.optional(v.string()),
  cardholderName: v.optional(v.string()),
  expMonth: v.optional(v.number()),
  expYear: v.optional(v.number()),
  last4: v.optional(v.string()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_active", ["userId", "active"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_stripePaymentMethodId", ["stripePaymentMethodId"])
