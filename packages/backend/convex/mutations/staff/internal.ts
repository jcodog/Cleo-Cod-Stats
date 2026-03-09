import type { Doc } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { v } from "convex/values"

const roleValidator = v.union(
  v.literal("user"),
  v.literal("staff"),
  v.literal("admin"),
  v.literal("super_admin")
)

const billingPlanTypeValidator = v.union(v.literal("free"), v.literal("paid"))

const billingFeatureApplyModeValidator = v.union(
  v.literal("entitlement"),
  v.literal("marketing"),
  v.literal("both")
)

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

type BillingPlanPatch = Partial<
  Pick<
    Doc<"billingPlans">,
    | "active"
    | "archivedAt"
    | "currency"
    | "description"
    | "monthlyPriceAmount"
    | "name"
    | "planType"
    | "sortOrder"
    | "updatedAt"
    | "yearlyPriceAmount"
  >
>

type BillingFeaturePatch = Partial<
  Pick<
    Doc<"billingFeatures">,
    | "active"
    | "appliesTo"
    | "archivedAt"
    | "category"
    | "description"
    | "name"
    | "sortOrder"
    | "updatedAt"
  >
>

function uniqueKeys(values: string[]) {
  return Array.from(new Set(values))
}

async function syncPlanFeatureAssignmentsByPlan(args: {
  ctx: MutationCtx
  featureKeys: string[]
  planKey: string
}) {
  const existingAssignments = await args.ctx.db
    .query("billingPlanFeatures")
    .withIndex("by_planKey", (query) => query.eq("planKey", args.planKey))
    .collect()
  const desiredFeatureKeys = new Set(uniqueKeys(args.featureKeys))
  const existingAssignmentsByFeatureKey = new Map(
    existingAssignments.map((assignment) => [assignment.featureKey, assignment])
  )
  const attachedFeatureKeys: string[] = []
  const detachedFeatureKeys: string[] = []
  const now = Date.now()

  for (const featureKey of desiredFeatureKeys) {
    const existingAssignment = existingAssignmentsByFeatureKey.get(featureKey)

    if (!existingAssignment) {
      await args.ctx.db.insert("billingPlanFeatures", {
        createdAt: now,
        enabled: true,
        featureKey,
        planKey: args.planKey,
        updatedAt: now,
      })
      attachedFeatureKeys.push(featureKey)
      continue
    }

    if (existingAssignment.enabled) {
      continue
    }

    await args.ctx.db.patch(existingAssignment._id, {
      enabled: true,
      updatedAt: now,
    })
    attachedFeatureKeys.push(featureKey)
  }

  for (const existingAssignment of existingAssignments) {
    if (!existingAssignment.enabled || desiredFeatureKeys.has(existingAssignment.featureKey)) {
      continue
    }

    await args.ctx.db.patch(existingAssignment._id, {
      enabled: false,
      updatedAt: now,
    })
    detachedFeatureKeys.push(existingAssignment.featureKey)
  }

  return {
    attachedFeatureKeys,
    detachedFeatureKeys,
  }
}

async function syncPlanFeatureAssignmentsByFeature(args: {
  ctx: MutationCtx
  featureKey: string
  planKeys: string[]
}) {
  const existingAssignments = await args.ctx.db
    .query("billingPlanFeatures")
    .withIndex("by_featureKey", (query) => query.eq("featureKey", args.featureKey))
    .collect()
  const desiredPlanKeys = new Set(uniqueKeys(args.planKeys))
  const existingAssignmentsByPlanKey = new Map(
    existingAssignments.map((assignment) => [assignment.planKey, assignment])
  )
  const attachedPlanKeys: string[] = []
  const detachedPlanKeys: string[] = []
  const now = Date.now()

  for (const planKey of desiredPlanKeys) {
    const existingAssignment = existingAssignmentsByPlanKey.get(planKey)

    if (!existingAssignment) {
      await args.ctx.db.insert("billingPlanFeatures", {
        createdAt: now,
        enabled: true,
        featureKey: args.featureKey,
        planKey,
        updatedAt: now,
      })
      attachedPlanKeys.push(planKey)
      continue
    }

    if (existingAssignment.enabled) {
      continue
    }

    await args.ctx.db.patch(existingAssignment._id, {
      enabled: true,
      updatedAt: now,
    })
    attachedPlanKeys.push(planKey)
  }

  for (const existingAssignment of existingAssignments) {
    if (!existingAssignment.enabled || desiredPlanKeys.has(existingAssignment.planKey)) {
      continue
    }

    await args.ctx.db.patch(existingAssignment._id, {
      enabled: false,
      updatedAt: now,
    })
    detachedPlanKeys.push(existingAssignment.planKey)
  }

  return {
    attachedPlanKeys,
    detachedPlanKeys,
  }
}

