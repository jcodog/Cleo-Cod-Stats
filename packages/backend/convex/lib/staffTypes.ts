import type {
  AuditLogResult,
  BillingFeatureApplyMode,
  RequiredStaffRole,
  UserRole,
} from "./staffRoles"

export type StaffAccessIssueCode =
  | "missing_clerk_role"
  | "missing_convex_token"
  | "missing_convex_user"
  | "missing_convex_role"
  | "invalid_clerk_role"
  | "invalid_convex_role"
  | "role_mismatch"
  | "insufficient_role"

export type StaffAccessViewState =
  | {
      ok: true
      requiredRole: RequiredStaffRole
      clerkRole: UserRole
      convexRole: UserRole
      clerkUserId: string
      displayName: string
      email?: string
    }
  | {
      ok: false
      requiredRole: RequiredStaffRole
      reason: StaffAccessIssueCode
      clerkRole: UserRole | null
      convexRole: UserRole | null
      clerkUserId: string
      displayName: string
      email?: string
      supportMessage: string
    }

export type StaffAuditLogEntry = {
  action: string
  actorClerkUserId: string
  actorName: string
  actorRole: UserRole
  createdAt: number
  details?: string
  entityId: string
  entityLabel?: string
  entityType: string
  id: string
  result: AuditLogResult
  summary: string
}

export type StaffManagementUserRecord = {
  clerkRole: UserRole | null
  clerkUserId: string
  convexRole: UserRole | null
  displayName: string
  email?: string
  hasConvexUser: boolean
  isReservedSuperAdmin: boolean
  isCurrentUser: boolean
  roleStatus:
    | "matched"
    | "mismatch"
    | "missing_clerk"
    | "missing_convex"
    | "missing_both"
  status: "active" | "disabled" | "unknown"
}

export type StaffManagementDashboard = {
  adminCount: number
  auditLogs: StaffAuditLogEntry[]
  currentActorClerkUserId: string
  currentActorRole: UserRole
  generatedAt: number
  staffCount: number
  superAdminCount: number
  users: StaffManagementUserRecord[]
}

export type StaffSubscriptionImpactRow = {
  cancelAtPeriodEnd: boolean
  clerkUserId: string
  currentPeriodEnd?: number
  email?: string
  interval: "month" | "year"
  planKey: string
  status: string
  stripePriceId: string
  stripeSubscriptionId: string
  userName: string
}

export type StaffBillingPlanRecord = {
  active: boolean
  activeSubscriptionCount: number
  archivedAt?: number
  currentMonthlySubscriptionCount: number
  currentYearlySubscriptionCount: number
  currency: string
  description: string
  includedFeatureKeys: string[]
  key: string
  monthlyPriceAmount: number
  monthlyPriceId?: string
  name: string
  planType: "free" | "paid"
  sortOrder: number
  stripeProductId?: string
  syncStatus: "archived" | "attention" | "free" | "ready"
  yearlyPriceAmount: number
  yearlyPriceId?: string
}

export type StaffBillingFeatureRecord = {
  active: boolean
  activeSubscriptionCount: number
  appliesTo: BillingFeatureApplyMode
  archivedAt?: number
  category?: string
  description: string
  key: string
  linkedPlanKeys: string[]
  name: string
  sortOrder: number
  stripeFeatureId?: string
}

export type StaffBillingAssignmentRecord = {
  enabled: boolean
  featureKey: string
  planKey: string
}

export type StaffBillingSyncSummary = {
  result: AuditLogResult
  summary: string
  syncedAt: number
  warningCount: number
}

export type StaffBillingDashboard = {
  activeSubscriptionCount: number
  assignments: StaffBillingAssignmentRecord[]
  auditLogs: StaffAuditLogEntry[]
  features: StaffBillingFeatureRecord[]
  generatedAt: number
  lastSync: StaffBillingSyncSummary | null
  plans: StaffBillingPlanRecord[]
  subscriptions: StaffSubscriptionImpactRow[]
}

export type StaffOverviewStatusCount = {
  count: number
  status: "active" | "past_due" | "paused" | "trialing"
}

export type StaffOverviewTimelinePoint = {
  count: number
  dayStart: number
}

export type StaffOverviewDashboard = {
  actorRole: UserRole
  activityTimeline: StaffOverviewTimelinePoint[]
  cancelAtPeriodEndCount: number
  counts: {
    activeSubscriptions: number
    adminUsers: number
    attentionSubscriptions: number
    billingFeatures: number
    billingPlans: number
    staffUsers: number
    superAdminUsers: number
    syncAttentionPlans: number
    trackedUsers: number
  }
  generatedAt: number
  lastSync: StaffBillingSyncSummary | null
  recentActivity: StaffAuditLogEntry[]
  subscriptionStatusCounts: StaffOverviewStatusCount[]
}

export type StaffImpactPreview = {
  confirmationToken?: string
  counts: {
    activeCustomers: number
    activeSubscriptions: number
    affectedPlans: number
    affectedUsers: number
  }
  impactedSubscriptions: StaffSubscriptionImpactRow[]
  summary: string
  warnings: string[]
}

export type StaffMutationResponse = {
  requiresSessionRefresh?: boolean
  summary: string
  syncSummary?: StaffBillingSyncSummary | null
}
