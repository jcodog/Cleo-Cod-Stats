import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import {
  billingAddressValidator,
  billingTaxExemptValidator,
  billingTaxIdValidator,
} from "../../db/tables/billing/shared"

const billingIntervalValidator = v.union(v.literal("month"), v.literal("year"))
const subscriptionStatusValidator = v.union(
  v.literal("incomplete"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("unpaid"),
  v.literal("paused"),
  v.literal("incomplete_expired")
)
const billingAttentionStatusValidator = v.union(
  v.literal("none"),
  v.literal("payment_failed"),
  v.literal("past_due"),
  v.literal("requires_action"),
  v.literal("paused")
)
const billingScheduledChangeTypeValidator = v.union(
  v.literal("cancel"),
  v.literal("plan_change")
)

const billingPaymentMethodSnapshotValidator = v.object({
  bankName: v.optional(v.string()),
  billingAddress: v.optional(billingAddressValidator),
  brand: v.optional(v.string()),
  cardholderName: v.optional(v.string()),
  expMonth: v.optional(v.number()),
  expYear: v.optional(v.number()),
  last4: v.optional(v.string()),
  stripePaymentMethodId: v.string(),
  type: v.string(),
})

const billingInvoiceSnapshotValidator = v.object({
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
  stripeInvoiceId: v.string(),
  stripeSubscriptionId: v.optional(v.string()),
})

type BillingCustomerPatch = Partial<
  Pick<
    Doc<"billingCustomers">,
    | "active"
    | "billingAddress"
    | "businessName"
    | "clerkUserId"
    | "defaultPaymentMethodId"
    | "email"
    | "lastSyncedAt"
    | "name"
    | "phone"
    | "stripeCustomerId"
    | "taxExempt"
    | "taxIds"
    | "updatedAt"
    | "userId"
  >
>

type BillingSubscriptionPatch = Partial<
  Pick<
    Doc<"billingSubscriptions">,
    | "attentionStatus"
    | "attentionUpdatedAt"
    | "cancelAt"
    | "cancelAtPeriodEnd"
    | "canceledAt"
    | "clerkUserId"
    | "currentPeriodEnd"
    | "currentPeriodStart"
    | "defaultPaymentMethodId"
    | "endedAt"
    | "interval"
    | "lastStripeEventId"
    | "planKey"
    | "quantity"
    | "scheduledChangeAt"
    | "scheduledChangeRequestedAt"
    | "scheduledChangeType"
    | "scheduledInterval"
    | "scheduledPlanKey"
    | "startedAt"
    | "status"
    | "stripeCustomerId"
    | "stripeLatestInvoiceId"
    | "stripeLatestPaymentIntentId"
    | "stripePriceId"
    | "stripeProductId"
    | "stripeScheduleId"
    | "stripeSubscriptionId"
    | "stripeSubscriptionItemId"
    | "trialEnd"
    | "trialStart"
    | "updatedAt"
    | "userId"
  >
>

function hasChanged<T extends object>(patch: T) {
  return Object.keys(patch).length > 0
}

function hasJsonChanged(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) !== JSON.stringify(right ?? null)
}

async function getExistingSubscriptionRecord(args: {
  ctx: MutationCtx
  stripeSubscriptionId: string
}) {
  return await args.ctx.db
    .query("billingSubscriptions")
    .withIndex("by_stripeSubscriptionId", (query) =>
      query.eq("stripeSubscriptionId", args.stripeSubscriptionId)
    )
    .unique()
}

