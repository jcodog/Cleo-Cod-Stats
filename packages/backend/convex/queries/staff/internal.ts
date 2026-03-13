import type { Doc } from "../../_generated/dataModel"
import { internalQuery } from "../../_generated/server"
import { v } from "convex/values"
import { getWebhookObjectIdsFromPayloadJson } from "../../lib/billingStripe"
import { resolveConfiguredUserRole } from "../../lib/staffRoleConfig"

type UserRecord = Doc<"users">
type BillingPlanRecord = Doc<"billingPlans">
type BillingFeatureRecord = Doc<"billingFeatures">

function sortUsers(left: UserRecord, right: UserRecord) {
  return left.name.localeCompare(right.name)
}

function sortBySortOrderAndKey<
  T extends BillingPlanRecord | BillingFeatureRecord,
>(left: T, right: T) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder
  }

  return left.key.localeCompare(right.key)
}

export const getUserByClerkUserId = internalQuery({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) =>
        query.eq("clerkUserId", args.clerkUserId)
      )
      .unique()
  },
})

export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId)
  },
})

export const getManagementRecords = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [users, roleAuditLogs] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db
        .query("staffAuditLogs")
        .withIndex("by_entityType_createdAt", (query) =>
          query.eq("entityType", "user")
        )
        .order("desc")
        .take(75),
    ])

    return {
      roleAuditLogs,
      users: users.sort(sortUsers).map((user) => ({
        clerkUserId: user.clerkUserId,
        discordId: user.discordId,
        name: user.name,
        role:
          resolveConfiguredUserRole({
            discordId: user.discordId,
            role: user.role ?? null,
          }) ?? undefined,
        status: user.status,
      })),
    }
  },
})

export const getBillingRecords = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [
      plans,
      features,
      planFeatures,
      subscriptions,
      customers,
      accessGrants,
      webhookEvents,
      users,
      auditLogs,
    ] = await Promise.all([
      ctx.db.query("billingPlans").collect(),
      ctx.db.query("billingFeatures").collect(),
      ctx.db.query("billingPlanFeatures").collect(),
      ctx.db.query("billingSubscriptions").collect(),
      ctx.db.query("billingCustomers").collect(),
      ctx.db.query("billingAccessGrants").collect(),
      ctx.db
        .query("billingWebhookEvents")
        .withIndex("by_receivedAt")
        .order("desc")
        .take(200),
      ctx.db.query("users").collect(),
      ctx.db
        .query("staffAuditLogs")
        .withIndex("by_createdAt")
        .order("desc")
        .take(200),
    ])

    return {
      auditLogs: auditLogs.filter((log) => log.entityType.startsWith("billing")),
      accessGrants,
      customers,
      features: features.sort(sortBySortOrderAndKey),
      planFeatures,
      plans: plans.sort(sortBySortOrderAndKey),
      subscriptions: subscriptions.sort((left, right) => right.updatedAt - left.updatedAt),
      users: users.sort(sortUsers),
      webhookEvents,
    }
  },
})

export const getBillingWebhookLedgerRecords = internalQuery({
  args: {},
  handler: async (ctx) => {
    const webhookEvents = await ctx.db
      .query("billingWebhookEvents")
      .withIndex("by_receivedAt")
      .order("desc")
      .collect()

    return webhookEvents.map((event) => ({
      ...(getWebhookObjectIdsFromPayloadJson(event.payloadJson) ?? {}),
      _id: event._id,
      customerId:
        event.customerId ??
        getWebhookObjectIdsFromPayloadJson(event.payloadJson)?.customerId,
      errorMessage: event.errorMessage,
      eventType: event.eventType,
      hasPayloadJson: event.payloadJson !== undefined,
      invoiceId:
        event.invoiceId ??
        getWebhookObjectIdsFromPayloadJson(event.payloadJson)?.invoiceId,
      paymentIntentId:
        event.paymentIntentId ??
        getWebhookObjectIdsFromPayloadJson(event.payloadJson)?.paymentIntentId,
      processedAt: event.processedAt,
      processingStatus: event.processingStatus,
      payloadUnavailableAt: event.payloadUnavailableAt,
      payloadUnavailableReason: event.payloadUnavailableReason,
      receivedAt: event.receivedAt,
      safeSummary: event.safeSummary,
      stripeEventId: event.stripeEventId,
      subscriptionId:
        event.subscriptionId ??
        getWebhookObjectIdsFromPayloadJson(event.payloadJson)?.subscriptionId,
    }))
  },
})

export const getBillingWebhookEventById = internalQuery({
  args: {
    eventId: v.id("billingWebhookEvents"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)

    if (!event) {
      return null
    }

    const derivedObjectIds = getWebhookObjectIdsFromPayloadJson(event.payloadJson)

    return {
      _id: event._id,
      customerId: event.customerId ?? derivedObjectIds?.customerId,
      errorMessage: event.errorMessage,
      eventType: event.eventType,
      invoiceId: event.invoiceId ?? derivedObjectIds?.invoiceId,
      paymentIntentId:
        event.paymentIntentId ?? derivedObjectIds?.paymentIntentId,
      payloadJson: event.payloadJson,
      payloadUnavailableAt: event.payloadUnavailableAt,
      payloadUnavailableReason: event.payloadUnavailableReason,
      processedAt: event.processedAt,
      processingStatus: event.processingStatus,
      receivedAt: event.receivedAt,
      safeSummary: event.safeSummary,
      stripeEventId: event.stripeEventId,
      subscriptionId: event.subscriptionId ?? derivedObjectIds?.subscriptionId,
    }
  },
})

export const getOverviewRecords = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [users, plans, features, subscriptions, auditLogs] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("billingPlans").collect(),
      ctx.db.query("billingFeatures").collect(),
      ctx.db.query("billingSubscriptions").collect(),
      ctx.db
        .query("staffAuditLogs")
        .withIndex("by_createdAt")
        .order("desc")
        .take(200),
    ])

    return {
      auditLogs,
      features: features.sort(sortBySortOrderAndKey),
      plans: plans.sort(sortBySortOrderAndKey),
      subscriptions: subscriptions.sort((left, right) => right.updatedAt - left.updatedAt),
      users: users.sort(sortUsers).map((user) => ({
        clerkUserId: user.clerkUserId,
        role:
          resolveConfiguredUserRole({
            discordId: user.discordId,
            role: user.role ?? null,
          }) ?? undefined,
        status: user.status,
      })),
    }
  },
})
