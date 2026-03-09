"use node"

import { v } from "convex/values"
import { action } from "../../_generated/server"
import { internal } from "../../_generated/api"
import { requireAuthorizedStaffAction } from "../../lib/staffActionAuth"
import { resolveBillingFeatureApplyMode, type UserRole } from "../../lib/staffRoles"
import type {
  StaffAuditLogEntry,
  StaffBillingDashboard,
  StaffBillingFeatureRecord,
  StaffBillingPlanRecord,
  StaffBillingSyncSummary,
  StaffImpactPreview,
  StaffMutationResponse,
  StaffSubscriptionImpactRow,
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

function uniqueAssignments(
  assignments: Array<{
    enabled: boolean
    featureKey: string
    planKey: string
  }>
) {
  const byCompositeKey = new Map<string, (typeof assignments)[number]>()

  for (const assignment of assignments) {
    byCompositeKey.set(`${assignment.planKey}:${assignment.featureKey}`, assignment)
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

function buildSubscriptionRows(args: {
  customers: Array<{
    clerkUserId: string
    email?: string
  }>
  subscriptions: Array<{
    cancelAtPeriodEnd: boolean
    clerkUserId: string
    currentPeriodEnd?: number
    interval: "month" | "year"
    planKey: string
    status: string
    stripePriceId: string
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
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        clerkUserId: subscription.clerkUserId,
        currentPeriodEnd: subscription.currentPeriodEnd,
        email: customer?.email,
        interval: subscription.interval,
        planKey: subscription.planKey,
        status: subscription.status,
        stripePriceId: subscription.stripePriceId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        userName: user?.name ?? subscription.clerkUserId,
      }
    })
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
  const impactedUserIds = new Set(args.impactedSubscriptions.map((row) => row.clerkUserId))
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
      affectedPlans: new Set(args.impactedSubscriptions.map((row) => row.planKey)).size,
      affectedUsers: impactedUserIds.size,
    },
    impactedSubscriptions: args.impactedSubscriptions.slice(0, 25),
    summary: args.summary,
    warnings: args.warnings ?? [],
  } satisfies StaffImpactPreview
}

function buildBillingDashboard(args: {
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
    clerkUserId: string
    email?: string
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
    cancelAtPeriodEnd: boolean
    clerkUserId: string
    currentPeriodEnd?: number
    interval: "month" | "year"
    planKey: string
    status: string
    stripePriceId: string
    stripeSubscriptionId: string
    userId: string
    updatedAt: number
  }>
  users: Array<{
    _id: string
    clerkUserId: string
    name: string
  }>
}) {
  const assignments = uniqueAssignments(args.planFeatures)
  const subscriptionRows = buildSubscriptionRows({
    customers: args.customers,
    subscriptions: args.subscriptions,
    users: args.users,
  })
  const featuresByKey = new Map(args.features.map((feature) => [feature.key, feature]))
  const subscriptionsByPlanKey = new Map<string, StaffSubscriptionImpactRow[]>()

  for (const subscription of subscriptionRows) {
    const planSubscriptions = subscriptionsByPlanKey.get(subscription.planKey) ?? []
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

    return {
      active: plan.active,
      activeSubscriptionCount: planSubscriptions.length,
      archivedAt: plan.archivedAt,
      currentMonthlySubscriptionCount: planSubscriptions.filter(
        (subscription) => subscription.stripePriceId === plan.monthlyPriceId
      ).length,
      currentYearlySubscriptionCount: planSubscriptions.filter(
        (subscription) => subscription.stripePriceId === plan.yearlyPriceId
      ).length,
      currency: plan.currency,
      description: plan.description,
      includedFeatureKeys,
      key: plan.key,
      monthlyPriceAmount: plan.monthlyPriceAmount,
      monthlyPriceId: plan.monthlyPriceId,
      name: plan.name,
      planType: plan.planType,
      sortOrder: plan.sortOrder,
      stripeProductId: plan.stripeProductId,
      syncStatus:
        plan.planType === "free"
          ? "free"
          : !plan.active || plan.archivedAt !== undefined
            ? "archived"
            : !plan.stripeProductId || !plan.monthlyPriceId || !plan.yearlyPriceId
              ? "attention"
              : "ready",
      yearlyPriceAmount: plan.yearlyPriceAmount,
      yearlyPriceId: plan.yearlyPriceId,
    }
  })

  const features: StaffBillingFeatureRecord[] = args.features.map((feature) => {
    const linkedPlanKeys = assignments
      .filter((assignment) => assignment.enabled && assignment.featureKey === feature.key)
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
      stripeFeatureId: feature.stripeFeatureId,
    }
  })

  return {
    activeSubscriptionCount: subscriptionRows.length,
    assignments: assignments.map((assignment) => ({
      enabled: assignment.enabled,
      featureKey: assignment.featureKey,
      planKey: assignment.planKey,
    })),
    auditLogs: args.auditLogs.slice(0, 60).map(mapAuditLogEntry),
    features,
    generatedAt: Date.now(),
    lastSync:
      parseSyncSummary(
        args.auditLogs.find((log) => log.action === "billing.catalog.sync")?.details
      ) ?? null,
    plans,
    subscriptions: subscriptionRows.slice(0, 60),
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
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})

    return buildBillingDashboard(records)
  },
})

