import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  billingAddressValidator,
  billingTaxExemptValidator,
  billingTaxIdValidator,
} from "./shared"

export const billingCustomers = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),

  billingAddress: v.optional(billingAddressValidator),
  businessName: v.optional(v.string()),
  defaultPaymentMethodId: v.optional(v.string()),
  email: v.optional(v.string()),
  lastSyncedAt: v.optional(v.number()),
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  active: v.boolean(),
  taxExempt: v.optional(billingTaxExemptValidator),
  taxIds: v.optional(v.array(billingTaxIdValidator)),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_clerkUserId", ["clerkUserId"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_active", ["active"])
