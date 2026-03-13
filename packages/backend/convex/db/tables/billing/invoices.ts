import { defineTable } from "convex/server"
import { v } from "convex/values"

export const billingInvoices = defineTable({
  userId: v.id("users"),
  clerkUserId: v.string(),

  stripeCustomerId: v.string(),
  stripeInvoiceId: v.string(),
  stripeSubscriptionId: v.optional(v.string()),

  amountDue: v.number(),
  amountPaid: v.number(),
  currency: v.string(),
  description: v.string(),
  hostedInvoiceUrl: v.optional(v.string()),
  invoiceIssuedAt: v.number(),
  invoiceNumber: v.optional(v.string()),
  invoicePdfUrl: v.optional(v.string()),
  paymentMethodBrand: v.optional(v.string()),
  paymentMethodLast4: v.optional(v.string()),
  paymentMethodType: v.optional(v.string()),
  status: v.string(),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_invoiceIssuedAt", ["userId", "invoiceIssuedAt"])
  .index("by_stripeCustomerId", ["stripeCustomerId"])
  .index("by_stripeInvoiceId", ["stripeInvoiceId"])
