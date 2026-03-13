"use node"

import type Stripe from "stripe"
import { v } from "convex/values"
import { action } from "../../_generated/server"
import { internal } from "../../_generated/api"
import { maskIdentifier } from "../../lib/billing"
import { requireAuthorizedStaffAction } from "../../lib/staffActionAuth"
import {
  resolveBillingFeatureApplyMode,
  type UserRole,
} from "../../lib/staffRoles"
import type {
  StaffAuditLogEntry,
  StaffBillingCustomerRecord,
  StaffBillingDashboard,
  StaffBillingFeatureRecord,
  StaffBillingPlanRecord,
  StaffBillingSyncSummary,
  StaffBillingUserLookupRecord,
  StaffCreatorGrantRecord,
  StaffImpactPreview,
  StaffMutationResponse,
  StaffSubscriptionImpactRow,
  StaffWebhookEventRecord,
  StaffWebhookEventDetail,
  StaffWebhookLedgerDashboard,
  StaffWebhookLedgerRecord,
  StaffWebhookMetrics,
  StaffWebhookTimelinePoint,
} from "../../lib/staffTypes"
import { getStripe } from "../../lib/stripe"
import type { StripeCatalogSyncResult } from "../billing/syncCatalogToStripe"

type SubscriptionStatus = "active" | "past_due" | "paused" | "trialing"

function mapAuditLogEntry(log: {
  _id: string
  action: string
  actorClerkUserId: string
  actorName: string
  actorRole: UserRole
  createdAt: number
  details?: string
  entityId: string
  entityLabel?: string
  entityType: string
  result: "error" | "success" | "warning"
  summary: string
}): StaffAuditLogEntry {
  return {
    action: log.action,
    actorClerkUserId: log.actorClerkUserId,
    actorName: log.actorName,
    actorRole: log.actorRole,
    createdAt: log.createdAt,
    details: log.details,
    entityId: log.entityId,
    entityLabel: log.entityLabel,
    entityType: log.entityType,
    id: log._id,
    result: log.result,
    summary: log.summary,
  }
}

function isImpactStatus(status: string): status is SubscriptionStatus {
  return (
    status === "active" ||
    status === "trialing" ||
    status === "past_due" ||
    status === "paused"
  )
}

function canViewFullBillingIdentifiers(role: UserRole) {
  return role === "admin" || role === "super_admin"
}

function maskBillingIdentifier(
  value: string | undefined,
  options: {
    full: boolean
  }
) {
  return maskIdentifier(value, { full: options.full })
}

function getAccessGrantPriority(
  source: "creator_approval" | "manual" | "promo"
) {
  switch (source) {
    case "creator_approval":
      return 3
    case "manual":
      return 2
    case "promo":
      return 1
  }
}

function isActiveAccessGrant(
  args: {
    active: boolean
    endsAt?: number
    startsAt?: number
  },
  now: number
) {
  if (!args.active) {
    return false
  }

  if (args.startsAt !== undefined && args.startsAt > now) {
    return false
  }

  if (args.endsAt !== undefined && args.endsAt <= now) {
    return false
  }

  return true
}

function uniqueAssignments(
  assignments: Array<{
    enabled: boolean
    featureKey: string
    planKey: string
  }>
) {
  const byCompositeKey = new Map<string, (typeof assignments)[number]>()

  for (const assignment of assignments) {
    byCompositeKey.set(
      `${assignment.planKey}:${assignment.featureKey}`,
      assignment
    )
  }

  return Array.from(byCompositeKey.values())
}

function buildSyncSummaryFromResult(
  result: Pick<StripeCatalogSyncResult, "syncedAt" | "warnings">
): StaffBillingSyncSummary {
  const warningCount = result.warnings.length

  return {
    result: warningCount > 0 ? "warning" : "success",
    summary:
      warningCount > 0
        ? `Stripe catalog synchronized with ${warningCount} warning(s).`
        : "Stripe catalog synchronized successfully.",
    syncedAt: result.syncedAt,
    warningCount,
  }
}

function parseSyncSummary(details?: string): StaffBillingSyncSummary | null {
  if (!details) {
    return null
  }

  try {
    const parsed = JSON.parse(details) as {
      result?: "error" | "success" | "warning"
      summary?: string
      syncedAt?: number
      warningCount?: number
    }

    if (
      typeof parsed.summary === "string" &&
      typeof parsed.syncedAt === "number" &&
      typeof parsed.warningCount === "number" &&
      (parsed.result === "error" ||
        parsed.result === "success" ||
        parsed.result === "warning")
    ) {
      return {
        result: parsed.result,
        summary: parsed.summary,
        syncedAt: parsed.syncedAt,
        warningCount: parsed.warningCount,
      }
    }
  } catch {
    return null
  }

  return null
}

function validateCatalogKey(value: string, label: string) {
  const normalizedValue = value.trim().toLowerCase()

  if (!/^[a-z0-9][a-z0-9-_]{1,63}$/.test(normalizedValue)) {
    throw new Error(
      `${label} must be 2-64 characters and use only lowercase letters, numbers, hyphens, or underscores.`
    )
  }

  return normalizedValue
}

function validateDisplayName(value: string, label: string) {
  const normalizedValue = value.trim()

  if (!normalizedValue) {
    throw new Error(`${label} is required.`)
  }

  if (normalizedValue.length > 120) {
    throw new Error(`${label} must be 120 characters or fewer.`)
  }

  return normalizedValue
}

function normalizeDescription(value: string) {
  return value.trim()
}

function normalizeCurrency(value: string) {
  const normalizedValue = value.trim().toLowerCase()

  if (!/^[a-z]{3}$/.test(normalizedValue)) {
    throw new Error("Currency must be a three-letter ISO code.")
  }

  return normalizedValue
}

