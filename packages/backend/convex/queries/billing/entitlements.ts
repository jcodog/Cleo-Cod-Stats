import { v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { resolveBillingFeatureApplyMode } from "../../lib/staffRoles"

type UserRecord = Doc<"users">
type BillingFeatureRecord = Doc<"billingFeatures">
type BillingEntitlementRecord = Doc<"billingEntitlements">

function sortFeatures(
  left: BillingFeatureRecord,
  right: BillingFeatureRecord
) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder
  }

  return left.key.localeCompare(right.key)
}

async function getCurrentUser(ctx: QueryCtx): Promise<UserRecord | null> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    return null
  }

  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique()
}

function isEntitlementCurrentlyApplicable(
  entitlement: BillingEntitlementRecord,
  now: number
) {
  if (entitlement.startsAt !== undefined && entitlement.startsAt > now) {
    return false
  }

  if (entitlement.endsAt !== undefined && entitlement.endsAt <= now) {
    return false
  }

  return true
}

async function getEffectivePlanKey(ctx: QueryCtx, user: UserRecord) {
  const subscription = await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique()

  return subscription?.planKey ?? user.plan
}

async function getEffectiveEntitlementKeys(
  ctx: QueryCtx,
  user: UserRecord
): Promise<Set<string>> {
  const now = Date.now()
  const effectivePlanKey = await getEffectivePlanKey(ctx, user)

  const [planMappings, entitlements, features] = await Promise.all([
    ctx.db
      .query("billingPlanFeatures")
      .withIndex("by_planKey", (q) => q.eq("planKey", effectivePlanKey))
      .collect(),
    ctx.db
      .query("billingEntitlements")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect(),
    ctx.db.query("billingFeatures").collect(),
  ])
  const featureModeByKey = new Map(
    features.map((feature) => [
      feature.key,
      resolveBillingFeatureApplyMode(feature.appliesTo),
    ])
  )

  const featureKeys = new Set(
    planMappings
      .filter(
        (mapping) =>
          mapping.enabled &&
          featureModeByKey.get(mapping.featureKey) !== "marketing"
      )
      .map((mapping) => mapping.featureKey)
  )

  const overrides = entitlements
    .filter((entitlement) => isEntitlementCurrentlyApplicable(entitlement, now))
    .sort(
      (left, right) =>
        right.updatedAt - left.updatedAt ||
        right._creationTime - left._creationTime
    )

  const handledFeatureKeys = new Set<string>()

  for (const entitlement of overrides) {
    if (handledFeatureKeys.has(entitlement.featureKey)) {
      continue
    }

    handledFeatureKeys.add(entitlement.featureKey)

    if (entitlement.enabled) {
      featureKeys.add(entitlement.featureKey)
      continue
    }

    featureKeys.delete(entitlement.featureKey)
  }

  return featureKeys
}

export const getCurrentUserEntitlements = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return []
    }

    const [featureKeys, features] = await Promise.all([
      getEffectiveEntitlementKeys(ctx, user),
      ctx.db.query("billingFeatures").collect(),
    ])

    return features
      .filter(
        (feature) =>
          feature.active &&
          resolveBillingFeatureApplyMode(feature.appliesTo) !== "marketing" &&
          featureKeys.has(feature.key)
      )
      .sort(sortFeatures)
  },
})

export const currentUserHasFeature = query({
  args: {
    featureKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)

    if (!user) {
      return false
    }

    const [featureKeys, feature] = await Promise.all([
      getEffectiveEntitlementKeys(ctx, user),
      ctx.db
        .query("billingFeatures")
        .withIndex("by_key", (q) => q.eq("key", args.featureKey))
        .unique(),
    ])

    if (!feature || resolveBillingFeatureApplyMode(feature.appliesTo) === "marketing") {
      return false
    }

    return featureKeys.has(args.featureKey)
  },
})