export const previewPlanArchive = action({
  args: {
    planKey: v.string(),
  },
  handler: async (ctx, args): Promise<StaffImpactPreview> => {
    await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
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

    await ctx.runMutation(internal.mutations.staff.internal.setPlanActiveState, {
      active: false,
      archivedAt: Date.now(),
      planKey: plan.key,
    })

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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const dashboard = buildBillingDashboard(records)
    const plan = dashboard.plans.find((entry) => entry.key === args.planKey)

    if (!plan) {
      throw new Error(`Billing plan ${args.planKey} was not found.`)
    }

    const currentPriceId =
      args.interval === "month" ? plan.monthlyPriceId : plan.yearlyPriceId
    const impactedSubscriptions = dashboard.subscriptions.filter((subscription) =>
      currentPriceId
        ? subscription.stripePriceId === currentPriceId
        : subscription.planKey === plan.key && subscription.interval === args.interval
    )

    return buildImpactPreview({
      confirmationToken: `${plan.key}:${args.interval}`,
      impactedSubscriptions,
      summary:
        impactedSubscriptions.length > 0
          ? `Replacing the ${args.interval} price for ${plan.name} will create a new Stripe price, archive the superseded price, and leave ${impactedSubscriptions.length} active subscription(s) on the old price until you migrate or cancel them separately.`
          : `Replacing the ${args.interval} price for ${plan.name} will create a new Stripe price and archive the superseded price.`,
      warnings:
        impactedSubscriptions.length > 0
          ? ["Existing subscriptions will stay on their current Stripe price after this replacement."]
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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const plan = records.plans.find((entry: { key: string }) => entry.key === args.planKey)

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
      throw new Error(`Type ${plan.key}:${args.interval} to confirm the price replacement.`)
    }

    const nextAmount = validatePriceAmount(
      args.amount,
      `${args.interval === "month" ? "Monthly" : "Yearly"} price`
    )
    const previousAmount =
      args.interval === "month" ? plan.monthlyPriceAmount : plan.yearlyPriceAmount

    if (nextAmount === previousAmount) {
      throw new Error("The replacement price must change the current amount.")
    }

    await ctx.runMutation(internal.mutations.staff.internal.upsertPlan, {
      active: plan.active,
      currency: plan.currency,
      description: plan.description,
      key: plan.key,
      monthlyPriceAmount: args.interval === "month" ? nextAmount : plan.monthlyPriceAmount,
      name: plan.name,
      planType: plan.planType,
      sortOrder: plan.sortOrder,
      yearlyPriceAmount: args.interval === "year" ? nextAmount : plan.yearlyPriceAmount,
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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find((entry) => entry.key === args.featureKey)

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    const impactedSubscriptions = dashboard.subscriptions.filter((subscription) =>
      feature.linkedPlanKeys.includes(subscription.planKey)
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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const feature = records.features.find((entry: { key: string }) => entry.key === args.featureKey)

    if (!feature) {
      throw new Error(`Billing feature ${args.featureKey} was not found.`)
    }

    if (args.confirmationToken !== feature.key) {
      throw new Error(`Type ${feature.key} to confirm the archive operation.`)
    }

    await ctx.runMutation(internal.mutations.staff.internal.setFeatureActiveState, {
      active: false,
      archivedAt: Date.now(),
      featureKey: feature.key,
    })

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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const dashboard = buildBillingDashboard(records)
    const feature = dashboard.features.find((entry) => entry.key === args.featureKey)
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
          ? ["Detach changes are effective only after Stripe synchronization completes."]
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
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const feature = records.features.find((entry: { key: string }) => entry.key === args.featureKey)
    const plan = records.plans.find((entry: { key: string }) => entry.key === args.planKey)

    if (!feature || !plan) {
      throw new Error("The requested plan or feature was not found.")
    }

    await ctx.runMutation(internal.mutations.staff.internal.setPlanFeatureAssignment, {
      enabled: args.enabled,
      featureKey: feature.key,
      planKey: plan.key,
    })

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

export const upsertPlan = action({
  args: {
    active: v.boolean(),
    currency: v.string(),
    description: v.string(),
    key: v.string(),
    monthlyPriceAmount: v.number(),
    name: v.string(),
    planType: v.union(v.literal("free"), v.literal("paid")),
    sortOrder: v.number(),
    yearlyPriceAmount: v.number(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const existingPlan = records.plans.find((plan: { key: string }) => plan.key === args.key)
    const dashboard = buildBillingDashboard(records)
    const normalizedKey = validateCatalogKey(args.key, "Plan key")
    const normalizedName = validateDisplayName(args.name, "Plan name")
    const normalizedCurrency = normalizeCurrency(args.currency)
    const normalizedDescription = normalizeDescription(args.description)
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
      dashboard.subscriptions.some((subscription) => subscription.planKey === existingPlan.key)
    ) {
      throw new Error(
        "Paid plans with active subscriptions cannot be converted into free plans."
      )
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
            monthlyPriceAmount,
            name: normalizedName,
            planType: args.planType,
            sortOrder: args.sortOrder,
            yearlyPriceAmount,
          },
          before: existingPlan ?? null,
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
    appliesTo: v.union(v.literal("entitlement"), v.literal("marketing"), v.literal("both")),
    category: v.optional(v.string()),
    description: v.string(),
    key: v.string(),
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = await ctx.runQuery(internal.queries.staff.internal.getBillingRecords, {})
    const existingFeature = records.features.find((feature: { key: string }) => feature.key === args.key)
    const normalizedKey = validateCatalogKey(args.key, "Feature key")
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
      action: existingFeature ? "billing.feature.updated" : "billing.feature.created",
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
