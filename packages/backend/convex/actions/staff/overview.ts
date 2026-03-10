"use node"

import { action } from "../../_generated/server"
import { internal } from "../../_generated/api"
import { requireAuthorizedStaffAction } from "../../lib/staffActionAuth"
import { roleMeetsRequirement, type UserRole } from "../../lib/staffRoles"
import type {
  StaffAuditLogEntry,
  StaffBillingSyncSummary,
  StaffOverviewDashboard,
  StaffOverviewTimelinePoint,
} from "../../lib/staffTypes"

type OverviewSubscriptionStatus = "active" | "past_due" | "paused" | "trialing"
type OverviewAuditLogRecord = {
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
}
type OverviewPlanRecord = {
  active: boolean
  archivedAt?: number
  monthlyPriceId?: string
  planType: "free" | "paid"
  stripeProductId?: string
  yearlyPriceId?: string
}
type OverviewSubscriptionRecord = {
  cancelAtPeriodEnd: boolean
  status: string
}
type OverviewUserRecord = {
  role?: UserRole
}
type OverviewRecords = {
  auditLogs: OverviewAuditLogRecord[]
  features: unknown[]
  plans: OverviewPlanRecord[]
  subscriptions: OverviewSubscriptionRecord[]
  users: OverviewUserRecord[]
}

const OVERVIEW_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const satisfies readonly OverviewSubscriptionStatus[]

function mapAuditLogEntry(log: OverviewAuditLogRecord): StaffAuditLogEntry {
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

function isOverviewSubscriptionStatus(
  value: string
): value is OverviewSubscriptionStatus {
  return OVERVIEW_SUBSCRIPTION_STATUSES.includes(
    value as OverviewSubscriptionStatus
  )
}

function getPlanNeedsAttention(plan: {
  active: boolean
  archivedAt?: number
  monthlyPriceId?: string
  planType: "free" | "paid"
  stripeProductId?: string
  yearlyPriceId?: string
}) {
  if (plan.planType === "free") {
    return false
  }

  if (!plan.active || plan.archivedAt !== undefined) {
    return false
  }

  return !plan.stripeProductId || !plan.monthlyPriceId || !plan.yearlyPriceId
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

function getDayStart(timestamp: number) {
  const value = new Date(timestamp)
  value.setHours(0, 0, 0, 0)
  return value.getTime()
}

function buildActivityTimeline(logs: Array<{ createdAt: number }>) {
  const dayStart = getDayStart(Date.now())
  const days = 7
  const countsByDay = new Map<number, number>()

  for (let offset = 0; offset < days; offset += 1) {
    countsByDay.set(dayStart - offset * 86_400_000, 0)
  }

  for (const log of logs) {
    const key = getDayStart(log.createdAt)

    if (countsByDay.has(key)) {
      countsByDay.set(key, (countsByDay.get(key) ?? 0) + 1)
    }
  }

  return Array.from(countsByDay.entries())
    .map<StaffOverviewTimelinePoint>(([dayStart, count]) => ({
      count,
      dayStart,
    }))
    .sort((left, right) => left.dayStart - right.dayStart)
}

export const getDashboard = action({
  args: {},
  handler: async (ctx): Promise<StaffOverviewDashboard> => {
    const operator = await requireAuthorizedStaffAction(ctx, "staff")
    const records = (await ctx.runQuery(
      internal.queries.staff.internal.getOverviewRecords,
      {}
    )) as OverviewRecords
    const canReviewManagement = roleMeetsRequirement(operator.actorRole, "admin")
    const accessibleAuditLogs = records.auditLogs.filter((log: OverviewAuditLogRecord) =>
      log.entityType.startsWith("billing")
        ? true
        : canReviewManagement && log.entityType === "user"
    )
    const subscriptions = records.subscriptions.filter(
      (
        subscription
      ): subscription is OverviewSubscriptionRecord & {
        status: OverviewSubscriptionStatus
      } => isOverviewSubscriptionStatus(subscription.status)
    )
    const activeSubscriptionCount = subscriptions.filter(
      (subscription: OverviewSubscriptionRecord) =>
        subscription.status === "active" || subscription.status === "trialing"
    ).length
    const attentionSubscriptionCount = subscriptions.filter(
      (subscription: OverviewSubscriptionRecord) =>
        subscription.status === "past_due" ||
        subscription.status === "paused" ||
        subscription.cancelAtPeriodEnd
    ).length
    const cancelAtPeriodEndCount = subscriptions.filter(
      (subscription: OverviewSubscriptionRecord) => subscription.cancelAtPeriodEnd
    ).length
    const subscriptionStatusCounts = OVERVIEW_SUBSCRIPTION_STATUSES.map((status) => ({
      count: subscriptions.filter(
        (subscription: OverviewSubscriptionRecord) => subscription.status === status
      ).length,
      status,
    }))
    const lastSync = parseSyncSummary(
      accessibleAuditLogs.find(
        (log: OverviewAuditLogRecord) => log.action === "billing.catalog.sync"
      )?.details
    )

    return {
      actorRole: operator.actorRole,
      activityTimeline: buildActivityTimeline(accessibleAuditLogs),
      cancelAtPeriodEndCount,
      counts: {
        activeSubscriptions: activeSubscriptionCount,
        adminUsers: records.users.filter((user: OverviewUserRecord) => user.role === "admin")
          .length,
        attentionSubscriptions: attentionSubscriptionCount,
        billingFeatures: records.features.length,
        billingPlans: records.plans.length,
        staffUsers: records.users.filter((user: OverviewUserRecord) => user.role === "staff")
          .length,
        superAdminUsers: records.users.filter(
          (user: OverviewUserRecord) => user.role === "super_admin"
        ).length,
        syncAttentionPlans: records.plans.filter(getPlanNeedsAttention).length,
        trackedUsers: records.users.length,
      },
      generatedAt: Date.now(),
      lastSync,
      recentActivity: accessibleAuditLogs.slice(0, 8).map(mapAuditLogEntry),
      subscriptionStatusCounts,
    }
  },
})
