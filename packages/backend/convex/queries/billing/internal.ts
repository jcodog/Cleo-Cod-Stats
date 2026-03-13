import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { internalQuery, type QueryCtx } from "../../_generated/server"
import type { BillingSubscriptionStatus } from "../../lib/billing"

type BillingCustomerRecord = Doc<"billingCustomers">
type BillingSubscriptionRecord = Doc<"billingSubscriptions">
type BillingAccessGrantRecord = Doc<"billingAccessGrants">

function getSubscriptionPriority(status: BillingSubscriptionStatus) {
  switch (status) {
    case "active":
      return 7
    case "trialing":
      return 6
    case "past_due":
      return 5
    case "paused":
      return 4
    case "incomplete":
      return 3
    case "unpaid":
      return 2
    case "canceled":
      return 1
    case "incomplete_expired":
      return 0
  }
}

export function selectCurrentBillingSubscription(
  subscriptions: BillingSubscriptionRecord[]
) {
  return [...subscriptions].sort((left, right) => {
    const priorityDifference =
      getSubscriptionPriority(right.status) - getSubscriptionPriority(left.status)

    if (priorityDifference !== 0) {
      return priorityDifference
    }

    if ((right.updatedAt ?? 0) !== (left.updatedAt ?? 0)) {
      return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
    }

    return right._creationTime - left._creationTime
  })[0] ?? null
}

export function isBillingAccessGrantActive(
  grant: BillingAccessGrantRecord,
  now: number
) {
  if (!grant.active) {
    return false
  }

  if (grant.startsAt !== undefined && grant.startsAt > now) {
    return false
  }

  if (grant.endsAt !== undefined && grant.endsAt <= now) {
    return false
  }

  return true
}

function getGrantPriority(source: BillingAccessGrantRecord["source"]) {
  switch (source) {
    case "creator_approval":
      return 3
    case "manual":
      return 2
    case "promo":
      return 1
  }
}

export function selectCurrentBillingAccessGrant(
  grants: BillingAccessGrantRecord[],
  now = Date.now()
) {
  return [...grants]
    .filter((grant) => isBillingAccessGrantActive(grant, now))
    .sort((left, right) => {
      const priorityDifference =
        getGrantPriority(right.source) - getGrantPriority(left.source)

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      if ((right.updatedAt ?? 0) !== (left.updatedAt ?? 0)) {
        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
      }

      return right._creationTime - left._creationTime
    })[0] ?? null
}

async function getBillingCustomerByUserId(ctx: QueryCtx, userId: Doc<"users">["_id"]) {
  return await ctx.db
    .query("billingCustomers")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .unique()
}

async function getBillingSubscriptionsByUserId(
  ctx: QueryCtx,
  userId: Doc<"users">["_id"]
) {
  return await ctx.db
    .query("billingSubscriptions")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .collect()
}

async function getBillingAccessGrantsByUserId(
  ctx: QueryCtx,
  userId: Doc<"users">["_id"]
) {
  return await ctx.db
    .query("billingAccessGrants")
    .withIndex("by_userId", (query) => query.eq("userId", userId))
    .collect()
}

export const getPlanByKey = internalQuery({
  args: {
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("billingPlans")
      .withIndex("by_key", (query) => query.eq("key", args.planKey))
      .unique()
  },
})

export const getPlanByStripePriceId = internalQuery({
  args: {
    stripePriceId: v.string(),
  },
  handler: async (ctx, args) => {
    const plans = await ctx.db.query("billingPlans").collect()

    return (
      plans.find(
        (plan) =>
          plan.monthlyPriceId === args.stripePriceId ||
          plan.yearlyPriceId === args.stripePriceId
      ) ?? null
    )
  },
})

export const getUserBillingContextByClerkUserId = internalQuery({
  args: {
    clerkUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) => query.eq("clerkUserId", args.clerkUserId))
      .unique()

    if (!user) {
      return null
    }

    const [customer, subscriptions, grants] = await Promise.all([
      getBillingCustomerByUserId(ctx, user._id),
      getBillingSubscriptionsByUserId(ctx, user._id),
      getBillingAccessGrantsByUserId(ctx, user._id),
    ])

    return {
      accessGrant: selectCurrentBillingAccessGrant(grants),
      customer,
      subscription: selectCurrentBillingSubscription(subscriptions),
      user,
    }
  },
})

export const getBillingContextByStripeCustomerId = internalQuery({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db
      .query("billingCustomers")
      .withIndex("by_stripeCustomerId", (query) =>
        query.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .unique()

    if (!customer) {
      return null
    }

    const user = await ctx.db.get(customer.userId)

    if (!user) {
      return null
    }

    const [subscriptions, grants] = await Promise.all([
      getBillingSubscriptionsByUserId(ctx, user._id),
      getBillingAccessGrantsByUserId(ctx, user._id),
    ])

    return {
      accessGrant: selectCurrentBillingAccessGrant(grants),
      customer,
      subscription: selectCurrentBillingSubscription(subscriptions),
      user,
    }
  },
})

export const getCurrentCreatorGrantByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const grants = await getBillingAccessGrantsByUserId(ctx, args.userId)

    return (
      selectCurrentBillingAccessGrant(
        grants.filter((grant) => grant.source === "creator_approval")
      ) ?? null
    )
  },
})

export const listBillingSubscriptionsByUserId = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await getBillingSubscriptionsByUserId(ctx, args.userId)
  },
})

export const getBillingSubscriptionByStripeSubscriptionIdForUser = internalQuery({
  args: {
    stripeSubscriptionId: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("billingSubscriptions")
      .withIndex("by_stripeSubscriptionId", (query) =>
        query.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .unique()

    if (!subscription || subscription.userId !== args.userId) {
      return null
    }

    return subscription
  },
})