export const upsertBillingCustomer = internalMutation({
  args: {
    active: v.boolean(),
    billingAddress: v.optional(billingAddressValidator),
    businessName: v.optional(v.string()),
    clerkUserId: v.string(),
    defaultPaymentMethodId: v.optional(v.string()),
    email: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    stripeCustomerId: v.string(),
    taxExempt: v.optional(billingTaxExemptValidator),
    taxIds: v.optional(v.array(billingTaxIdValidator)),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingByStripeCustomerId = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripeCustomerId", (query) =>
        query.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique()
    const existingByUserId = await ctx.db
      .query("billingCustomers")
      .withIndex("by_userId", (query) => query.eq("userId", args.userId))
      .unique()
    const existingCustomer = existingByStripeCustomerId ?? existingByUserId

    if (!existingCustomer) {
      return await ctx.db.insert("billingCustomers", {
        active: args.active,
        billingAddress: args.billingAddress,
        businessName: args.businessName,
        clerkUserId: args.clerkUserId,
        createdAt: now,
        defaultPaymentMethodId: args.defaultPaymentMethodId,
        email: args.email,
        lastSyncedAt: args.lastSyncedAt,
        name: args.name,
        phone: args.phone,
        stripeCustomerId: args.stripeCustomerId,
        taxExempt: args.taxExempt,
        taxIds: args.taxIds,
        updatedAt: now,
        userId: args.userId,
      })
    }

    const patch: BillingCustomerPatch = {}

    if (existingCustomer.active !== args.active) patch.active = args.active
    if (hasJsonChanged(existingCustomer.billingAddress, args.billingAddress)) {
      patch.billingAddress = args.billingAddress
    }
    if ((existingCustomer.businessName ?? undefined) !== args.businessName) {
      patch.businessName = args.businessName
    }
    if (existingCustomer.clerkUserId !== args.clerkUserId) {
      patch.clerkUserId = args.clerkUserId
    }
    if (
      (existingCustomer.defaultPaymentMethodId ?? undefined) !==
      args.defaultPaymentMethodId
    ) {
      patch.defaultPaymentMethodId = args.defaultPaymentMethodId
    }
    if ((existingCustomer.email ?? undefined) !== args.email) patch.email = args.email
    if ((existingCustomer.lastSyncedAt ?? undefined) !== args.lastSyncedAt) {
      patch.lastSyncedAt = args.lastSyncedAt
    }
    if ((existingCustomer.name ?? undefined) !== args.name) patch.name = args.name
    if ((existingCustomer.phone ?? undefined) !== args.phone) patch.phone = args.phone
    if (existingCustomer.stripeCustomerId !== args.stripeCustomerId) {
      patch.stripeCustomerId = args.stripeCustomerId
    }
    if ((existingCustomer.taxExempt ?? undefined) !== args.taxExempt) {
      patch.taxExempt = args.taxExempt
    }
    if (hasJsonChanged(existingCustomer.taxIds, args.taxIds)) {
      patch.taxIds = args.taxIds
    }
    if (existingCustomer.userId !== args.userId) patch.userId = args.userId

    if (!hasChanged(patch)) {
      return existingCustomer._id
    }

    patch.updatedAt = now
    await ctx.db.patch(existingCustomer._id, patch)

    return existingCustomer._id
  },
})

