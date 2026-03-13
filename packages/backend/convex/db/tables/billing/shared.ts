import { v } from "convex/values"

export const billingAddressFields = {
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  line1: v.optional(v.string()),
  line2: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  state: v.optional(v.string()),
}

export const billingAddressValidator = v.object(billingAddressFields)

export const billingTaxExemptValidator = v.union(
  v.literal("none"),
  v.literal("exempt"),
  v.literal("reverse")
)

export const billingTaxIdFields = {
  country: v.optional(v.string()),
  stripeTaxIdId: v.string(),
  type: v.string(),
  value: v.string(),
  verificationStatus: v.optional(v.string()),
}

export const billingTaxIdValidator = v.object(billingTaxIdFields)