export const insertAuditLog = internalMutation({
  args: {
    action: v.string(),
    actorClerkUserId: v.string(),
    actorName: v.string(),
    actorRole: roleValidator,
    details: v.optional(v.string()),
    entityId: v.string(),
    entityLabel: v.optional(v.string()),
    entityType: v.string(),
    result: v.union(v.literal("success"), v.literal("warning"), v.literal("error")),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("staffAuditLogs", {
      ...args,
      createdAt: Date.now(),
    })
  },
})

export const setUserRole = internalMutation({
  args: {
    clerkUserId: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) =>
        query.eq("clerkUserId", args.clerkUserId)
      )
      .unique()

    if (!user) {
      throw new Error(`User not found for Clerk user ${args.clerkUserId}`)
    }

    if (user.role === args.role) {
      return user
    }

    await ctx.db.patch(user._id, {
      role: args.role,
      updatedAt: Date.now(),
    })

    return {
      ...user,
      role: args.role,
    }
  },
})

export const upsertPlan = internalMutation({
  args: {
    active: v.boolean(),
    currency: v.string(),
    description: v.string(),
    key: v.string(),
    monthlyPriceAmount: v.number(),
    name: v.string(),
    planType: billingPlanTypeValidator,
    sortOrder: v.number(),
    yearlyPriceAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const existingPlan = await ctx.db
      .query("billingPlans")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .unique()
    const now = Date.now()

    if (!existingPlan) {
      return await ctx.db.insert("billingPlans", {
        active: args.active,
        archivedAt: args.active ? undefined : now,
        currency: args.currency,
        description: args.description,
        key: args.key,
        monthlyPriceAmount: args.monthlyPriceAmount,
        monthlyPriceId: undefined,
        name: args.name,
        planType: args.planType,
        sortOrder: args.sortOrder,
        stripeProductId: undefined,
        createdAt: now,
        updatedAt: now,
        yearlyPriceAmount: args.yearlyPriceAmount,
        yearlyPriceId: undefined,
      })
    }

    const patch: BillingPlanPatch = {}

    if (existingPlan.active !== args.active) {
      patch.active = args.active
      patch.archivedAt = args.active ? undefined : now
    }

    if (existingPlan.currency !== args.currency) patch.currency = args.currency
    if (existingPlan.description !== args.description) {
      patch.description = args.description
    }
    if (existingPlan.monthlyPriceAmount !== args.monthlyPriceAmount) {
      patch.monthlyPriceAmount = args.monthlyPriceAmount
    }
    if (existingPlan.name !== args.name) patch.name = args.name
    if (existingPlan.planType !== args.planType) patch.planType = args.planType
    if (existingPlan.sortOrder !== args.sortOrder) patch.sortOrder = args.sortOrder
    if (existingPlan.yearlyPriceAmount !== args.yearlyPriceAmount) {
      patch.yearlyPriceAmount = args.yearlyPriceAmount
    }

    if (Object.keys(patch).length === 0) {
      return existingPlan._id
    }

    patch.updatedAt = now
    await ctx.db.patch(existingPlan._id, patch)
    return existingPlan._id
  },
})

export const setPlanActiveState = internalMutation({
  args: {
    active: v.boolean(),
    archivedAt: v.optional(v.number()),
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    const plan = await ctx.db
      .query("billingPlans")
      .withIndex("by_key", (query) => query.eq("key", args.planKey))
      .unique()

    if (!plan) {
      throw new Error(`Billing plan not found: ${args.planKey}`)
    }

    await ctx.db.patch(plan._id, {
      active: args.active,
      archivedAt: args.archivedAt,
      updatedAt: Date.now(),
    })

    return {
      ...plan,
      active: args.active,
      archivedAt: args.archivedAt,
    }
  },
})