export const upsertBillingSubscription = internalMutation({
  args: {
    attentionStatus: billingAttentionStatusValidator,
    attentionUpdatedAt: v.optional(v.number()),
    cancelAt: v.optional(v.number()),
    cancelAtPeriodEnd: v.boolean(),
    canceledAt: v.optional(v.number()),
    clerkUserId: v.string(),
    clearScheduledChange: v.optional(v.boolean()),
    currentPeriodEnd: v.optional(v.number()),
    currentPeriodStart: v.optional(v.number()),
    defaultPaymentMethodId: v.optional(v.string()),
    endedAt: v.optional(v.number()),
    interval: billingIntervalValidator,
    lastStripeEventId: v.optional(v.string()),
    planKey: v.string(),
    quantity: v.optional(v.number()),
    scheduledChangeAt: v.optional(v.number()),
    scheduledChangeRequestedAt: v.optional(v.number()),
    scheduledChangeType: v.optional(billingScheduledChangeTypeValidator),
    scheduledInterval: v.optional(billingIntervalValidator),
    scheduledPlanKey: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    status: subscriptionStatusValidator,
    stripeCustomerId: v.string(),
    stripeLatestInvoiceId: v.optional(v.string()),
    stripeLatestPaymentIntentId: v.optional(v.string()),
    stripePriceId: v.string(),
    stripeProductId: v.optional(v.string()),
    stripeScheduleId: v.optional(v.string()),
    stripeSubscriptionId: v.string(),
    stripeSubscriptionItemId: v.optional(v.string()),
    trialEnd: v.optional(v.number()),
    trialStart: v.optional(v.number()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingSubscription = await getExistingSubscriptionRecord({
      ctx,
      stripeSubscriptionId: args.stripeSubscriptionId,
    })

    const scheduledFields =
      args.clearScheduledChange === true
        ? {
            scheduledChangeAt: undefined,
            scheduledChangeRequestedAt: undefined,
            scheduledChangeType: undefined,
            scheduledInterval: undefined,
            scheduledPlanKey: undefined,
          }
        : {
            scheduledChangeAt: args.scheduledChangeAt,
            scheduledChangeRequestedAt: args.scheduledChangeRequestedAt,
            scheduledChangeType: args.scheduledChangeType,
            scheduledInterval: args.scheduledInterval,
            scheduledPlanKey: args.scheduledPlanKey,
          }

    if (!existingSubscription) {
      return await ctx.db.insert("billingSubscriptions", {
        attentionStatus: args.attentionStatus,
        attentionUpdatedAt: args.attentionUpdatedAt,
        cancelAt: args.cancelAt,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        canceledAt: args.canceledAt,
        clerkUserId: args.clerkUserId,
        createdAt: now,
        currentPeriodEnd: args.currentPeriodEnd,
        currentPeriodStart: args.currentPeriodStart,
        defaultPaymentMethodId: args.defaultPaymentMethodId,
        endedAt: args.endedAt,
        interval: args.interval,
        lastStripeEventId: args.lastStripeEventId,
        planKey: args.planKey,
        quantity: args.quantity,
        startedAt: args.startedAt,
        status: args.status,
        stripeCustomerId: args.stripeCustomerId,
        stripeLatestInvoiceId: args.stripeLatestInvoiceId,
        stripeLatestPaymentIntentId: args.stripeLatestPaymentIntentId,
        stripePriceId: args.stripePriceId,
        stripeProductId: args.stripeProductId,
        stripeScheduleId: args.stripeScheduleId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        stripeSubscriptionItemId: args.stripeSubscriptionItemId,
        trialEnd: args.trialEnd,
        trialStart: args.trialStart,
        updatedAt: now,
        userId: args.userId,
        ...scheduledFields,
      })
    }

    const patch: BillingSubscriptionPatch = {}

    if (existingSubscription.attentionStatus !== args.attentionStatus) {
      patch.attentionStatus = args.attentionStatus
    }
    if (
      (existingSubscription.attentionUpdatedAt ?? undefined) !==
      args.attentionUpdatedAt
    ) {
      patch.attentionUpdatedAt = args.attentionUpdatedAt
    }
    if ((existingSubscription.cancelAt ?? undefined) !== args.cancelAt) {
      patch.cancelAt = args.cancelAt
    }
    if (existingSubscription.cancelAtPeriodEnd !== args.cancelAtPeriodEnd) {
      patch.cancelAtPeriodEnd = args.cancelAtPeriodEnd
    }
    if ((existingSubscription.canceledAt ?? undefined) !== args.canceledAt) {
      patch.canceledAt = args.canceledAt
    }
    if (existingSubscription.clerkUserId !== args.clerkUserId) {
      patch.clerkUserId = args.clerkUserId
    }
    if (
      (existingSubscription.currentPeriodEnd ?? undefined) !==
      args.currentPeriodEnd
    ) {
      patch.currentPeriodEnd = args.currentPeriodEnd
    }
    if (
      (existingSubscription.currentPeriodStart ?? undefined) !==
      args.currentPeriodStart
    ) {
      patch.currentPeriodStart = args.currentPeriodStart
    }
    if (
      (existingSubscription.defaultPaymentMethodId ?? undefined) !==
      args.defaultPaymentMethodId
    ) {
      patch.defaultPaymentMethodId = args.defaultPaymentMethodId
    }
    if ((existingSubscription.endedAt ?? undefined) !== args.endedAt) {
      patch.endedAt = args.endedAt
    }
    if (existingSubscription.interval !== args.interval) patch.interval = args.interval
    if (
      (existingSubscription.lastStripeEventId ?? undefined) !==
      args.lastStripeEventId
    ) {
      patch.lastStripeEventId = args.lastStripeEventId
    }
    if (existingSubscription.planKey !== args.planKey) patch.planKey = args.planKey
    if ((existingSubscription.quantity ?? undefined) !== args.quantity) {
      patch.quantity = args.quantity
    }
    if (
      (existingSubscription.scheduledChangeAt ?? undefined) !==
      scheduledFields.scheduledChangeAt
    ) {
      patch.scheduledChangeAt = scheduledFields.scheduledChangeAt
    }
    if (
      (existingSubscription.scheduledChangeRequestedAt ?? undefined) !==
      scheduledFields.scheduledChangeRequestedAt
    ) {
      patch.scheduledChangeRequestedAt = scheduledFields.scheduledChangeRequestedAt
    }
    if (
      (existingSubscription.scheduledChangeType ?? undefined) !==
      scheduledFields.scheduledChangeType
    ) {
      patch.scheduledChangeType = scheduledFields.scheduledChangeType
    }
    if (
      (existingSubscription.scheduledInterval ?? undefined) !==
      scheduledFields.scheduledInterval
    ) {
      patch.scheduledInterval = scheduledFields.scheduledInterval
    }
    if (
      (existingSubscription.scheduledPlanKey ?? undefined) !==
      scheduledFields.scheduledPlanKey
    ) {
      patch.scheduledPlanKey = scheduledFields.scheduledPlanKey
    }
    if (existingSubscription.status !== args.status) patch.status = args.status
    if (existingSubscription.stripeCustomerId !== args.stripeCustomerId) {
      patch.stripeCustomerId = args.stripeCustomerId
    }
    if (
      (existingSubscription.stripeLatestInvoiceId ?? undefined) !==
      args.stripeLatestInvoiceId
    ) {
      patch.stripeLatestInvoiceId = args.stripeLatestInvoiceId
    }
    if (
      (existingSubscription.stripeLatestPaymentIntentId ?? undefined) !==
      args.stripeLatestPaymentIntentId
    ) {
      patch.stripeLatestPaymentIntentId = args.stripeLatestPaymentIntentId
    }
    if (existingSubscription.stripePriceId !== args.stripePriceId) {
      patch.stripePriceId = args.stripePriceId
    }
    if (
      (existingSubscription.stripeProductId ?? undefined) !== args.stripeProductId
    ) {
      patch.stripeProductId = args.stripeProductId
    }
    if (
      (existingSubscription.stripeScheduleId ?? undefined) !== args.stripeScheduleId
    ) {
      patch.stripeScheduleId = args.stripeScheduleId
    }
    if (existingSubscription.stripeSubscriptionId !== args.stripeSubscriptionId) {
      patch.stripeSubscriptionId = args.stripeSubscriptionId
    }
    if (
      (existingSubscription.stripeSubscriptionItemId ?? undefined) !==
      args.stripeSubscriptionItemId
    ) {
      patch.stripeSubscriptionItemId = args.stripeSubscriptionItemId
    }
    if ((existingSubscription.startedAt ?? undefined) !== args.startedAt) {
      patch.startedAt = args.startedAt
    }
    if ((existingSubscription.trialEnd ?? undefined) !== args.trialEnd) {
      patch.trialEnd = args.trialEnd
    }
    if ((existingSubscription.trialStart ?? undefined) !== args.trialStart) {
      patch.trialStart = args.trialStart
    }
    if (existingSubscription.userId !== args.userId) patch.userId = args.userId

    if (!hasChanged(patch)) {
      return existingSubscription._id
    }

    patch.updatedAt = now
    await ctx.db.patch(existingSubscription._id, patch)

    return existingSubscription._id
  },
})

export const syncBillingPaymentMethods = internalMutation({
  args: {
    clerkUserId: v.string(),
    defaultPaymentMethodId: v.optional(v.string()),
    paymentMethods: v.array(billingPaymentMethodSnapshotValidator),
    stripeCustomerId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingRecords = await ctx.db
      .query("billingPaymentMethods")
      .withIndex("by_userId", (query) => query.eq("userId", args.userId))
      .collect()
    const existingByStripePaymentMethodId = new Map(
      existingRecords.map((record) => [record.stripePaymentMethodId, record])
    )
    const syncedIds = new Set<string>()

    for (const paymentMethod of args.paymentMethods) {
      syncedIds.add(paymentMethod.stripePaymentMethodId)

      const existingRecord = existingByStripePaymentMethodId.get(
        paymentMethod.stripePaymentMethodId
      )
      const nextValues = {
        active: true,
        bankName: paymentMethod.bankName,
        billingAddress: paymentMethod.billingAddress,
        brand: paymentMethod.brand,
        cardholderName: paymentMethod.cardholderName,
        clerkUserId: args.clerkUserId,
        expMonth: paymentMethod.expMonth,
        expYear: paymentMethod.expYear,
        isDefault: args.defaultPaymentMethodId === paymentMethod.stripePaymentMethodId,
        last4: paymentMethod.last4,
        stripeCustomerId: args.stripeCustomerId,
        stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
        type: paymentMethod.type,
        userId: args.userId,
      }

      if (!existingRecord) {
        await ctx.db.insert("billingPaymentMethods", {
          ...nextValues,
          createdAt: now,
          updatedAt: now,
        })
        continue
      }

      const patch: Partial<Doc<"billingPaymentMethods">> = {}

      if (existingRecord.active !== nextValues.active) patch.active = nextValues.active
      if ((existingRecord.bankName ?? undefined) !== nextValues.bankName) {
        patch.bankName = nextValues.bankName
      }
      if (hasJsonChanged(existingRecord.billingAddress, nextValues.billingAddress)) {
        patch.billingAddress = nextValues.billingAddress
      }
      if ((existingRecord.brand ?? undefined) !== nextValues.brand) {
        patch.brand = nextValues.brand
      }
      if ((existingRecord.cardholderName ?? undefined) !== nextValues.cardholderName) {
        patch.cardholderName = nextValues.cardholderName
      }
      if (existingRecord.clerkUserId !== nextValues.clerkUserId) {
        patch.clerkUserId = nextValues.clerkUserId
      }
      if ((existingRecord.expMonth ?? undefined) !== nextValues.expMonth) {
        patch.expMonth = nextValues.expMonth
      }
      if ((existingRecord.expYear ?? undefined) !== nextValues.expYear) {
        patch.expYear = nextValues.expYear
      }
      if (existingRecord.isDefault !== nextValues.isDefault) {
        patch.isDefault = nextValues.isDefault
      }
      if ((existingRecord.last4 ?? undefined) !== nextValues.last4) {
        patch.last4 = nextValues.last4
      }
      if (existingRecord.stripeCustomerId !== nextValues.stripeCustomerId) {
        patch.stripeCustomerId = nextValues.stripeCustomerId
      }
      if (existingRecord.type !== nextValues.type) {
        patch.type = nextValues.type
      }
      if (existingRecord.userId !== nextValues.userId) {
        patch.userId = nextValues.userId
      }

      if (!hasChanged(patch)) {
        continue
      }

      patch.updatedAt = now
      await ctx.db.patch(existingRecord._id, patch)
    }

    for (const existingRecord of existingRecords) {
      if (syncedIds.has(existingRecord.stripePaymentMethodId)) {
        continue
      }

      await ctx.db.patch(existingRecord._id, {
        active: false,
        isDefault: false,
        updatedAt: now,
      })
    }

    return {
      syncedCount: args.paymentMethods.length,
    }
  },
})

export const syncBillingInvoices = internalMutation({
  args: {
    clerkUserId: v.string(),
    invoices: v.array(billingInvoiceSnapshotValidator),
    stripeCustomerId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const existingRecords = await ctx.db
      .query("billingInvoices")
      .withIndex("by_userId", (query) => query.eq("userId", args.userId))
      .collect()
    const existingByStripeInvoiceId = new Map(
      existingRecords.map((record) => [record.stripeInvoiceId, record])
    )

    for (const invoice of args.invoices) {
      const existingRecord = existingByStripeInvoiceId.get(invoice.stripeInvoiceId)
      const nextValues = {
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        clerkUserId: args.clerkUserId,
        currency: invoice.currency,
        description: invoice.description,
        hostedInvoiceUrl: invoice.hostedInvoiceUrl,
        invoiceIssuedAt: invoice.invoiceIssuedAt,
        invoiceNumber: invoice.invoiceNumber,
        invoicePdfUrl: invoice.invoicePdfUrl,
        paymentMethodBrand: invoice.paymentMethodBrand,
        paymentMethodLast4: invoice.paymentMethodLast4,
        paymentMethodType: invoice.paymentMethodType,
        status: invoice.status,
        stripeCustomerId: args.stripeCustomerId,
        stripeInvoiceId: invoice.stripeInvoiceId,
        stripeSubscriptionId: invoice.stripeSubscriptionId,
        userId: args.userId,
      }

      if (!existingRecord) {
        await ctx.db.insert("billingInvoices", {
          ...nextValues,
          createdAt: now,
          updatedAt: now,
        })
        continue
      }

      const patch: Partial<Doc<"billingInvoices">> = {}

      if (existingRecord.amountDue !== nextValues.amountDue) {
        patch.amountDue = nextValues.amountDue
      }
      if (existingRecord.amountPaid !== nextValues.amountPaid) {
        patch.amountPaid = nextValues.amountPaid
      }
      if (existingRecord.clerkUserId !== nextValues.clerkUserId) {
        patch.clerkUserId = nextValues.clerkUserId
      }
      if (existingRecord.currency !== nextValues.currency) {
        patch.currency = nextValues.currency
      }
      if (existingRecord.description !== nextValues.description) {
        patch.description = nextValues.description
      }
      if (
        (existingRecord.hostedInvoiceUrl ?? undefined) !== nextValues.hostedInvoiceUrl
      ) {
        patch.hostedInvoiceUrl = nextValues.hostedInvoiceUrl
      }
      if (existingRecord.invoiceIssuedAt !== nextValues.invoiceIssuedAt) {
        patch.invoiceIssuedAt = nextValues.invoiceIssuedAt
      }
      if ((existingRecord.invoiceNumber ?? undefined) !== nextValues.invoiceNumber) {
        patch.invoiceNumber = nextValues.invoiceNumber
      }
      if ((existingRecord.invoicePdfUrl ?? undefined) !== nextValues.invoicePdfUrl) {
        patch.invoicePdfUrl = nextValues.invoicePdfUrl
      }
      if (
        (existingRecord.paymentMethodBrand ?? undefined) !==
        nextValues.paymentMethodBrand
      ) {
        patch.paymentMethodBrand = nextValues.paymentMethodBrand
      }
      if (
        (existingRecord.paymentMethodLast4 ?? undefined) !==
        nextValues.paymentMethodLast4
      ) {
        patch.paymentMethodLast4 = nextValues.paymentMethodLast4
      }
      if (
        (existingRecord.paymentMethodType ?? undefined) !==
        nextValues.paymentMethodType
      ) {
        patch.paymentMethodType = nextValues.paymentMethodType
      }
      if (existingRecord.status !== nextValues.status) {
        patch.status = nextValues.status
      }
      if (existingRecord.stripeCustomerId !== nextValues.stripeCustomerId) {
        patch.stripeCustomerId = nextValues.stripeCustomerId
      }
      if (
        (existingRecord.stripeSubscriptionId ?? undefined) !==
        nextValues.stripeSubscriptionId
      ) {
        patch.stripeSubscriptionId = nextValues.stripeSubscriptionId
      }
      if (existingRecord.userId !== nextValues.userId) {
        patch.userId = nextValues.userId
      }

      if (!hasChanged(patch)) {
        continue
      }

      patch.updatedAt = now
      await ctx.db.patch(existingRecord._id, patch)
    }

    return {
      syncedCount: args.invoices.length,
    }
  },
})

export const deleteBillingSubscriptionsMissingFromSync = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionIds: v.array(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const existingRecords = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_userId", (query) => query.eq("userId", args.userId))
      .collect()
    const syncedIds = new Set(args.stripeSubscriptionIds)
    let deletedCount = 0

    for (const record of existingRecords) {
      if (record.stripeCustomerId !== args.stripeCustomerId) {
        continue
      }

      if (syncedIds.has(record.stripeSubscriptionId)) {
        continue
      }

      await ctx.db.delete(record._id)
      deletedCount += 1
    }

    return {
      deletedCount,
    }
  },
})