function validatePriceAmount(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number in minor currency units.`)
  }

  return value
}

function normalizeCatalogKeyList(values: string[], label: string) {
  return Array.from(
    new Set(values.map((value) => validateCatalogKey(value, label)))
  ).sort((left, right) => left.localeCompare(right))
}

function getFeatureKeyDelta(args: {
  nextFeatureKeys: string[]
  previousFeatureKeys: string[]
}) {
  const previousFeatureKeys = new Set(args.previousFeatureKeys)
  const nextFeatureKeys = new Set(args.nextFeatureKeys)

  return {
    addedFeatureKeys: args.nextFeatureKeys.filter(
      (featureKey) => !previousFeatureKeys.has(featureKey)
    ),
    removedFeatureKeys: args.previousFeatureKeys.filter(
      (featureKey) => !nextFeatureKeys.has(featureKey)
    ),
  }
}

function getPlanKeyDelta(args: {
  nextPlanKeys: string[]
  previousPlanKeys: string[]
}) {
  const previousPlanKeys = new Set(args.previousPlanKeys)
  const nextPlanKeys = new Set(args.nextPlanKeys)

  return {
    addedPlanKeys: args.nextPlanKeys.filter(
      (planKey) => !previousPlanKeys.has(planKey)
    ),
    removedPlanKeys: args.previousPlanKeys.filter(
      (planKey) => !nextPlanKeys.has(planKey)
    ),
  }
}

function buildSubscriptionRows(args: {
  fullIdentifiers: boolean
  customers: Array<{
    active: boolean
    clerkUserId: string
    email?: string
    stripeCustomerId: string
  }>
  subscriptions: Array<{
    attentionStatus:
      | "none"
      | "past_due"
      | "paused"
      | "payment_failed"
      | "requires_action"
    cancelAt?: number
    cancelAtPeriodEnd: boolean
    clerkUserId: string
    currentPeriodEnd?: number
    currentPeriodStart?: number
    interval: "month" | "year"
    planKey: string
    scheduledChangeAt?: number
    scheduledChangeType?: "cancel" | "plan_change"
    scheduledInterval?: "month" | "year"
    scheduledPlanKey?: string
    status: string
    stripeCustomerId: string
    stripePriceId: string
    stripeScheduleId?: string
    stripeSubscriptionId: string
    userId: string
  }>
  users: Array<{
    _id: string
    clerkUserId: string
    name: string
  }>
}) {
  const usersById = new Map(args.users.map((user) => [user._id, user]))
  const customersByClerkUserId = new Map(
    args.customers.map((customer) => [customer.clerkUserId, customer])
  )

  return args.subscriptions
    .filter((subscription) => isImpactStatus(subscription.status))
    .map<StaffSubscriptionImpactRow>((subscription) => {
      const user = usersById.get(subscription.userId)
      const customer = customersByClerkUserId.get(subscription.clerkUserId)

      return {
        attentionStatus: subscription.attentionStatus,
        cancelAt: subscription.cancelAt,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        clerkUserId: subscription.clerkUserId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        currentPeriodStart: subscription.currentPeriodStart,
        email: customer?.email,
        interval: subscription.interval,
        planKey: subscription.planKey,
        scheduledChangeAt: subscription.scheduledChangeAt,
        scheduledChangeType: subscription.scheduledChangeType,
        scheduledInterval: subscription.scheduledInterval,
        scheduledPlanKey: subscription.scheduledPlanKey,
        status: subscription.status,
        stripeCustomerId: maskBillingIdentifier(subscription.stripeCustomerId, {
          full: args.fullIdentifiers,
        }),
        stripePriceId:
          maskBillingIdentifier(subscription.stripePriceId, {
            full: args.fullIdentifiers,
          }) ?? subscription.stripePriceId,
        stripeScheduleId: maskBillingIdentifier(subscription.stripeScheduleId, {
          full: args.fullIdentifiers,
        }),
        stripeSubscriptionId:
          maskBillingIdentifier(subscription.stripeSubscriptionId, {
            full: args.fullIdentifiers,
          }) ?? subscription.stripeSubscriptionId,
        userName: user?.name ?? subscription.clerkUserId,
      }
    })
}

function buildCustomerRows(args: {
  fullIdentifiers: boolean
  customers: Array<{
    active: boolean
    clerkUserId: string
    createdAt: number
    email?: string
    stripeCustomerId: string
    updatedAt: number
  }>
  subscriptions: Array<{
    clerkUserId: string
    planKey: string
    status: string
  }>
  userDirectory: StaffBillingUserLookupRecord[]
  users: Array<{
    clerkUserId: string
    name: string
  }>
}) {
  const usersByClerkUserId = new Map(
    args.users.map((user) => [user.clerkUserId, user])
  )
  const userDirectoryByClerkUserId = new Map(
    args.userDirectory.map((user) => [user.clerkUserId, user])
  )
  const subscriptionsByClerkUserId = new Map<
    string,
    Array<(typeof args.subscriptions)[number]>
  >()

  for (const subscription of args.subscriptions) {
    const customerSubscriptions =
      subscriptionsByClerkUserId.get(subscription.clerkUserId) ?? []
    customerSubscriptions.push(subscription)
    subscriptionsByClerkUserId.set(
      subscription.clerkUserId,
      customerSubscriptions
    )
  }

  return args.customers
    .map<StaffBillingCustomerRecord>((customer) => {
      const user = usersByClerkUserId.get(customer.clerkUserId)
      const userLookup = userDirectoryByClerkUserId.get(customer.clerkUserId)
      const customerSubscriptions =
        subscriptionsByClerkUserId.get(customer.clerkUserId) ?? []
      const activeSubscriptionCount = customerSubscriptions.filter(
        (subscription) => isImpactStatus(subscription.status)
      ).length
      const creatorAccessSource =
        userLookup?.currentPlanKey === "creator" ? userLookup.accessSource : "none"

      return {
        active: customer.active,
        activeSubscriptionCount,
        clerkUserId: customer.clerkUserId,
        createdAt: customer.createdAt,
        creatorAccessSource,
        email: customer.email,
        hasCreatorAccess: creatorAccessSource !== "none",
        hasCreatorGrant: userLookup?.hasCreatorGrant ?? false,
        planKeys: Array.from(
          new Set(
            customerSubscriptions.map((subscription) => subscription.planKey)
          )
        ).sort((left, right) => left.localeCompare(right)),
        stripeCustomerId:
          maskBillingIdentifier(customer.stripeCustomerId, {
            full: args.fullIdentifiers,
          }) ?? customer.stripeCustomerId,
        subscriptionCount: customerSubscriptions.length,
        updatedAt: customer.updatedAt,
        userName: user?.name ?? customer.clerkUserId,
      }
    })
    .sort((left, right) => left.userName.localeCompare(right.userName))
}

function buildWebhookMetrics(args: {
  events: Array<{
    processedAt?: number
    processingStatus:
      | "failed"
      | "ignored"
      | "processed"
      | "processing"
      | "received"
    receivedAt: number
  }>
}) {
  const timelineByDay = new Map<number, StaffWebhookTimelinePoint>()

  for (const event of args.events) {
    const day = new Date(event.receivedAt)
    day.setHours(0, 0, 0, 0)
    const dayStart = day.getTime()
    const existing = timelineByDay.get(dayStart) ?? {
      dayStart,
      failedCount: 0,
      processedCount: 0,
    }

    if (event.processingStatus === "failed") {
      existing.failedCount += 1
    }

    if (event.processingStatus === "processed") {
      existing.processedCount += 1
    }

    timelineByDay.set(dayStart, existing)
  }

  return {
    failedCount: args.events.filter(
      (event) => event.processingStatus === "failed"
    ).length,
    ignoredCount: args.events.filter(
      (event) => event.processingStatus === "ignored"
    ).length,
    lastProcessedAt: args.events.find(
      (event) => event.processedAt !== undefined
    )?.processedAt,
    lastReceivedAt: args.events[0]?.receivedAt,
    processedCount: args.events.filter(
      (event) => event.processingStatus === "processed"
    ).length,
    processingCount: args.events.filter(
      (event) => event.processingStatus === "processing"
    ).length,
    receivedCount: args.events.filter(
      (event) => event.processingStatus === "received"
    ).length,
    timeline: Array.from(timelineByDay.values()).sort(
      (left, right) => left.dayStart - right.dayStart
    ),
  } satisfies StaffWebhookMetrics
}

function buildWebhookEventRows(args: {
  events: Array<{
    _id: string
    customerId?: string
    errorMessage?: string
    eventType: string
    invoiceId?: string
    paymentIntentId?: string
    processedAt?: number
    processingStatus:
      | "failed"
      | "ignored"
      | "processed"
      | "processing"
      | "received"
    receivedAt: number
    safeSummary: string
    subscriptionId?: string
  }>
  fullIdentifiers: boolean
}) {
  return args.events.map<StaffWebhookEventRecord>((event) => ({
    customerId: maskBillingIdentifier(event.customerId, {
      full: args.fullIdentifiers,
    }),
    errorMessage: event.errorMessage,
    eventType: event.eventType,
    id: event._id,
    invoiceId: maskBillingIdentifier(event.invoiceId, {
      full: args.fullIdentifiers,
    }),
    paymentIntentId: maskBillingIdentifier(event.paymentIntentId, {
      full: args.fullIdentifiers,
    }),
    processedAt: event.processedAt,
    processingStatus: event.processingStatus,
    receivedAt: event.receivedAt,
    safeSummary: event.safeSummary,
    subscriptionId: maskBillingIdentifier(event.subscriptionId, {
      full: args.fullIdentifiers,
    }),
  }))
}

function resolveWebhookPayloadState(args: {
  hasPayloadJson?: boolean
  payloadJson?: string
  payloadUnavailableAt?: number
}) {
  if (args.hasPayloadJson || args.payloadJson !== undefined) {
    return "available" as const
  }

  if (args.payloadUnavailableAt !== undefined) {
    return "unavailable" as const
  }

  return "missing" as const
}

function buildWebhookLedgerRows(args: {
  events: Array<{
    _id: string
    customerId?: string
    errorMessage?: string
    eventType: string
    hasPayloadJson?: boolean
    invoiceId?: string
    paymentIntentId?: string
    payloadUnavailableAt?: number
    payloadUnavailableReason?: string
    processedAt?: number
    processingStatus:
      | "failed"
      | "ignored"
      | "processed"
      | "processing"
      | "received"
    receivedAt: number
    safeSummary: string
    stripeEventId: string
    subscriptionId?: string
  }>
  fullIdentifiers: boolean
}) {
  return args.events.map<StaffWebhookLedgerRecord>((event) => ({
    customerId: maskBillingIdentifier(event.customerId, {
      full: args.fullIdentifiers,
    }),
    errorMessage: event.errorMessage,
    eventType: event.eventType,
    id: event._id,
    invoiceId: maskBillingIdentifier(event.invoiceId, {
      full: args.fullIdentifiers,
    }),
    payloadState: resolveWebhookPayloadState({
      hasPayloadJson: event.hasPayloadJson,
      payloadUnavailableAt: event.payloadUnavailableAt,
    }),
    payloadUnavailableReason: event.payloadUnavailableReason,
    paymentIntentId: maskBillingIdentifier(event.paymentIntentId, {
      full: args.fullIdentifiers,
    }),
    processedAt: event.processedAt,
    processingStatus: event.processingStatus,
    receivedAt: event.receivedAt,
    safeSummary: event.safeSummary,
    stripeEventId:
      maskBillingIdentifier(event.stripeEventId, {
        full: args.fullIdentifiers,
      }) ?? event.stripeEventId,
    subscriptionId: maskBillingIdentifier(event.subscriptionId, {
      full: args.fullIdentifiers,
    }),
  }))
}

function buildWebhookEventDetail(args: {
  event: {
    _id: string
    customerId?: string
    errorMessage?: string
    eventType: string
    invoiceId?: string
    paymentIntentId?: string
    payloadJson?: string
    payloadUnavailableAt?: number
    payloadUnavailableReason?: string
    processedAt?: number
    processingStatus:
      | "failed"
      | "ignored"
      | "processed"
      | "processing"
      | "received"
    receivedAt: number
    safeSummary: string
    stripeEventId: string
    subscriptionId?: string
  }
  fullIdentifiers: boolean
}) {
  return {
    customerId: maskBillingIdentifier(args.event.customerId, {
      full: args.fullIdentifiers,
    }),
    errorMessage: args.event.errorMessage,
    eventType: args.event.eventType,
    id: args.event._id,
    invoiceId: maskBillingIdentifier(args.event.invoiceId, {
      full: args.fullIdentifiers,
    }),
    payloadJson: args.event.payloadJson,
    payloadState: resolveWebhookPayloadState({
      payloadJson: args.event.payloadJson,
      payloadUnavailableAt: args.event.payloadUnavailableAt,
    }),
    payloadUnavailableReason: args.event.payloadUnavailableReason,
    paymentIntentId: maskBillingIdentifier(args.event.paymentIntentId, {
      full: args.fullIdentifiers,
    }),
    processedAt: args.event.processedAt,
    processingStatus: args.event.processingStatus,
    receivedAt: args.event.receivedAt,
    safeSummary: args.event.safeSummary,
    stripeEventId:
      maskBillingIdentifier(args.event.stripeEventId, {
        full: args.fullIdentifiers,
      }) ?? args.event.stripeEventId,
    subscriptionId: maskBillingIdentifier(args.event.subscriptionId, {
      full: args.fullIdentifiers,
    }),
  } satisfies StaffWebhookEventDetail
}

function sanitizeWebhookPayloadBackfillError(error: unknown) {
  if (error instanceof Error) {
    return error.message.slice(0, 300)
  }

  return "Stripe no longer exposes this webhook event payload."
}

function isWebhookPayloadUnavailableError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  )
}

function serializeStripeEventPayload(event: Stripe.Event) {
  return JSON.stringify(event)
}

async function backfillWebhookEventPayload(args: {
  ctx: Parameters<typeof requireAuthorizedStaffAction>[0]
  stripeEventId: string
}) {
  const stripe = getStripe()

  try {
    const event = await stripe.events.retrieve(args.stripeEventId)

    await args.ctx.runMutation(
      internal.mutations.billing.state.storeWebhookEventPayload,
      {
        payloadBackfilledAt: Date.now(),
        payloadJson: serializeStripeEventPayload(event),
        stripeEventId: args.stripeEventId,
      }
    )

    return "backfilled" as const
  } catch (error) {
    if (isWebhookPayloadUnavailableError(error)) {
      await args.ctx.runMutation(
        internal.mutations.billing.state.markWebhookEventPayloadUnavailable,
        {
          reason: sanitizeWebhookPayloadBackfillError(error),
          stripeEventId: args.stripeEventId,
        }
      )
      return "unavailable" as const
    }

    console.error("Stripe webhook payload backfill failed", {
      error:
        error instanceof Error ? error.message : "Unknown Stripe retrieval error",
      stripeEventId: args.stripeEventId,
    })

    return "failed" as const
  }
}

function buildUserDirectory(args: {
  activeGrantByUserId: Map<
    string,
    {
      active: boolean
      planKey: string
      source: "creator_approval" | "manual" | "promo"
    }
  >
  customers: Array<{
    clerkUserId: string
    email?: string
  }>
  subscriptions: Array<{
    planKey: string
    status: string
    updatedAt: number
    userId: string
  }>
  users: Array<{
    _id: string
    clerkUserId: string
    name: string
    plan?: "creator" | "free" | "premium"
  }>
}) {
  const emailByClerkUserId = new Map(
    args.customers.map((customer) => [customer.clerkUserId, customer.email])
  )
  const subscriptionsByUserId = new Map<
    string,
    Array<(typeof args.subscriptions)[number]>
  >()

  for (const subscription of args.subscriptions) {
    const userSubscriptions =
      subscriptionsByUserId.get(subscription.userId) ?? []
    userSubscriptions.push(subscription)
    subscriptionsByUserId.set(subscription.userId, userSubscriptions)
  }

  function getCurrentSubscriptionForUser(userId: string) {
    const subscriptions = subscriptionsByUserId.get(userId) ?? []

    return (
      [...subscriptions].sort((left, right) => {
        const leftPriority = isImpactStatus(left.status) ? 1 : 0
        const rightPriority = isImpactStatus(right.status) ? 1 : 0

        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority
        }

        return right.updatedAt - left.updatedAt
      })[0] ?? null
    )
  }

  return args.users.map<StaffBillingUserLookupRecord>((user) => {
    const activeGrant = args.activeGrantByUserId.get(user._id)
    const currentSubscription = getCurrentSubscriptionForUser(user._id)
    const hasPaidAccess =
      currentSubscription !== null && isImpactStatus(currentSubscription.status)
    const currentPlanKey = activeGrant
      ? activeGrant.planKey
      : hasPaidAccess
        ? currentSubscription?.planKey
        : user.plan === "creator"
          ? "creator"
          : user.plan === "premium"
            ? "premium"
            : null

    return {
      accessSource: activeGrant
        ? "creator_grant"
        : hasPaidAccess
          ? "paid_subscription"
          : currentPlanKey
            ? "legacy_plan"
            : "none",
      clerkUserId: user.clerkUserId,
      currentPlanKey,
      email: emailByClerkUserId.get(user.clerkUserId),
      hasCreatorGrant: Boolean(activeGrant?.active),
      userId: user._id,
      userName: user.name,
    }
  })
}

function buildCreatorGrantRows(args: {
  customers: Array<{
    clerkUserId: string
    email?: string
  }>
  grants: Array<{
    _id: string
    active: boolean
    clerkUserId: string
    createdAt: number
    endsAt?: number
    grantedByClerkUserId?: string
    grantedByName?: string
    planKey: string
    reason: string
    revokedAt?: number
    source: "creator_approval" | "manual" | "promo"
    startsAt?: number
    userId: string
  }>
  users: Array<{
    _id: string
    name: string
  }>
}) {
  const emailByClerkUserId = new Map(
    args.customers.map((customer) => [customer.clerkUserId, customer.email])
  )
  const userById = new Map(args.users.map((user) => [user._id, user]))

  return args.grants
    .map<StaffCreatorGrantRecord>((grant) => ({
      active: grant.active,
      clerkUserId: grant.clerkUserId,
      createdAt: grant.createdAt,
      email: emailByClerkUserId.get(grant.clerkUserId),
      endsAt: grant.endsAt,
      grantedByClerkUserId: grant.grantedByClerkUserId,
      grantedByName: grant.grantedByName,
      id: grant._id,
      planKey: grant.planKey,
      reason: grant.reason,
      revokedAt: grant.revokedAt,
      source: grant.source,
      startsAt: grant.startsAt,
      userId: grant.userId,
      userName: userById.get(grant.userId)?.name ?? grant.clerkUserId,
    }))
    .sort((left, right) => right.createdAt - left.createdAt)
}

async function recordAuditLog(args: {
  action: string
  actorClerkUserId: string
  actorName: string
  actorRole: UserRole
  ctx: Parameters<typeof requireAuthorizedStaffAction>[0]
  details?: string
  entityId: string
  entityLabel?: string
  entityType: string
  result: "error" | "success" | "warning"
  summary: string
}) {
  await args.ctx.runMutation(internal.mutations.staff.internal.insertAuditLog, {
    action: args.action,
    actorClerkUserId: args.actorClerkUserId,
    actorName: args.actorName,
    actorRole: args.actorRole,
    details: args.details,
    entityId: args.entityId,
    entityLabel: args.entityLabel,
    entityType: args.entityType,
    result: args.result,
    summary: args.summary,
  })
}

async function attemptCatalogSync(args: {
  ctx: Parameters<typeof requireAuthorizedStaffAction>[0]
  entityId: string
  entityLabel?: string
  operator: Awaited<ReturnType<typeof requireAuthorizedStaffAction>>
  summaryLabel: string
}) {
  try {
    const syncResult = await args.ctx.runAction(
      internal.actions.billing.syncCatalogToStripe.syncCatalogToStripe,
      {}
    )
    const syncSummary = buildSyncSummaryFromResult(syncResult)

    await recordAuditLog({
      action: "billing.catalog.sync",
      actorClerkUserId: args.operator.actorClerkUserId,
      actorName: args.operator.actorDisplayName,
      actorRole: args.operator.actorRole,
      ctx: args.ctx,
      details: JSON.stringify(syncSummary, null, 2),
      entityId: `${args.entityId}:${syncSummary.syncedAt}`,
      entityLabel: args.entityLabel ?? args.summaryLabel,
      entityType: "billingSync",
      result: syncSummary.result,
      summary: `${args.summaryLabel} ${syncSummary.summary}`,
    })

    return syncSummary
  } catch (error) {
    const failedSyncSummary: StaffBillingSyncSummary = {
      result: "error",
      summary:
        error instanceof Error ? error.message : "Stripe catalog sync failed.",
      syncedAt: Date.now(),
      warningCount: 1,
    }

    await recordAuditLog({
      action: "billing.catalog.sync",
      actorClerkUserId: args.operator.actorClerkUserId,
      actorName: args.operator.actorDisplayName,
      actorRole: args.operator.actorRole,
      ctx: args.ctx,
      details: JSON.stringify(failedSyncSummary, null, 2),
      entityId: `${args.entityId}:${failedSyncSummary.syncedAt}`,
      entityLabel: args.entityLabel ?? args.summaryLabel,
      entityType: "billingSync",
      result: "error",
      summary: `${args.summaryLabel} Stripe catalog sync failed.`,
    })

    return failedSyncSummary
  }
}

function buildMutationResponse(args: {
  summary: string
  syncSummary: StaffBillingSyncSummary | null
}) {
  return {
    summary:
      args.syncSummary?.result === "error"
        ? `${args.summary} The Convex catalog changed, but Stripe synchronization needs another run.`
        : args.summary,
    syncSummary: args.syncSummary,
  } satisfies StaffMutationResponse
}

function buildImpactPreview(args: {
  confirmationToken: string
  impactedSubscriptions: StaffSubscriptionImpactRow[]
  summary: string
  warnings?: string[]
}) {
  const impactedUserIds = new Set(
    args.impactedSubscriptions.map((row) => row.clerkUserId)
  )
  const impactedEmails = new Set(
    args.impactedSubscriptions
      .map((row) => row.email)
      .filter((email): email is string => Boolean(email))
  )

  return {
    confirmationToken: args.confirmationToken,
    counts: {
      activeCustomers: impactedEmails.size,
      activeSubscriptions: args.impactedSubscriptions.length,
      affectedPlans: new Set(
        args.impactedSubscriptions.map((row) => row.planKey)
      ).size,
      affectedUsers: impactedUserIds.size,
    },
    impactedSubscriptions: args.impactedSubscriptions.slice(0, 25),
    summary: args.summary,
    warnings: args.warnings ?? [],
  } satisfies StaffImpactPreview
}

function buildBillingDashboard(
  args: {
    auditLogs: Array<{
      _id: string
      action: string
      actorClerkUserId: string
      actorName: string
      actorRole: UserRole
      createdAt: number
      details?: string
      entityId: string
      entityLabel?: string
      entityType: string
      result: "error" | "success" | "warning"
      summary: string
    }>
    customers: Array<{
      active: boolean
      clerkUserId: string
      createdAt: number
      email?: string
      stripeCustomerId: string
      updatedAt: number
    }>
    accessGrants: Array<{
      _id: string
      active: boolean
      clerkUserId: string
      createdAt: number
      endsAt?: number
      grantedByClerkUserId?: string
      grantedByName?: string
      planKey: string
      reason: string
      revokedAt?: number
      source: "creator_approval" | "manual" | "promo"
      startsAt?: number
      userId: string
    }>
    features: Array<{
      active: boolean
      appliesTo?: string
      archivedAt?: number
      category?: string
      description: string
      key: string
      name: string
      sortOrder: number
      stripeFeatureId?: string
    }>
    planFeatures: Array<{
      enabled: boolean
      featureKey: string
      planKey: string
    }>
    plans: Array<{
      active: boolean
      archivedAt?: number
      currency: string
      description: string
      key: string
      monthlyPriceAmount: number
      monthlyPriceId?: string
      name: string
      planType: "free" | "paid"
      sortOrder: number
      stripeProductId?: string
      yearlyPriceAmount: number
      yearlyPriceId?: string
    }>
    subscriptions: Array<{
      attentionStatus:
        | "none"
        | "past_due"
        | "paused"
        | "payment_failed"
        | "requires_action"
      cancelAt?: number
      cancelAtPeriodEnd: boolean
      clerkUserId: string
      currentPeriodEnd?: number
      currentPeriodStart?: number
      interval: "month" | "year"
      planKey: string
      scheduledChangeAt?: number
      scheduledChangeType?: "cancel" | "plan_change"
      scheduledInterval?: "month" | "year"
      scheduledPlanKey?: string
      status: string
      stripeCustomerId: string
      stripePriceId: string
      stripeScheduleId?: string
      stripeSubscriptionId: string
      userId: string
      updatedAt: number
    }>
    users: Array<{
      _id: string
      clerkUserId: string
      name: string
      plan?: "creator" | "free" | "premium"
    }>
    webhookEvents: Array<{
      _id: string
      customerId?: string
      errorMessage?: string
      eventType: string
      invoiceId?: string
      paymentIntentId?: string
      processedAt?: number
      processingStatus:
        | "failed"
        | "ignored"
        | "processed"
        | "processing"
        | "received"
      receivedAt: number
      safeSummary: string
      subscriptionId?: string
    }>
  },
  actorRole: UserRole = "staff"
) {
  const assignments = uniqueAssignments(args.planFeatures)
  const fullIdentifiers = canViewFullBillingIdentifiers(actorRole)
  const now = Date.now()
  const activeGrantByUserId = new Map<
    string,
    (typeof args.accessGrants)[number]
  >()

  for (const user of args.users) {
    const activeGrant =
      [...args.accessGrants]
        .filter(
          (grant) =>
            grant.userId === user._id && isActiveAccessGrant(grant, now)
        )
        .sort((left, right) => {
          const priorityDifference =
            getAccessGrantPriority(right.source) -
            getAccessGrantPriority(left.source)

          if (priorityDifference !== 0) {
            return priorityDifference
          }

          return right.createdAt - left.createdAt
        })[0] ?? null

    if (activeGrant) {
      activeGrantByUserId.set(user._id, activeGrant)
    }
  }
  const subscriptionRows = buildSubscriptionRows({
    customers: args.customers,
    fullIdentifiers,
    subscriptions: args.subscriptions,
    users: args.users,
  })
  const userDirectory = buildUserDirectory({
    activeGrantByUserId,
    customers: args.customers,
    subscriptions: args.subscriptions,
    users: args.users,
  })
  const customerRows = buildCustomerRows({
    customers: args.customers,
    fullIdentifiers,
    subscriptions: args.subscriptions,
    userDirectory,
    users: args.users,
  })
  const creatorGrantRows = buildCreatorGrantRows({
    customers: args.customers,
    grants: args.accessGrants,
    users: args.users,
  })
  const webhookEventRows = buildWebhookEventRows({
    events: args.webhookEvents,
    fullIdentifiers,
  })
  const webhookMetrics = buildWebhookMetrics({
    events: args.webhookEvents,
  })
  const featuresByKey = new Map(
    args.features.map((feature) => [feature.key, feature])
  )
  const subscriptionsByPlanKey = new Map<string, StaffSubscriptionImpactRow[]>()

  for (const subscription of subscriptionRows) {
    const planSubscriptions =
      subscriptionsByPlanKey.get(subscription.planKey) ?? []
    planSubscriptions.push(subscription)
    subscriptionsByPlanKey.set(subscription.planKey, planSubscriptions)
  }

  const plans: StaffBillingPlanRecord[] = args.plans.map((plan) => {
    const includedFeatureKeys = assignments
      .filter(
        (assignment) =>
          assignment.planKey === plan.key &&
          assignment.enabled &&
          featuresByKey.get(assignment.featureKey)?.active
      )
      .map((assignment) => assignment.featureKey)
      .sort((left, right) => left.localeCompare(right))
    const planSubscriptions = subscriptionsByPlanKey.get(plan.key) ?? []
    const rawPlanSubscriptions = args.subscriptions.filter(
      (subscription) => subscription.planKey === plan.key
    )

    return {
      active: plan.active,
      activeSubscriptionCount: planSubscriptions.length,
      archivedAt: plan.archivedAt,
      currentMonthlySubscriptionCount: rawPlanSubscriptions.filter(
        (subscription) => subscription.stripePriceId === plan.monthlyPriceId
      ).length,
      currentYearlySubscriptionCount: rawPlanSubscriptions.filter(
        (subscription) => subscription.stripePriceId === plan.yearlyPriceId
      ).length,
      currency: plan.currency,
      description: plan.description,
      includedFeatureKeys,
      key: plan.key,
      monthlyPriceAmount: plan.monthlyPriceAmount,
      monthlyPriceId: maskBillingIdentifier(plan.monthlyPriceId, {
        full: fullIdentifiers,
      }),
      name: plan.name,
      planType: plan.planType,
      sortOrder: plan.sortOrder,
      stripeProductId: maskBillingIdentifier(plan.stripeProductId, {
        full: fullIdentifiers,
      }),
      syncStatus:
        plan.planType === "free"
          ? "free"
          : !plan.active || plan.archivedAt !== undefined
            ? "archived"
            : !plan.stripeProductId ||
                !plan.monthlyPriceId ||
                !plan.yearlyPriceId
              ? "attention"
              : "ready",
      yearlyPriceAmount: plan.yearlyPriceAmount,
      yearlyPriceId: maskBillingIdentifier(plan.yearlyPriceId, {
        full: fullIdentifiers,
      }),
    }
  })

  const features: StaffBillingFeatureRecord[] = args.features.map((feature) => {
    const linkedPlanKeys = assignments
      .filter(
        (assignment) =>
          assignment.enabled && assignment.featureKey === feature.key
      )
      .map((assignment) => assignment.planKey)
      .sort((left, right) => left.localeCompare(right))
    const activeSubscriptionCount = linkedPlanKeys.reduce((count, planKey) => {
      return count + (subscriptionsByPlanKey.get(planKey)?.length ?? 0)
    }, 0)

    return {
      active: feature.active,
      activeSubscriptionCount,
      appliesTo: resolveBillingFeatureApplyMode(feature.appliesTo),
      archivedAt: feature.archivedAt,
      category: feature.category,
      description: feature.description,
      key: feature.key,
      linkedPlanKeys,
      name: feature.name,
      sortOrder: feature.sortOrder,
      stripeFeatureId: maskBillingIdentifier(feature.stripeFeatureId, {
        full: fullIdentifiers,
      }),
    }
  })

  return {
    activeSubscriptionCount: subscriptionRows.length,
    attentionSubscriptions: subscriptionRows
      .filter((subscription) => subscription.attentionStatus !== "none")
      .slice(0, 25),
    activeCustomerCount: customerRows.filter((customer) => customer.active)
      .length,
    assignments: assignments.map((assignment) => ({
      enabled: assignment.enabled,
      featureKey: assignment.featureKey,
      planKey: assignment.planKey,
    })),
    auditLogs: args.auditLogs.slice(0, 60).map(mapAuditLogEntry),
    creatorGrants: creatorGrantRows.slice(0, 60),
    customers: customerRows,
    features,
    generatedAt: Date.now(),
    lastSync:
      parseSyncSummary(
        args.auditLogs.find((log) => log.action === "billing.catalog.sync")
          ?.details
      ) ?? null,
    plans,
    subscriptions: subscriptionRows,
    userDirectory,
    webhookEvents: webhookEventRows.slice(0, 80),
    webhookMetrics,
  } satisfies StaffBillingDashboard
}

async function cancelSubscriptionsAtPeriodEnd(args: {
  ctx: Parameters<typeof requireAuthorizedStaffAction>[0]
  subscriptions: StaffSubscriptionImpactRow[]
}) {
  const stripe = getStripe()
  const updates = []

  for (const subscription of args.subscriptions) {
    if (subscription.cancelAtPeriodEnd) {
      continue
    }

    const updatedSubscription = await stripe.subscriptions.update(
      subscription.stripeSubscriptionId,
      {
        cancel_at_period_end: true,
      }
    )

    updates.push({
      cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
      canceledAt: undefined,
      currentPeriodEnd: subscription.currentPeriodEnd,
      status: updatedSubscription.status,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    })
  }

  if (updates.length > 0) {
    await args.ctx.runMutation(
      internal.mutations.staff.internal.updateSubscriptionsAfterCancel,
      {
        updates,
      }
    )
  }

  return updates.length
}

export const getDashboard = action({
  args: {},
  handler: async (ctx): Promise<StaffBillingDashboard> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )

    return buildBillingDashboard(records, operator.actorRole)
  },
})

export const getWebhookDashboard = action({
  args: {},
  handler: async (ctx): Promise<StaffWebhookLedgerDashboard> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const webhookEvents = await ctx.runQuery(
      internal.queries.staff.internal.getBillingWebhookLedgerRecords,
      {}
    )
    const webhookMetrics = buildWebhookMetrics({
      events: webhookEvents,
    })

    return {
      events: buildWebhookLedgerRows({
        events: webhookEvents,
        fullIdentifiers: canViewFullBillingIdentifiers(operator.actorRole),
      }),
      generatedAt: Date.now(),
      metrics: {
        ...webhookMetrics,
        missingPayloadCount: webhookEvents.filter(
          (event: (typeof webhookEvents)[number]) =>
            !event.hasPayloadJson && event.payloadUnavailableAt === undefined
        ).length,
        totalCount: webhookEvents.length,
        unavailablePayloadCount: webhookEvents.filter(
          (event: (typeof webhookEvents)[number]) =>
            event.payloadUnavailableAt !== undefined
        ).length,
      },
    } satisfies StaffWebhookLedgerDashboard
  },
})

export const getWebhookEventDetail = action({
  args: {
    eventId: v.id("billingWebhookEvents"),
  },
  handler: async (ctx, args): Promise<StaffWebhookEventDetail> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    let event = await ctx.runQuery(
      internal.queries.staff.internal.getBillingWebhookEventById,
      {
        eventId: args.eventId,
      }
    )

    if (!event) {
      throw new Error("The selected webhook event was not found.")
    }

    if (
      event.payloadJson === undefined &&
      event.payloadUnavailableAt === undefined
    ) {
      await backfillWebhookEventPayload({
        ctx,
        stripeEventId: event.stripeEventId,
      })

      event = await ctx.runQuery(
        internal.queries.staff.internal.getBillingWebhookEventById,
        {
          eventId: args.eventId,
        }
      )
    }

    if (!event) {
      throw new Error("The selected webhook event was not found.")
    }

    return buildWebhookEventDetail({
      event,
      fullIdentifiers: canViewFullBillingIdentifiers(operator.actorRole),
    })
  },
})

export const refreshWebhookLedger = action({
  args: {},
  handler: async (ctx): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const webhookEvents = await ctx.runQuery(
      internal.queries.staff.internal.getBillingWebhookLedgerRecords,
      {}
    )
    const candidates = webhookEvents.filter(
      (event: (typeof webhookEvents)[number]) =>
        !event.hasPayloadJson && event.payloadUnavailableAt === undefined
    )
    const maxBackfills = 25
    let backfilledCount = 0
    let unavailableCount = 0
    let failedCount = 0

    for (const event of candidates.slice(0, maxBackfills)) {
      const result = await backfillWebhookEventPayload({
        ctx,
        stripeEventId: event.stripeEventId,
      })

      if (result === "backfilled") {
        backfilledCount += 1
        continue
      }

      if (result === "unavailable") {
        unavailableCount += 1
        continue
      }

      if (result === "failed") {
        failedCount += 1
      }
    }

    const remainingCount = Math.max(candidates.length - maxBackfills, 0)
    const summary =
      candidates.length === 0
        ? "Webhook ledger refreshed. No missing payloads required backfill."
        : `Webhook ledger refreshed. ${backfilledCount} payload(s) backfilled, ${unavailableCount} marked unavailable, ${failedCount} failed, ${remainingCount} still queued.`

    await recordAuditLog({
      action: "billing.webhooks.refreshed",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          backfilledCount,
          candidateCount: candidates.length,
          failedCount,
          maxBackfills,
          remainingCount,
          unavailableCount,
        },
        null,
        2
      ),
      entityId: "webhook-ledger",
      entityLabel: "Stripe webhook ledger",
      entityType: "billingWebhookLedger",
      result: failedCount > 0 ? "warning" : "success",
      summary,
    })

    return {
      summary,
      syncSummary: null,
    }
  },
})

export const previewPlanArchive = action({
  args: {
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) => subscription.planKey === plan.key
    )

    return buildImpactPreview({
      confirmationToken: plan.key,
      impactedSubscriptions,
      summary:
        impactedSubscriptions.length > 0
          ? `Archiving ${plan.name} will stop new sales, deactivate its Stripe product and prices, and leave ${impactedSubscriptions.length} active subscription(s) in place unless you mark them to cancel at period end.`
          : `Archiving ${plan.name} will stop new sales and deactivate its Stripe product and prices.`,
      warnings:
        impactedSubscriptions.length > 0
          ? [
              "Existing subscriptions will keep running unless you explicitly mark them to cancel at period end.",
            ]
          : [],
    })
  },
})

export const archivePlan = action({
  args: {
    cancelAtPeriodEnd: v.boolean(),
    confirmationToken: v.string(),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    if (args.confirmationToken !== plan.key) {
      throw new Error(`Type ${plan.key} to confirm the archive operation.`)
    }

    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) => subscription.planKey === plan.key
    )
    const canceledSubscriptionCount = args.cancelAtPeriodEnd
      ? await cancelSubscriptionsAtPeriodEnd({
          ctx,
          subscriptions: impactedSubscriptions,
        })
      : 0

    await ctx.runMutation(
      internal.mutations.staff.internal.setPlanActiveState,
      {
        active: false,
        archivedAt: Date.now(),
        planKey: plan.key,
      }
    )

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: plan.key,
      entityLabel: plan.name,
      operator,
      summaryLabel: `Plan ${plan.name} updated.`,
    })

    await recordAuditLog({
      action: "billing.plan.archived",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          cancelAtPeriodEnd: args.cancelAtPeriodEnd,
          canceledSubscriptionCount,
          impactedSubscriptionCount: impactedSubscriptions.length,
        },
        null,
        2
      ),
      entityId: plan.key,
      entityLabel: plan.name,
      entityType: "billingPlan",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: `Archived billing plan ${plan.name}.`,
    })

    return buildMutationResponse({
      summary: `Archived billing plan ${plan.name}.`,
      syncSummary,
    })
  },
})

export const previewPriceReplacement = action({
  args: {
    interval: v.union(v.literal("month"), v.literal("year")),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    const currentPriceId =
      args.interval === "month" ? plan.monthlyPriceId : plan.yearlyPriceId
    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) =>
        currentPriceId
          ? subscription.stripePriceId === currentPriceId
          : subscription.planKey === plan.key &&
            subscription.interval === args.interval
    )

    return buildImpactPreview({
      confirmationToken: `${plan.key}:${args.interval}`,
      impactedSubscriptions,
      summary:
        impactedSubscriptions.length > 0
          ? `Replacing the ${args.interval} price for ${plan.name} will create a new Stripe price, archive the superseded price, and leave ${impactedSubscriptions.length} active subscription(s) on the old price until you migrate or cancel them separately.`
          : `Replacing the ${args.interval} price for ${plan.name} will create a new Stripe price and archive the superseded price.`,
      warnings: [
        impactedSubscriptions.length > 0
          ? "Existing subscriptions will stay on their current Stripe price after this replacement."
          : null,
        args.interval === "month"
          ? "The new monthly price becomes the Stripe product default before the previous monthly price is archived."
          : "Monthly pricing remains the Stripe product default after this yearly replacement.",
      ].filter((warning): warning is string => warning !== null),
    })
  },
})

export const previewPlanFeatureSync = action({
  args: {
    featureKeys: v.array(v.string()),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    const nextFeatureKeys = normalizeCatalogKeyList(
      args.featureKeys,
      "Feature key"
    )
    const { addedFeatureKeys, removedFeatureKeys } = getFeatureKeyDelta({
      nextFeatureKeys,
      previousFeatureKeys: plan.includedFeatureKeys,
    })
    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) => subscription.planKey === plan.key
    )

    return buildImpactPreview({
      confirmationToken: `${plan.key}:${nextFeatureKeys.length}`,
      impactedSubscriptions,
      summary:
        addedFeatureKeys.length === 0 && removedFeatureKeys.length === 0
          ? `No plan-feature changes are queued for ${plan.name}.`
          : `Saving ${plan.name} will attach ${addedFeatureKeys.length} feature(s) and remove ${removedFeatureKeys.length} feature(s) for ${impactedSubscriptions.length} active subscription(s) on this plan.`,
      warnings:
        impactedSubscriptions.length > 0 && removedFeatureKeys.length > 0
          ? [
              "Detached features are removed from future entitlement and marketing sync output for this plan.",
            ]
          : [],
    })
  },
})

export const replacePlanPrice = action({
  args: {
    amount: v.number(),
    confirmationToken: v.string(),
    interval: v.union(v.literal("month"), v.literal("year")),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const plan = records.plans.find(
      (entry: { key: string }) => entry.key === args.planKey
    )

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    if (plan.planType !== "paid") {
      throw new Error("Only paid plans can replace Stripe prices.")
    }

    if (!plan.active) {
      throw new Error("Archived plans cannot replace Stripe prices.")
    }

    if (args.confirmationToken !== `${plan.key}:${args.interval}`) {
      throw new Error(
        `Type ${plan.key}:${args.interval} to confirm the price replacement.`
      )
    }

    const nextAmount = validatePriceAmount(
      args.amount,
      `${args.interval === "month" ? "Monthly" : "Yearly"} price`
    )
    const previousAmount =
      args.interval === "month"
        ? plan.monthlyPriceAmount
        : plan.yearlyPriceAmount

    if (nextAmount === previousAmount) {
      throw new Error("The replacement price must change the current amount.")
    }

    await ctx.runMutation(internal.mutations.staff.internal.upsertPlan, {
      active: plan.active,
      currency: plan.currency,
      description: plan.description,
      key: plan.key,
      monthlyPriceAmount:
        args.interval === "month" ? nextAmount : plan.monthlyPriceAmount,
      name: plan.name,
      planType: plan.planType,
      sortOrder: plan.sortOrder,
      yearlyPriceAmount:
        args.interval === "year" ? nextAmount : plan.yearlyPriceAmount,
    })

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: `${plan.key}:${args.interval}`,
      entityLabel: plan.name,
      operator,
      summaryLabel: `Price replacement for ${plan.name}.`,
    })

    await recordAuditLog({
      action: "billing.price.replaced",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          afterAmount: nextAmount,
          beforeAmount: previousAmount,
          currency: plan.currency,
          interval: args.interval,
        },
        null,
        2
      ),
      entityId: `${plan.key}:${args.interval}`,
      entityLabel: plan.name,
      entityType: "billingPrice",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: `Replaced the ${args.interval} price for ${plan.name}.`,
    })

    return buildMutationResponse({
      summary: `Replaced the ${args.interval} price for ${plan.name}.`,
      syncSummary,
    })
  },
})

export const previewFeatureArchive = action({
  args: {
    featureKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find(
      (entry) => entry.key === args.featureKey
    )

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) => feature.linkedPlanKeys.includes(subscription.planKey)
    )

    return buildImpactPreview({
      confirmationToken: feature.key,
      impactedSubscriptions,
      summary:
        impactedSubscriptions.length > 0
          ? `Archiving ${feature.name} removes it from ${feature.linkedPlanKeys.length} plan(s) and affects ${impactedSubscriptions.length} active subscription(s) that currently belong to those plans.`
          : `Archiving ${feature.name} removes it from linked plans and deactivates the Stripe entitlement feature.`,
    })
  },
})

export const archiveFeature = action({
  args: {
    confirmationToken: v.string(),
    featureKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const feature = records.features.find(
      (entry: { key: string }) => entry.key === args.featureKey
    )

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    if (args.confirmationToken !== feature.key) {
      throw new Error(`Type ${feature.key} to confirm the archive operation.`)
    }

    const dashboard = buildBillingDashboard(records)
    const existingFeature = dashboard.features.find(
      (entry) => entry.key === feature.key
    )

    await ctx.runMutation(
      internal.mutations.staff.internal.syncPlanFeatureAssignmentsForFeature,
      {
        featureKey: feature.key,
        planKeys: [],
      }
    )
    await ctx.runMutation(
      internal.mutations.staff.internal.setFeatureActiveState,
      {
        active: false,
        archivedAt: Date.now(),
        featureKey: feature.key,
      }
    )

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: feature.key,
      entityLabel: feature.name,
      operator,
      summaryLabel: `Feature ${feature.name} updated.`,
    })

    await recordAuditLog({
      action: "billing.feature.archived",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          detachedPlanKeys: existingFeature?.linkedPlanKeys ?? [],
        },
        null,
        2
      ),
      entityId: feature.key,
      entityLabel: feature.name,
      entityType: "billingFeature",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: `Archived billing feature ${feature.name}.`,
    })

    return buildMutationResponse({
      summary: `Archived billing feature ${feature.name}.`,
      syncSummary,
    })
  },
})

export const previewFeatureAssignmentChange = action({
  args: {
    enabled: v.boolean(),
    featureKey: v.string(),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find(
      (entry) => entry.key === args.featureKey
    )
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!feature || !plan) {
      throw new Error("The requested plan or feature was not found.")
    }

    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) => subscription.planKey === plan.key
    )

    return buildImpactPreview({
      confirmationToken: `${plan.key}:${feature.key}`,
      impactedSubscriptions,
      summary: args.enabled
        ? `Attaching ${feature.name} to ${plan.name} changes the entitlement or marketing surface for ${impactedSubscriptions.length} active subscription(s) on that plan.`
        : `Detaching ${feature.name} from ${plan.name} changes the entitlement or marketing surface for ${impactedSubscriptions.length} active subscription(s) on that plan.`,
      warnings:
        impactedSubscriptions.length > 0
          ? [
              "Detach changes are effective only after Stripe synchronization completes.",
            ]
          : [],
    })
  },
})

export const previewFeatureAssignmentSync = action({
  args: {
    featureKey: v.string(),
    planKeys: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find(
      (entry) => entry.key === args.featureKey
    )

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    const nextPlanKeys = normalizeCatalogKeyList(args.planKeys, "Plan key")
    const { addedPlanKeys, removedPlanKeys } = getPlanKeyDelta({
      nextPlanKeys,
      previousPlanKeys: feature.linkedPlanKeys,
    })
    const impactedSubscriptions = dashboard.subscriptions.filter(
      (subscription) =>
        removedPlanKeys.includes(subscription.planKey) ||
        addedPlanKeys.includes(subscription.planKey)
    )

    return buildImpactPreview({
      confirmationToken: `${feature.key}:${nextPlanKeys.length}`,
      impactedSubscriptions,
      summary:
        addedPlanKeys.length === 0 && removedPlanKeys.length === 0
          ? `No assignment changes are queued for ${feature.name}.`
          : `Saving ${feature.name} will attach it to ${addedPlanKeys.length} plan(s) and remove it from ${removedPlanKeys.length} plan(s), affecting ${impactedSubscriptions.length} active subscription(s).`,
      warnings:
        impactedSubscriptions.length > 0 && removedPlanKeys.length > 0
          ? [
              "Detach changes are applied during the next Stripe catalog sync and do not migrate existing subscriptions to a new plan.",
            ]
          : [],
    })
  },
})

export const setFeatureAssignment = action({
  args: {
    enabled: v.boolean(),
    featureKey: v.string(),
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const feature = records.features.find(
      (entry: { key: string }) => entry.key === args.featureKey
    )
    const plan = records.plans.find(
      (entry: { key: string }) => entry.key === args.planKey
    )

    if (!feature || !plan) {
      throw new Error("The requested plan or feature was not found.")
    }

    await ctx.runMutation(
      internal.mutations.staff.internal.setPlanFeatureAssignment,
      {
        enabled: args.enabled,
        featureKey: feature.key,
        planKey: plan.key,
      }
    )

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: `${plan.key}:${feature.key}`,
      entityLabel: `${plan.name} / ${feature.name}`,
      operator,
      summaryLabel: `Feature assignment for ${plan.name}.`,
    })

    await recordAuditLog({
      action: args.enabled
        ? "billing.assignment.attached"
        : "billing.assignment.detached",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          enabled: args.enabled,
          featureKey: feature.key,
          planKey: plan.key,
        },
        null,
        2
      ),
      entityId: `${plan.key}:${feature.key}`,
      entityLabel: `${plan.name} / ${feature.name}`,
      entityType: "billingAssignment",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: args.enabled
        ? `Attached ${feature.name} to ${plan.name}.`
        : `Detached ${feature.name} from ${plan.name}.`,
    })

    return buildMutationResponse({
      summary: args.enabled
        ? `Attached ${feature.name} to ${plan.name}.`
        : `Detached ${feature.name} from ${plan.name}.`,
      syncSummary,
    })
  },
})

export const syncFeatureAssignments = action({
  args: {
    featureKey: v.string(),
    planKeys: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find(
      (entry) => entry.key === args.featureKey
    )

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    const nextPlanKeys = normalizeCatalogKeyList(args.planKeys, "Plan key")
    const plansByKey = new Map(
      records.plans.map((plan: { key: string }) => [plan.key, plan])
    )

    if (!feature.active && nextPlanKeys.length > 0) {
      throw new Error("Archived features cannot be assigned to plans.")
    }

    for (const planKey of nextPlanKeys) {
      if (!plansByKey.has(planKey)) {
        throw new Error(`Billing plan ${planKey} was not found.`)
      }
    }

    const { addedPlanKeys, removedPlanKeys } = getPlanKeyDelta({
      nextPlanKeys,
      previousPlanKeys: feature.linkedPlanKeys,
    })

    await ctx.runMutation(
      internal.mutations.staff.internal.syncPlanFeatureAssignmentsForFeature,
      {
        featureKey: feature.key,
        planKeys: nextPlanKeys,
      }
    )

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: feature.key,
      entityLabel: feature.name,
      operator,
      summaryLabel: `Assignments for ${feature.name} updated.`,
    })

    await recordAuditLog({
      action: "billing.assignment.synced",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          addedPlanKeys,
          nextPlanKeys,
          previousPlanKeys: feature.linkedPlanKeys,
          removedPlanKeys,
        },
        null,
        2
      ),
      entityId: feature.key,
      entityLabel: feature.name,
      entityType: "billingAssignment",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: `Updated plan assignments for ${feature.name}.`,
    })

    return buildMutationResponse({
      summary: `Updated plan assignments for ${feature.name}.`,
      syncSummary,
    })
  },
})

export const upsertPlan = action({
  args: {
    active: v.boolean(),
    currency: v.string(),
    description: v.string(),
    featureKeys: v.array(v.string()),
    key: v.string(),
    monthlyPriceAmount: v.number(),
    name: v.string(),
    planType: v.union(v.literal("free"), v.literal("paid")),
    sortOrder: v.number(),
    yearlyPriceAmount: v.number(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const normalizedKey = validateCatalogKey(args.key, "Plan key")
    const existingPlan = records.plans.find(
      (plan: { key: string }) => plan.key === normalizedKey
    )
    const dashboard = buildBillingDashboard(records)
    const currentPlan = dashboard.plans.find(
      (plan) => plan.key === normalizedKey
    )
    const normalizedName = validateDisplayName(args.name, "Plan name")
    const normalizedCurrency = normalizeCurrency(args.currency)
    const normalizedDescription = normalizeDescription(args.description)
    const normalizedFeatureKeys = normalizeCatalogKeyList(
      args.featureKeys,
      "Feature key"
    )
    const featuresByKey = new Map<
      string,
      { active: boolean; key: string; name: string }
    >(
      records.features.map(
        (feature: { active: boolean; key: string; name: string }) => [
          feature.key,
          feature,
        ]
      )
    )
    const monthlyPriceAmount =
      args.planType === "free"
        ? 0
        : validatePriceAmount(args.monthlyPriceAmount, "Monthly price")
    const yearlyPriceAmount =
      args.planType === "free"
        ? 0
        : validatePriceAmount(args.yearlyPriceAmount, "Yearly price")

    if (
      existingPlan &&
      existingPlan.planType === "paid" &&
      args.planType === "free" &&
      dashboard.subscriptions.some(
        (subscription) => subscription.planKey === existingPlan.key
      )
    ) {
      throw new Error(
        "Paid plans with active subscriptions cannot be converted into free plans."
      )
    }

    for (const featureKey of normalizedFeatureKeys) {
      const feature = featuresByKey.get(featureKey)

      if (!feature) {
        throw new Error(`Billing feature ${featureKey} was not found.`)
      }

      if (!feature.active) {
        throw new Error(
          `Archived billing feature ${feature.name} cannot be assigned to a plan.`
        )
      }
    }

    await ctx.runMutation(internal.mutations.staff.internal.upsertPlan, {
      active: args.active,
      currency: normalizedCurrency,
      description: normalizedDescription,
      key: normalizedKey,
      monthlyPriceAmount,
      name: normalizedName,
      planType: args.planType,
      sortOrder: args.sortOrder,
      yearlyPriceAmount,
    })
    await ctx.runMutation(
      internal.mutations.staff.internal.syncPlanFeatureAssignmentsForPlan,
      {
        featureKeys: normalizedFeatureKeys,
        planKey: normalizedKey,
      }
    )

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: normalizedKey,
      entityLabel: normalizedName,
      operator,
      summaryLabel: `Plan ${normalizedName} saved.`,
    })

    await recordAuditLog({
      action: existingPlan ? "billing.plan.updated" : "billing.plan.created",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          after: {
            active: args.active,
            currency: normalizedCurrency,
            description: normalizedDescription,
            featureKeys: normalizedFeatureKeys,
            monthlyPriceAmount,
            name: normalizedName,
            planType: args.planType,
            sortOrder: args.sortOrder,
            yearlyPriceAmount,
          },
          before:
            existingPlan === undefined
              ? null
              : {
                  ...existingPlan,
                  featureKeys: currentPlan?.includedFeatureKeys ?? [],
                },
        },
        null,
        2
      ),
      entityId: normalizedKey,
      entityLabel: normalizedName,
      entityType: "billingPlan",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: existingPlan
        ? `Updated billing plan ${normalizedName}.`
        : `Created billing plan ${normalizedName}.`,
    })

    return buildMutationResponse({
      summary: existingPlan
        ? `Updated billing plan ${normalizedName}.`
        : `Created billing plan ${normalizedName}.`,
      syncSummary,
    })
  },
})

export const upsertFeature = action({
  args: {
    active: v.boolean(),
    appliesTo: v.union(
      v.literal("entitlement"),
      v.literal("marketing"),
      v.literal("both")
    ),
    category: v.optional(v.string()),
    description: v.string(),
    key: v.string(),
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(
      internal.queries.staff.internal.getBillingRecords,
      {}
    )
    const normalizedKey = validateCatalogKey(args.key, "Feature key")
    const existingFeature = records.features.find(
      (feature: { key: string }) => feature.key === normalizedKey
    )
    const normalizedName = validateDisplayName(args.name, "Feature name")
    const normalizedDescription = normalizeDescription(args.description)
    const normalizedCategory = args.category?.trim() || undefined

    await ctx.runMutation(internal.mutations.staff.internal.upsertFeature, {
      active: args.active,
      appliesTo: args.appliesTo,
      category: normalizedCategory,
      description: normalizedDescription,
      key: normalizedKey,
      name: normalizedName,
      sortOrder: args.sortOrder,
    })

    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: normalizedKey,
      entityLabel: normalizedName,
      operator,
      summaryLabel: `Feature ${normalizedName} saved.`,
    })

    await recordAuditLog({
      action: existingFeature
        ? "billing.feature.updated"
        : "billing.feature.created",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          after: {
            active: args.active,
            appliesTo: args.appliesTo,
            category: normalizedCategory,
            description: normalizedDescription,
            name: normalizedName,
            sortOrder: args.sortOrder,
          },
          before: existingFeature ?? null,
        },
        null,
        2
      ),
      entityId: normalizedKey,
      entityLabel: normalizedName,
      entityType: "billingFeature",
      result: syncSummary?.result === "error" ? "warning" : "success",
      summary: existingFeature
        ? `Updated billing feature ${normalizedName}.`
        : `Created billing feature ${normalizedName}.`,
    })

    return buildMutationResponse({
      summary: existingFeature
        ? `Updated billing feature ${normalizedName}.`
        : `Created billing feature ${normalizedName}.`,
      syncSummary,
    })
  },
})

export const grantCreatorAccess = action({
  args: {
    endsAt: v.optional(v.number()),
    planKey: v.string(),
    reason: v.string(),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const targetUser = await ctx.runQuery(
      internal.queries.staff.internal.getUserById,
      {
        userId: args.targetUserId,
      }
    )
    const plan = await ctx.runQuery(
      internal.queries.billing.internal.getPlanByKey,
      {
        planKey: args.planKey,
      }
    )
    const normalizedReason = args.reason.trim()

    if (!targetUser) {
      throw new Error("The selected user was not found.")
    }

    if (!plan || !plan.active || plan.archivedAt !== undefined) {
      throw new Error("The selected plan is not available for creator access.")
    }

    if (normalizedReason.length < 8) {
      throw new Error(
        "A clear reason is required before creator access can be granted."
      )
    }

    await ctx.runMutation(
      internal.mutations.billing.state.grantBillingAccessGrant,
      {
        clerkUserId: targetUser.clerkUserId,
        endsAt: args.endsAt,
        grantedByClerkUserId: operator.actorClerkUserId,
        grantedByName: operator.actorDisplayName,
        planKey: plan.key,
        reason: normalizedReason,
        source: "creator_approval",
        startsAt: Date.now(),
        userId: targetUser._id,
      }
    )

    await recordAuditLog({
      action: "billing.creator_access.granted",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          endsAt: args.endsAt,
          planKey: plan.key,
          reason: normalizedReason,
          targetClerkUserId: targetUser.clerkUserId,
          targetUserId: targetUser._id,
        },
        null,
        2
      ),
      entityId: targetUser._id,
      entityLabel: targetUser.name,
      entityType: "billingAccessGrant",
      result: "success",
      summary: `Granted creator access for ${targetUser.name} on ${plan.name}.`,
    })

    return {
      summary: `Granted creator access for ${targetUser.name}.`,
      syncSummary: null,
    }
  },
})

export const revokeCreatorAccess = action({
  args: {
    reason: v.string(),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const targetUser = await ctx.runQuery(
      internal.queries.staff.internal.getUserById,
      {
        userId: args.targetUserId,
      }
    )
    const currentGrant = await ctx.runQuery(
      internal.queries.billing.internal.getCurrentCreatorGrantByUserId,
      {
        userId: args.targetUserId,
      }
    )
    const normalizedReason = args.reason.trim()

    if (!targetUser) {
      throw new Error("The selected user was not found.")
    }

    if (!currentGrant) {
      throw new Error("That user does not currently have creator access.")
    }

    if (normalizedReason.length < 8) {
      throw new Error(
        "A clear reason is required before creator access can be revoked."
      )
    }

    await ctx.runMutation(
      internal.mutations.billing.state.revokeBillingAccessGrant,
      {
        grantId: currentGrant._id,
        revokedByClerkUserId: operator.actorClerkUserId,
        revokedByName: operator.actorDisplayName,
      }
    )

    await recordAuditLog({
      action: "billing.creator_access.revoked",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      ctx,
      details: JSON.stringify(
        {
          grantId: currentGrant._id,
          planKey: currentGrant.planKey,
          reason: normalizedReason,
          targetClerkUserId: targetUser.clerkUserId,
          targetUserId: targetUser._id,
        },
        null,
        2
      ),
      entityId: targetUser._id,
      entityLabel: targetUser.name,
      entityType: "billingAccessGrant",
      result: "success",
      summary: `Revoked creator access for ${targetUser.name}.`,
    })

    return {
      summary: `Revoked creator access for ${targetUser.name}.`,
      syncSummary: null,
    }
  },
})

export const runCatalogSync = action({
  args: {},
  handler: async (ctx): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const syncSummary = await attemptCatalogSync({
      ctx,
      entityId: "manual",
      entityLabel: "Manual sync",
      operator,
      summaryLabel: "Manual billing sync.",
    })

    return buildMutationResponse({
      summary: "Manual billing sync completed.",
      syncSummary,
    })
  },
})