export const upsertFeature = internalMutation({
  args: {
    active: v.boolean(),
    appliesTo: billingFeatureApplyModeValidator,
    category: v.optional(v.string()),
    description: v.string(),
    key: v.string(),
    name: v.string(),
    sortOrder: v.number(),
  },
  handler: async (ctx, args) => {
    const existingFeature = await ctx.db
      .query("billingFeatures")
      .withIndex("by_key", (query) => query.eq("key", args.key))
      .unique()
    const now = Date.now()

    if (!existingFeature) {
      return await ctx.db.insert("billingFeatures", {
        active: args.active,
        appliesTo: args.appliesTo,
        archivedAt: args.active ? undefined : now,
        category: args.category,
        description: args.description,
        key: args.key,
        name: args.name,
        sortOrder: args.sortOrder,
        stripeFeatureId: undefined,
        createdAt: now,
        updatedAt: now,
      })
    }

    const patch: BillingFeaturePatch = {}

    if (existingFeature.active !== args.active) {
      patch.active = args.active
      patch.archivedAt = args.active ? undefined : now
    }
    if ((existingFeature.appliesTo ?? "both") !== args.appliesTo) {
      patch.appliesTo = args.appliesTo
    }
    if ((existingFeature.category ?? undefined) !== args.category) {
      patch.category = args.category
    }
    if (existingFeature.description !== args.description) {
      patch.description = args.description
    }
    if (existingFeature.name !== args.name) patch.name = args.name
    if (existingFeature.sortOrder !== args.sortOrder) patch.sortOrder = args.sortOrder

    if (Object.keys(patch).length === 0) {
      return existingFeature._id
    }

    patch.updatedAt = now
    await ctx.db.patch(existingFeature._id, patch)
    return existingFeature._id
  },
})

export const setFeatureActiveState = internalMutation({
  args: {
    active: v.boolean(),
    archivedAt: v.optional(v.number()),
    featureKey: v.string(),
  },
  handler: async (ctx, args) => {
    const feature = await ctx.db
      .query("billingFeatures")
      .withIndex("by_key", (query) => query.eq("key", args.featureKey))
      .unique()

    if (!feature) {
      throw new Error(`Billing feature not found: ${args.featureKey}`)
    }

    await ctx.db.patch(feature._id, {
      active: args.active,
      archivedAt: args.archivedAt,
      updatedAt: Date.now(),
    })

    return {
      ...feature,
      active: args.active,
      archivedAt: args.archivedAt,
    }
  },
})

export const setPlanFeatureAssignment = internalMutation({
  args: {
    enabled: v.boolean(),
    featureKey: v.string(),
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existingAssignment = await ctx.db
      .query("billingPlanFeatures")
      .withIndex("by_planKey_featureKey", (query) =>
        query.eq("planKey", args.planKey).eq("featureKey", args.featureKey)
      )
      .unique()
    const now = Date.now()

    if (!existingAssignment) {
      return await ctx.db.insert("billingPlanFeatures", {
        createdAt: now,
        enabled: args.enabled,
        featureKey: args.featureKey,
        planKey: args.planKey,
        updatedAt: now,
      })
    }

    if (existingAssignment.enabled === args.enabled) {
      return existingAssignment._id
    }

    await ctx.db.patch(existingAssignment._id, {
      enabled: args.enabled,
      updatedAt: now,
    })

    return existingAssignment._id
  },
})

export const syncPlanFeatureAssignmentsForPlan = internalMutation({
  args: {
    featureKeys: v.array(v.string()),
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await syncPlanFeatureAssignmentsByPlan({
      ctx,
      featureKeys: args.featureKeys,
      planKey: args.planKey,
    })
  },
})

export const syncPlanFeatureAssignmentsForFeature = internalMutation({
  args: {
    featureKey: v.string(),
    planKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await syncPlanFeatureAssignmentsByFeature({
      ctx,
      featureKey: args.featureKey,
      planKeys: args.planKeys,
    })
  },
})

export const updateSubscriptionsAfterCancel = internalMutation({
  args: {
    updates: v.array(
      v.object({
        cancelAtPeriodEnd: v.boolean(),
        canceledAt: v.optional(v.number()),
        currentPeriodEnd: v.optional(v.number()),
        status: v.optional(subscriptionStatusValidator),
        stripeSubscriptionId: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const update of args.updates) {
      const existingSubscription = await ctx.db
        .query("billingSubscriptions")
        .withIndex("by_stripeSubscriptionId", (query) =>
          query.eq("stripeSubscriptionId", update.stripeSubscriptionId)
        )
        .unique()

      if (!existingSubscription) {
        continue
      }

      await ctx.db.patch(existingSubscription._id, {
        cancelAtPeriodEnd: update.cancelAtPeriodEnd,
        canceledAt: update.canceledAt,
        currentPeriodEnd: update.currentPeriodEnd,
        status: update.status ?? existingSubscription.status,
        updatedAt: Date.now(),
      })
    }
  },
})