export const setSubscriptionScheduledChange = internalMutation({
  args: {
    scheduledChangeAt: v.number(),
    scheduledChangeRequestedAt: v.number(),
    scheduledChangeType: billingScheduledChangeTypeValidator,
    scheduledInterval: v.optional(billingIntervalValidator),
    scheduledPlanKey: v.optional(v.string()),
    stripeScheduleId: v.optional(v.string()),
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripeSubscriptionId", (query) =>
        query.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique()

    if (!subscription) {
      throw new Error(
        `Billing subscription not found: ${args.stripeSubscriptionId}`
      )
    }

    await ctx.db.patch(subscription._id, {
      scheduledChangeAt: args.scheduledChangeAt,
      scheduledChangeRequestedAt: args.scheduledChangeRequestedAt,
      scheduledChangeType: args.scheduledChangeType,
      scheduledInterval: args.scheduledInterval,
      scheduledPlanKey: args.scheduledPlanKey,
      stripeScheduleId: args.stripeScheduleId,
      updatedAt: Date.now(),
    })

    return subscription._id
  },
})

export const clearSubscriptionScheduledChange = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripeSubscriptionId", (query) =>
        query.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique()

    if (!subscription) {
      return null
    }

    await ctx.db.patch(subscription._id, {
      scheduledChangeAt: undefined,
      scheduledChangeRequestedAt: undefined,
      scheduledChangeType: undefined,
      scheduledInterval: undefined,
      scheduledPlanKey: undefined,
      stripeScheduleId: undefined,
      updatedAt: Date.now(),
    })

    return subscription._id
  },
})

export const recordWebhookEventReceived = internalMutation({
  args: {
    customerId: v.optional(v.string()),
    eventType: v.string(),
    invoiceId: v.optional(v.string()),
    paymentIntentId: v.optional(v.string()),
    safeSummary: v.string(),
    stripeEventId: v.string(),
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("billingWebhookEvents")
      .withIndex("by_stripeEventId", (query) =>
        query.eq("stripeEventId", args.stripeEventId)
      )
      .unique()

    if (existingEvent) {
      return {
        alreadyExists: true,
        eventId: existingEvent._id,
        processingStatus: existingEvent.processingStatus,
      }
    }

    const now = Date.now()
    const eventId = await ctx.db.insert("billingWebhookEvents", {
      createdAt: now,
      customerId: args.customerId,
      errorMessage: undefined,
      eventType: args.eventType,
      invoiceId: args.invoiceId,
      paymentIntentId: args.paymentIntentId,
      processedAt: undefined,
      processingStatus: "received",
      receivedAt: now,
      safeSummary: args.safeSummary,
      stripeEventId: args.stripeEventId,
      subscriptionId: args.subscriptionId,
      updatedAt: now,
    })

    return {
      alreadyExists: false,
      eventId,
      processingStatus: "received" as const,
    }
  },
})

export const markWebhookEventProcessing = internalMutation({
  args: {
    stripeEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("billingWebhookEvents")
      .withIndex("by_stripeEventId", (query) =>
        query.eq("stripeEventId", args.stripeEventId)
      )
      .unique()

    if (!existingEvent) {
      return null
    }

    if (
      existingEvent.processingStatus === "processed" ||
      existingEvent.processingStatus === "ignored"
    ) {
      return existingEvent._id
    }

    await ctx.db.patch(existingEvent._id, {
      processingStatus: "processing",
      updatedAt: Date.now(),
    })

    return existingEvent._id
  },
})

export const markWebhookEventProcessed = internalMutation({
  args: {
    processingStatus: v.union(v.literal("processed"), v.literal("ignored")),
    stripeEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("billingWebhookEvents")
      .withIndex("by_stripeEventId", (query) =>
        query.eq("stripeEventId", args.stripeEventId)
      )
      .unique()

    if (!existingEvent) {
      return null
    }

    await ctx.db.patch(existingEvent._id, {
      errorMessage: undefined,
      processedAt: Date.now(),
      processingStatus: args.processingStatus,
      updatedAt: Date.now(),
    })

    return existingEvent._id
  },
})

export const markWebhookEventFailed = internalMutation({
  args: {
    errorMessage: v.string(),
    stripeEventId: v.string(),
  },
  handler: async (ctx, args) => {
    const existingEvent = await ctx.db
      .query("billingWebhookEvents")
      .withIndex("by_stripeEventId", (query) =>
        query.eq("stripeEventId", args.stripeEventId)
      )
      .unique()

    if (!existingEvent) {
      return null
    }

    await ctx.db.patch(existingEvent._id, {
      errorMessage: args.errorMessage,
      processedAt: Date.now(),
      processingStatus: "failed",
      updatedAt: Date.now(),
    })

    return existingEvent._id
  },
})

export const grantBillingAccessGrant = internalMutation({
  args: {
    clerkUserId: v.string(),
    endsAt: v.optional(v.number()),
    grantedByClerkUserId: v.optional(v.string()),
    grantedByName: v.optional(v.string()),
    planKey: v.string(),
    reason: v.string(),
    source: v.union(
      v.literal("creator_approval"),
      v.literal("manual"),
      v.literal("promo")
    ),
    startsAt: v.optional(v.number()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now()
    const grants = await ctx.db
      .query("billingAccessGrants")
      .withIndex("by_userId", (query) => query.eq("userId", args.userId))
      .collect()
    const activeGrantsForSource = grants.filter(
      (grant) => grant.active && grant.source === args.source
    )
    const matchingGrant = activeGrantsForSource.find(
      (grant) => grant.planKey === args.planKey
    )

    for (const grant of activeGrantsForSource) {
      if (matchingGrant?._id === grant._id) {
        continue
      }

      await ctx.db.patch(grant._id, {
        active: false,
        revokedAt: now,
        revokedByClerkUserId: args.grantedByClerkUserId,
        revokedByName: args.grantedByName,
        updatedAt: now,
      })
    }

    if (matchingGrant) {
      await ctx.db.patch(matchingGrant._id, {
        active: true,
        endsAt: args.endsAt,
        grantedByClerkUserId: args.grantedByClerkUserId,
        grantedByName: args.grantedByName,
        reason: args.reason,
        revokedAt: undefined,
        revokedByClerkUserId: undefined,
        revokedByName: undefined,
        startsAt: args.startsAt,
        updatedAt: now,
      })

      return matchingGrant._id
    }

    return await ctx.db.insert("billingAccessGrants", {
      active: true,
      clerkUserId: args.clerkUserId,
      createdAt: now,
      endsAt: args.endsAt,
      grantedByClerkUserId: args.grantedByClerkUserId,
      grantedByName: args.grantedByName,
      planKey: args.planKey,
      reason: args.reason,
      revokedAt: undefined,
      revokedByClerkUserId: undefined,
      revokedByName: undefined,
      source: args.source,
      startsAt: args.startsAt,
      updatedAt: now,
      userId: args.userId,
    })
  },
})

export const revokeBillingAccessGrant = internalMutation({
  args: {
    grantId: v.id("billingAccessGrants"),
    revokedByClerkUserId: v.optional(v.string()),
    revokedByName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const grant = await ctx.db.get(args.grantId)

    if (!grant) {
      return null
    }

    if (!grant.active) {
      return grant._id
    }

    await ctx.db.patch(grant._id, {
      active: false,
      revokedAt: Date.now(),
      revokedByClerkUserId: args.revokedByClerkUserId,
      revokedByName: args.revokedByName,
      updatedAt: Date.now(),
    })

    return grant._id
  },
})
