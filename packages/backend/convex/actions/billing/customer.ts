"use node"

import Stripe from "stripe"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { internal } from "../../_generated/api"
import { action, type ActionCtx } from "../../_generated/server"
import {
  reconcileBillingCustomer,
  reconcileStripeSubscription,
  syncBillingInvoicesForCustomer,
  syncBillingPaymentMethodsForCustomer,
} from "../../lib/billingLifecycle"
import {
  getExpandedStripeInvoice,
  getInvoiceConfirmationSecret,
  getSetupIntentClientSecret,
  getStripeScheduleId,
  getStripeSubscriptionInterval,
  getStripeSubscriptionItem,
  getSubscriptionItemCurrentPeriodEnd,
} from "../../lib/billingStripe"
import { getClerkBackendClient } from "../../lib/clerk"
import { getStripe, STRIPE_CATALOG_APP } from "../../lib/stripe"

type BillingPlanRecord = Doc<"billingPlans">
type PublicActionCtx = ActionCtx

const billingIntervalValidator = v.union(v.literal("month"), v.literal("year"))
const billingProfileAddressValidator = v.object({
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  line1: v.optional(v.string()),
  line2: v.optional(v.string()),
  postalCode: v.optional(v.string()),
  state: v.optional(v.string()),
})

class BillingActionError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

function getStripeStatusPriority(status: Stripe.Subscription.Status) {
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

function sanitizeBillingError(error: unknown) {
  if (error instanceof BillingActionError) {
    return error
  }

  if (error instanceof Stripe.errors.StripeError) {
    return new BillingActionError(
      error.code ?? "stripe_error",
      error.message || "Billing request failed.",
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 502
    )
  }

  return new BillingActionError(
    "billing_error",
    "Unable to complete the billing request.",
    500
  )
}

function normalizeOptionalString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function toStripeEmptyableString(value: string | null | undefined) {
  return normalizeOptionalString(value) ?? ""
}

function buildStripeAddress(
  address:
    | {
        city?: string
        country?: string
        line1?: string
        line2?: string
        postalCode?: string
        state?: string
      }
    | null
    | undefined
): Stripe.Emptyable<Stripe.AddressParam> {
  if (!address) {
    return ""
  }

  const nextAddress = {
    city: normalizeOptionalString(address.city),
    country: normalizeOptionalString(address.country),
    line1: normalizeOptionalString(address.line1),
    line2: normalizeOptionalString(address.line2),
    postal_code: normalizeOptionalString(address.postalCode),
    state: normalizeOptionalString(address.state),
  }

  if (
    !nextAddress.line1 &&
    !nextAddress.line2 &&
    !nextAddress.city &&
    !nextAddress.state &&
    !nextAddress.postal_code &&
    !nextAddress.country
  ) {
    return ""
  }

  return nextAddress
}

function getMetadataStripeCustomerId(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined
  }

  const metadata = value as Record<string, unknown>
  const directValue = metadata.stripeCustomerId

  if (
    typeof directValue === "string" &&
    directValue.trim().startsWith("cus_")
  ) {
    return directValue.trim()
  }

  const billingValue = metadata.billing

  if (
    !billingValue ||
    typeof billingValue !== "object" ||
    Array.isArray(billingValue)
  ) {
    return undefined
  }

  const nestedValue = (billingValue as Record<string, unknown>).stripeCustomerId

  if (
    typeof nestedValue === "string" &&
    nestedValue.trim().startsWith("cus_")
  ) {
    return nestedValue.trim()
  }

  return undefined
}

async function requireBillingUser(ctx: PublicActionCtx) {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new BillingActionError(
      "unauthenticated",
      "You must be signed in to manage billing.",
      401
    )
  }

  const billingContext = await ctx.runQuery(
    internal.queries.billing.internal.getUserBillingContextByClerkUserId,
    {
      clerkUserId: identity.subject,
    }
  )

  if (!billingContext) {
    throw new BillingActionError(
      "missing_user",
      "Your billing account could not be found.",
      404
    )
  }

  const clerkUser = await getClerkBackendClient().users.getUser(
    identity.subject
  )
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress ??
    billingContext.customer?.email ??
    undefined
  const actorName =
    [clerkUser.firstName?.trim(), clerkUser.lastName?.trim()]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    clerkUser.username?.trim() ||
    billingContext.user.name

  return {
    ...billingContext,
    actorName,
    email,
    metadataStripeCustomerId: getMetadataStripeCustomerId(
      clerkUser.publicMetadata
    ),
  }
}

async function assertCheckoutEnabled(ctx: PublicActionCtx) {
  const checkoutFlag = await ctx.runQuery(
    internal.queries.featureFlags.internal.getByKey,
    {
      key: "checkout",
    }
  )

  if (checkoutFlag && !checkoutFlag.enabled) {
    throw new BillingActionError(
      "checkout_disabled",
      "Checkout is currently unavailable.",
      403
    )
  }
}

async function recordBillingAuditLog(args: {
  action: string
  ctx: PublicActionCtx
  details?: string
  entityId: string
  entityLabel?: string
  result: "error" | "success" | "warning"
  summary: string
  user: Awaited<ReturnType<typeof requireBillingUser>>["user"]
  userName: string
}) {
  await args.ctx.runMutation(internal.mutations.staff.internal.insertAuditLog, {
    action: args.action,
    actorClerkUserId: args.user.clerkUserId,
    actorName: args.userName,
    actorRole: args.user.role ?? "user",
    details: args.details,
    entityId: args.entityId,
    entityLabel: args.entityLabel,
    entityType: "billingCustomerAction",
    result: args.result,
    summary: args.summary,
  })
}

async function getPurchasablePlan(args: {
  ctx: PublicActionCtx
  interval: "month" | "year"
  planKey: string
}) {
  const plan = await args.ctx.runQuery(
    internal.queries.billing.internal.getPlanByKey,
    {
      planKey: args.planKey,
    }
  )

  if (!plan || !plan.active || plan.archivedAt !== undefined) {
    throw new BillingActionError(
      "plan_unavailable",
      "That plan is not available for purchase.",
      404
    )
  }

  if (plan.planType !== "paid") {
    throw new BillingActionError(
      "plan_not_paid",
      "That plan cannot be purchased through Stripe.",
      400
    )
  }

  const priceId =
    args.interval === "month" ? plan.monthlyPriceId : plan.yearlyPriceId

  if (!priceId) {
    throw new BillingActionError(
      "missing_price",
      "That plan is missing Stripe pricing for the selected billing interval.",
      409
    )
  }

  return {
    plan,
    priceId,
  }
}

function getPlanAmount(plan: BillingPlanRecord, interval: "month" | "year") {
  return interval === "month" ? plan.monthlyPriceAmount : plan.yearlyPriceAmount
}

function getPreviewProrationBreakdown(args: {
  invoice: Stripe.Invoice
  prorationDate: number
}) {
  let creditApplied = 0
  let proratedCharge = 0

  for (const lineItem of args.invoice.lines.data) {
    const linePeriodStart =
      typeof lineItem.period?.start === "number"
        ? lineItem.period.start
        : undefined
    const isProrationLine =
      ("proration" in lineItem && lineItem.proration === true) ||
      linePeriodStart === args.prorationDate

    if (!isProrationLine) {
      continue
    }

    if (lineItem.amount < 0) {
      creditApplied += Math.abs(lineItem.amount)
      continue
    }

    if (lineItem.amount > 0) {
      proratedCharge += lineItem.amount
    }
  }

  return {
    creditApplied,
    proratedCharge,
  }
}

function getMonthlyEquivalentAmount(
  plan: BillingPlanRecord,
  interval: "month" | "year"
) {
  const amount = getPlanAmount(plan, interval)
  return interval === "year" ? amount / 12 : amount
}

function classifyPlanChange(args: {
  currentInterval: "month" | "year"
  currentPlan: BillingPlanRecord
  targetInterval: "month" | "year"
  targetPlan: BillingPlanRecord
}) {
  if (
    args.targetPlan.key === args.currentPlan.key &&
    args.targetInterval === args.currentInterval
  ) {
    return "noop" as const
  }

  if (args.targetPlan.key === args.currentPlan.key) {
    return "switch_now" as const
  }

  if (args.targetPlan.sortOrder > args.currentPlan.sortOrder) {
    return "upgrade_now" as const
  }

  if (args.targetPlan.sortOrder < args.currentPlan.sortOrder) {
    return "downgrade_later" as const
  }

  const currentEquivalent = getMonthlyEquivalentAmount(
    args.currentPlan,
    args.currentInterval
  )
  const targetEquivalent = getMonthlyEquivalentAmount(
    args.targetPlan,
    args.targetInterval
  )

  if (targetEquivalent > currentEquivalent) {
    return "upgrade_now" as const
  }

  if (targetEquivalent < currentEquivalent) {
    return "switch_later" as const
  }

  return "switch_now" as const
}

async function ensureStripeCustomer(args: {
  ctx: PublicActionCtx
  email?: string
  stripe: Stripe
  userContext: Awaited<ReturnType<typeof requireBillingUser>>
}) {
  if (args.userContext.customer?.stripeCustomerId) {
    await args.ctx.runMutation(
      internal.mutations.billing.state.upsertBillingCustomer,
      {
        active: true,
        clerkUserId: args.userContext.user.clerkUserId,
        email: args.email ?? args.userContext.customer.email,
        name: args.userContext.actorName,
        stripeCustomerId: args.userContext.customer.stripeCustomerId,
        userId: args.userContext.user._id,
      }
    )

    return args.userContext.customer.stripeCustomerId
  }

  if (args.userContext.metadataStripeCustomerId) {
    try {
      const existingCustomer = await args.stripe.customers.retrieve(
        args.userContext.metadataStripeCustomerId
      )

      if (!existingCustomer.deleted) {
        await args.ctx.runMutation(
          internal.mutations.billing.state.upsertBillingCustomer,
          {
            active: true,
            clerkUserId: args.userContext.user.clerkUserId,
            email:
              args.email ??
              existingCustomer.email ??
              args.userContext.customer?.email,
            name: existingCustomer.name ?? args.userContext.actorName,
            stripeCustomerId: existingCustomer.id,
            userId: args.userContext.user._id,
          }
        )

        return existingCustomer.id
      }
    } catch (error) {
      if (
        !(
          error instanceof Stripe.errors.StripeInvalidRequestError &&
          error.code === "resource_missing"
        )
      ) {
        throw error
      }
    }
  }

  const customer = await args.stripe.customers.create({
    email: args.email,
    metadata: {
      app: STRIPE_CATALOG_APP,
      clerkUserId: args.userContext.user.clerkUserId,
      userId: args.userContext.user._id,
    },
    name: args.userContext.actorName,
  })

  await args.ctx.runMutation(
    internal.mutations.billing.state.upsertBillingCustomer,
    {
      active: true,
      clerkUserId: args.userContext.user.clerkUserId,
      email: args.email,
      name: args.userContext.actorName,
      stripeCustomerId: customer.id,
      userId: args.userContext.user._id,
    }
  )

  return customer.id
}

async function syncCustomerBillingSnapshot(args: {
  ctx: PublicActionCtx
  stripe: Stripe
  stripeCustomerId: string
  syncInvoices?: boolean
}) {
  await reconcileBillingCustomer({
    active: true,
    ctx: args.ctx,
    stripe: args.stripe,
    stripeCustomerId: args.stripeCustomerId,
  })
  await syncBillingPaymentMethodsForCustomer({
    ctx: args.ctx,
    stripe: args.stripe,
    stripeCustomerId: args.stripeCustomerId,
  })

  if (args.syncInvoices ?? true) {
    await syncBillingInvoicesForCustomer({
      ctx: args.ctx,
      stripe: args.stripe,
      stripeCustomerId: args.stripeCustomerId,
    })
  }
}

async function getExistingStripeSubscription(args: {
  customerId: string
  stripe: Stripe
}) {
  const subscriptions = await args.stripe.subscriptions.list({
    customer: args.customerId,
    limit: 10,
    status: "all",
  })

  return (
    [...subscriptions.data].sort((left, right) => {
      const priorityDifference =
        getStripeStatusPriority(right.status) -
        getStripeStatusPriority(left.status)

      if (priorityDifference !== 0) {
        return priorityDifference
      }

      return right.created - left.created
    })[0] ?? null
  )
}

async function listStripeSubscriptionsForCustomer(args: {
  customerId: string
  stripe: Stripe
}) {
  const subscriptions: Stripe.Subscription[] = []

  for await (const subscription of args.stripe.subscriptions.list({
    customer: args.customerId,
    expand: ["data.default_payment_method"],
    limit: 100,
    status: "all",
  })) {
    subscriptions.push(subscription)
  }

  return subscriptions
}

async function getExpandedSubscription(args: {
  stripe: Stripe
  subscriptionId: string
}) {
  return await args.stripe.subscriptions.retrieve(args.subscriptionId, {
    expand: [
      "customer",
      "default_payment_method",
      "items.data.price.product",
      "latest_invoice.confirmation_secret",
      "latest_invoice.payment_intent",
      "pending_setup_intent",
      "schedule",
    ],
  })
}

async function getTargetSubscription(args: {
  ctx: PublicActionCtx
  stripeSubscriptionId?: string
  userContext: Awaited<ReturnType<typeof requireBillingUser>>
}) {
  if (!args.stripeSubscriptionId) {
    if (!args.userContext.subscription) {
      throw new BillingActionError(
        "missing_subscription",
        "No active subscription was found for this account.",
        404
      )
    }

    return args.userContext.subscription
  }

  const subscription = await args.ctx.runQuery(
    internal.queries.billing.internal
      .getBillingSubscriptionByStripeSubscriptionIdForUser,
    {
      stripeSubscriptionId: args.stripeSubscriptionId,
      userId: args.userContext.user._id,
    }
  )

  if (!subscription) {
    throw new BillingActionError(
      "subscription_not_found",
      "That subscription could not be found for this billing account.",
      404
    )
  }

  return subscription
}

function getConfirmationPayload(subscription: Stripe.Subscription) {
  const invoiceClientSecret = getInvoiceConfirmationSecret(
    subscription.latest_invoice
  )

  if (invoiceClientSecret) {
    return {
      clientSecret: invoiceClientSecret,
      secretType: "payment_intent" as const,
    }
  }

  const setupIntentClientSecret = getSetupIntentClientSecret(
    subscription.pending_setup_intent
  )

  if (setupIntentClientSecret) {
    return {
      clientSecret: setupIntentClientSecret,
      secretType: "setup_intent" as const,
    }
  }

  return {
    clientSecret: undefined,
    secretType: "none" as const,
  }
}

async function releaseExistingSchedule(
  subscription: Stripe.Subscription,
  stripe: Stripe
) {
  const scheduleId = getStripeScheduleId(subscription.schedule)

  if (!scheduleId) {
    return
  }

  try {
    await stripe.subscriptionSchedules.release(scheduleId)
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError &&
      error.code === "resource_missing"
    ) {
      return
    }

    throw error
  }
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  return getSubscriptionItemCurrentPeriodEnd(subscription) ?? Date.now()
}

async function createCustomerSessionClientSecret(args: {
  customerId: string
  stripe: Stripe
}) {
  try {
    const customerSession = await args.stripe.customerSessions.create({
      components: {
        payment_element: {
          enabled: true,
          features: {
            payment_method_redisplay: "enabled",
            payment_method_remove: "enabled",
            payment_method_save: "enabled",
            payment_method_save_usage: "off_session",
          },
        },
      },
      customer: args.customerId,
    })

    return customerSession.client_secret ?? undefined
  } catch (error) {
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripePermissionError
    ) {
      return undefined
    }

    throw error
  }
}

export const syncBillingCenter = action({
  args: {},
  handler: async (ctx) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const customerId =
        userContext.customer?.stripeCustomerId ??
        (userContext.metadataStripeCustomerId
          ? await ensureStripeCustomer({
              ctx,
              email: userContext.email,
              stripe,
              userContext,
            })
          : undefined)

      if (!customerId) {
        return {
          hasCustomer: false,
          syncedAt: Date.now(),
        }
      }

      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
        syncInvoices: false,
      })

      const subscriptions = await listStripeSubscriptionsForCustomer({
        customerId,
        stripe,
      })

      for (const subscription of subscriptions) {
        const expandedSubscription = await getExpandedSubscription({
          stripe,
          subscriptionId: subscription.id,
        })

        await reconcileStripeSubscription({
          ctx,
          stripe,
          subscription: expandedSubscription,
        })
      }
      await ctx.runMutation(
        internal.mutations.billing.state.deleteBillingSubscriptionsMissingFromSync,
        {
          stripeCustomerId: customerId,
          stripeSubscriptionIds: subscriptions.map((subscription) => subscription.id),
          userId: userContext.user._id,
        }
      )

      await syncBillingInvoicesForCustomer({
        ctx,
        stripe,
        stripeCustomerId: customerId,
      })

      return {
        hasCustomer: true,
        syncedAt: Date.now(),
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const updateBillingProfile = action({
  args: {
    address: v.optional(billingProfileAddressValidator),
    businessName: v.optional(v.string()),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const customerId = await ensureStripeCustomer({
        ctx,
        email: normalizeOptionalString(args.email) ?? userContext.email,
        stripe,
        userContext,
      })

      await stripe.customers.update(customerId, {
        address: buildStripeAddress(args.address),
        business_name: toStripeEmptyableString(args.businessName),
        email: toStripeEmptyableString(args.email),
        name: toStripeEmptyableString(args.name),
        phone: toStripeEmptyableString(args.phone),
      })

      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
        syncInvoices: false,
      })

      await recordBillingAuditLog({
        action: "billing.profile.updated",
        ctx,
        details: JSON.stringify(
          {
            addressUpdated: !!args.address,
            businessName: normalizeOptionalString(args.businessName) ?? null,
            email: normalizeOptionalString(args.email) ?? null,
            phone: normalizeOptionalString(args.phone) ?? null,
          },
          null,
          2
        ),
        entityId: customerId,
        entityLabel:
          normalizeOptionalString(args.name) ?? userContext.actorName,
        result: "success",
        summary: "Updated the billing profile.",
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        updated: true,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const createPaymentMethodSetupIntent = action({
  args: {},
  handler: async (ctx) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const customerId = await ensureStripeCustomer({
        ctx,
        email: userContext.email,
        stripe,
        userContext,
      })
      const setupIntent = await stripe.setupIntents.create({
        automatic_payment_methods: {
          enabled: true,
        },
        customer: customerId,
        metadata: {
          app: STRIPE_CATALOG_APP,
          clerkUserId: userContext.user.clerkUserId,
          userId: userContext.user._id,
        },
        usage: "off_session",
      })

      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
        syncInvoices: false,
      })

      if (!setupIntent.client_secret) {
        throw new BillingActionError(
          "missing_client_secret",
          "Stripe did not return a setup client secret.",
          502
        )
      }

      return {
        clientSecret: setupIntent.client_secret,
        secretType: "setup_intent" as const,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const setDefaultPaymentMethod = action({
  args: {
    paymentMethodId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const customerId = await ensureStripeCustomer({
        ctx,
        email: userContext.email,
        stripe,
        userContext,
      })
      const paymentMethods = await stripe.customers.listPaymentMethods(
        customerId,
        {
          limit: 24,
        }
      )
      const targetPaymentMethod = paymentMethods.data.find(
        (paymentMethod) => paymentMethod.id === args.paymentMethodId
      )

      if (!targetPaymentMethod) {
        throw new BillingActionError(
          "payment_method_not_found",
          "That payment method is not attached to this billing account.",
          404
        )
      }

      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: targetPaymentMethod.id,
        },
      })

      const subscriptions = await listStripeSubscriptionsForCustomer({
        customerId,
        stripe,
      })

      for (const subscription of subscriptions) {
        if (
          subscription.status === "canceled" ||
          subscription.status === "incomplete_expired"
        ) {
          continue
        }

        const updatedSubscription = await stripe.subscriptions.update(
          subscription.id,
          {
            default_payment_method: targetPaymentMethod.id,
            expand: [
              "customer",
              "default_payment_method",
              "items.data.price.product",
              "latest_invoice.confirmation_secret",
              "latest_invoice.payment_intent",
              "pending_setup_intent",
              "schedule",
            ],
          }
        )

        await reconcileStripeSubscription({
          ctx,
          stripe,
          subscription: updatedSubscription,
        })
      }

      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
        syncInvoices: false,
      })

      await recordBillingAuditLog({
        action: "billing.payment_method.default_updated",
        ctx,
        entityId: targetPaymentMethod.id,
        entityLabel:
          targetPaymentMethod.card?.brand ?? targetPaymentMethod.type,
        result: "success",
        summary: "Updated the default payment method.",
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        defaultPaymentMethodId: targetPaymentMethod.id,
        updated: true,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const removePaymentMethod = action({
  args: {
    paymentMethodId: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const customerId = await ensureStripeCustomer({
        ctx,
        email: userContext.email,
        stripe,
        userContext,
      })
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ["invoice_settings.default_payment_method"],
      })

      if ("deleted" in customer && customer.deleted) {
        throw new BillingActionError(
          "customer_deleted",
          "This billing customer is no longer available in Stripe.",
          409
        )
      }

      const paymentMethods = await stripe.customers.listPaymentMethods(
        customerId,
        {
          limit: 24,
        }
      )
      const targetPaymentMethod = paymentMethods.data.find(
        (paymentMethod) => paymentMethod.id === args.paymentMethodId
      )

      if (!targetPaymentMethod) {
        throw new BillingActionError(
          "payment_method_not_found",
          "That payment method is not attached to this billing account.",
          404
        )
      }

      const defaultPaymentMethodId =
        typeof customer.invoice_settings.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings.default_payment_method?.id

      if (defaultPaymentMethodId === targetPaymentMethod.id) {
        throw new BillingActionError(
          "payment_method_in_use",
          "Select another default payment method before removing this one.",
          409
        )
      }

      const subscriptions = await listStripeSubscriptionsForCustomer({
        customerId,
        stripe,
      })
      const attachedSubscription = subscriptions.find((subscription) => {
        if (
          subscription.status === "canceled" ||
          subscription.status === "incomplete_expired"
        ) {
          return false
        }

        return (
          (typeof subscription.default_payment_method === "string"
            ? subscription.default_payment_method
            : subscription.default_payment_method?.id) ===
          targetPaymentMethod.id
        )
      })

      if (attachedSubscription) {
        throw new BillingActionError(
          "payment_method_in_use",
          "This payment method is still assigned to a subscription. Set another default first.",
          409
        )
      }

      await stripe.paymentMethods.detach(targetPaymentMethod.id)

      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
        syncInvoices: false,
      })

      await recordBillingAuditLog({
        action: "billing.payment_method.removed",
        ctx,
        entityId: targetPaymentMethod.id,
        entityLabel:
          targetPaymentMethod.card?.brand ?? targetPaymentMethod.type,
        result: "warning",
        summary: "Removed a saved payment method.",
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        removed: true,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

async function voidOrDeleteInvoiceIfPending(args: {
  invoice: string | Stripe.Invoice | null | undefined
  stripe: Stripe
}) {
  const expandedInvoice = getExpandedStripeInvoice(args.invoice)
  const invoiceId =
    expandedInvoice?.id ??
    (typeof args.invoice === "string" ? args.invoice : undefined)

  if (!invoiceId) {
    return false
  }

  const invoice =
    expandedInvoice ?? (await args.stripe.invoices.retrieve(invoiceId))

  if (invoice.status === "draft") {
    await args.stripe.invoices.del(invoice.id)
    return true
  }

  if (invoice.status === "open") {
    await args.stripe.invoices.voidInvoice(invoice.id)
    return true
  }

  return false
}

async function clearPendingInvoicesForSubscription(args: {
  stripe: Stripe
  subscriptionId: string
}) {
  let invoiceWasCleared = false
  const invoices = await args.stripe.invoices.list({
    limit: 12,
    subscription: args.subscriptionId,
  })

  for (const invoice of invoices.data) {
    if (invoice.status === "draft") {
      await args.stripe.invoices.del(invoice.id)
      invoiceWasCleared = true
      continue
    }

    if (invoice.status === "open") {
      await args.stripe.invoices.voidInvoice(invoice.id)
      invoiceWasCleared = true
    }
  }

  return invoiceWasCleared
}

async function cancelIncompleteSubscription(args: {
  ctx: PublicActionCtx
  reason: "checkout_abandoned" | "replaced_before_confirmation"
  stripe: Stripe
  subscription: Stripe.Subscription
  userContext: Awaited<ReturnType<typeof requireBillingUser>>
}) {
  const cancelledSubscription = await args.stripe.subscriptions.cancel(
    args.subscription.id,
    {
      invoice_now: false,
      prorate: false,
    }
  )
  const expandedCancelledSubscription = await getExpandedSubscription({
    stripe: args.stripe,
    subscriptionId: cancelledSubscription.id,
  })
  const latestInvoiceWasCleared = await voidOrDeleteInvoiceIfPending({
    invoice: expandedCancelledSubscription.latest_invoice,
    stripe: args.stripe,
  })
  const relatedInvoicesWereCleared = await clearPendingInvoicesForSubscription({
    stripe: args.stripe,
    subscriptionId: expandedCancelledSubscription.id,
  })
  const invoiceWasCleared =
    latestInvoiceWasCleared || relatedInvoicesWereCleared

  await reconcileStripeSubscription({
    ctx: args.ctx,
    stripe: args.stripe,
    subscription: expandedCancelledSubscription,
  })

  await recordBillingAuditLog({
    action: "billing.checkout.abandoned",
    ctx: args.ctx,
    details: JSON.stringify(
      {
        invoiceWasCleared,
        reason: args.reason,
        stripeSubscriptionId: expandedCancelledSubscription.id,
      },
      null,
      2
    ),
    entityId: expandedCancelledSubscription.id,
    entityLabel: expandedCancelledSubscription.metadata.planKey ?? undefined,
    result: "warning",
    summary:
      args.reason === "checkout_abandoned"
        ? "Abandoned checkout before payment confirmation."
        : "Replaced an incomplete checkout with a new selection before confirmation.",
    user: args.userContext.user,
    userName: args.userContext.actorName,
  })

  return {
    invoiceWasCleared,
    subscription: expandedCancelledSubscription,
  }
}

export const createSubscriptionIntent = action({
  args: {
    attemptKey: v.optional(v.string()),
    interval: billingIntervalValidator,
    planKey: v.string(),
  },
  handler: async (ctx, args) => {
    try {
      await assertCheckoutEnabled(ctx)

      const userContext = await requireBillingUser(ctx)
      const stripe = getStripe()
      const { plan, priceId } = await getPurchasablePlan({
        ctx,
        interval: args.interval,
        planKey: args.planKey,
      })
      const customerId = await ensureStripeCustomer({
        ctx,
        email: userContext.email,
        stripe,
        userContext,
      })
      const customerSessionClientSecret =
        await createCustomerSessionClientSecret({
          customerId,
          stripe,
        })
      const existingSubscription = await getExistingStripeSubscription({
        customerId,
        stripe,
      })

      if (
        existingSubscription &&
        !["canceled", "incomplete_expired", "unpaid"].includes(
          existingSubscription.status
        )
      ) {
        const expandedSubscription = await getExpandedSubscription({
          stripe,
          subscriptionId: existingSubscription.id,
        })
        const currentPriceId =
          getStripeSubscriptionItem(expandedSubscription).price.id

        if (
          expandedSubscription.status === "incomplete" &&
          currentPriceId === priceId &&
          getStripeSubscriptionInterval(expandedSubscription) === args.interval
        ) {
          await reconcileStripeSubscription({
            ctx,
            stripe,
            subscription: expandedSubscription,
          })
          await syncCustomerBillingSnapshot({
            ctx,
            stripe,
            stripeCustomerId: customerId,
          })

          const confirmationPayload =
            getConfirmationPayload(expandedSubscription)

          return {
            alreadyExists: true,
            clientSecret: confirmationPayload.clientSecret,
            customerSessionClientSecret,
            defaultBillingEmail: userContext.email,
            interval: args.interval,
            planKey: plan.key,
            requiresConfirmation:
              confirmationPayload.clientSecret !== undefined,
            secretType: confirmationPayload.secretType,
            status: expandedSubscription.status,
          }
        }

        if (expandedSubscription.status === "incomplete") {
          await cancelIncompleteSubscription({
            ctx,
            reason: "replaced_before_confirmation",
            stripe,
            subscription: expandedSubscription,
            userContext,
          })
          await syncCustomerBillingSnapshot({
            ctx,
            stripe,
            stripeCustomerId: customerId,
          })
        } else {
          throw new BillingActionError(
            "existing_subscription",
            "You already have a subscription in progress or on file. Manage it from billing settings.",
            409
          )
        }
      }

      const subscription = await stripe.subscriptions.create(
        {
          collection_method: "charge_automatically",
          customer: customerId,
          expand: [
            "customer",
            "default_payment_method",
            "items.data.price.product",
            "latest_invoice.confirmation_secret",
            "latest_invoice.payment_intent",
            "pending_setup_intent",
            "schedule",
          ],
          items: [{ price: priceId, quantity: 1 }],
          metadata: {
            app: STRIPE_CATALOG_APP,
            billingInterval: args.interval,
            clerkUserId: userContext.user.clerkUserId,
            planKey: plan.key,
            userId: userContext.user._id,
          },
          payment_behavior: "default_incomplete",
          payment_settings: {
            save_default_payment_method: "on_subscription",
          },
        },
        {
          idempotencyKey: [
            "billing",
            "create",
            userContext.user._id,
            plan.key,
            args.interval,
            args.attemptKey ?? "default",
          ].join(":"),
        }
      )

      await reconcileStripeSubscription({
        ctx,
        stripe,
        subscription,
      })
      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
      })

      const confirmationPayload = getConfirmationPayload(subscription)

      await recordBillingAuditLog({
        action: "billing.checkout.started",
        ctx,
        details: JSON.stringify(
          {
            interval: args.interval,
            planKey: plan.key,
          },
          null,
          2
        ),
        entityId: `${userContext.user._id}:${plan.key}:${args.interval}`,
        entityLabel: plan.name,
        result: "success",
        summary: `Started checkout for ${plan.name} (${args.interval}).`,
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        alreadyExists: false,
        clientSecret: confirmationPayload.clientSecret,
        customerSessionClientSecret,
        defaultBillingEmail: userContext.email,
        interval: args.interval,
        planKey: plan.key,
        requiresConfirmation: confirmationPayload.clientSecret !== undefined,
        secretType: confirmationPayload.secretType,
        status: subscription.status,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const abandonPendingCheckout = action({
  args: {},
  handler: async (ctx) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const customerId =
        userContext.customer?.stripeCustomerId ??
        userContext.metadataStripeCustomerId

      if (!customerId) {
        return {
          abandoned: false,
        }
      }

      const stripe = getStripe()
      const existingSubscription = await getExistingStripeSubscription({
        customerId,
        stripe,
      })

      if (
        !existingSubscription ||
        existingSubscription.status !== "incomplete"
      ) {
        return {
          abandoned: false,
        }
      }

      const expandedSubscription = await getExpandedSubscription({
        stripe,
        subscriptionId: existingSubscription.id,
      })

      if (expandedSubscription.status !== "incomplete") {
        await reconcileStripeSubscription({
          ctx,
          stripe,
          subscription: expandedSubscription,
        })

        return {
          abandoned: false,
        }
      }

      const result = await cancelIncompleteSubscription({
        ctx,
        reason: "checkout_abandoned",
        stripe,
        subscription: expandedSubscription,
        userContext,
      })
      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: customerId,
      })

      return {
        abandoned: true,
        invoiceWasCleared: result.invoiceWasCleared,
        status: result.subscription.status,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const previewSubscriptionChange = action({
  args: {
    interval: billingIntervalValidator,
    planKey: v.string(),
    prorationDate: v.optional(v.number()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const targetSubscription = await getTargetSubscription({
        ctx,
        stripeSubscriptionId: args.stripeSubscriptionId,
        userContext,
      })

      const currentPlan = await ctx.runQuery(
        internal.queries.billing.internal.getPlanByKey,
        {
          planKey: targetSubscription.planKey,
        }
      )

      if (!currentPlan) {
        throw new BillingActionError(
          "missing_current_plan",
          "The current billing plan could not be resolved.",
          409
        )
      }

      if (args.planKey === "free") {
        return {
          amountDueNow: 0,
          creditApplied: 0,
          currentAmount: getPlanAmount(
            currentPlan,
            targetSubscription.interval
          ),
          currentInterval: targetSubscription.interval,
          currentPlanKey: currentPlan.key,
          effectiveAt: targetSubscription.currentPeriodEnd ?? null,
          interval: "month" as const,
          mode: "cancel_at_period_end" as const,
          planKey: "free",
          prorationBehavior: "none" as const,
          prorationDate: null,
          proratedCharge: 0,
          summary:
            "This downgrade will move the account back to free access at the end of the current paid period. Paid features stay active until then and Stripe will not issue a refund.",
          targetAmount: 0,
        }
      }

      const { plan: targetPlan, priceId } = await getPurchasablePlan({
        ctx,
        interval: args.interval,
        planKey: args.planKey,
      })
      const changeKind = classifyPlanChange({
        currentInterval: targetSubscription.interval,
        currentPlan,
        targetInterval: args.interval,
        targetPlan,
      })

      if (changeKind === "noop") {
        return {
          amountDueNow: 0,
          creditApplied: 0,
          currentAmount: getPlanAmount(
            currentPlan,
            targetSubscription.interval
          ),
          currentInterval: targetSubscription.interval,
          currentPlanKey: currentPlan.key,
          effectiveAt: null,
          interval: args.interval,
          mode: "noop" as const,
          planKey: targetPlan.key,
          prorationBehavior: "none" as const,
          prorationDate: null,
          proratedCharge: 0,
          summary: "That plan and billing interval is already active.",
          targetAmount: getPlanAmount(targetPlan, args.interval),
        }
      }

      if (changeKind === "downgrade_later" || changeKind === "switch_later") {
        return {
          amountDueNow: 0,
          creditApplied: 0,
          currentAmount: getPlanAmount(
            currentPlan,
            targetSubscription.interval
          ),
          currentInterval: targetSubscription.interval,
          currentPlanKey: currentPlan.key,
          effectiveAt: targetSubscription.currentPeriodEnd ?? null,
          interval: args.interval,
          mode: "scheduled_change" as const,
          planKey: targetPlan.key,
          prorationBehavior: "none" as const,
          prorationDate: null,
          proratedCharge: 0,
          summary:
            "This downgrade will take effect at the next renewal. Existing access and pricing stay in place until the current billing period ends, and the lower price starts on the next payment.",
          targetAmount: getPlanAmount(targetPlan, args.interval),
        }
      }

      const stripe = getStripe()
      const prorationDate = args.prorationDate ?? Math.floor(Date.now() / 1000)
      const preview = await stripe.invoices.createPreview({
        customer: targetSubscription.stripeCustomerId,
        subscription: targetSubscription.stripeSubscriptionId,
        subscription_details: {
          items: targetSubscription.stripeSubscriptionItemId
            ? [
                {
                  id: targetSubscription.stripeSubscriptionItemId,
                  price: priceId,
                  quantity: 1,
                },
              ]
            : [
                {
                  price: priceId,
                  quantity: 1,
                },
              ],
          proration_date: prorationDate,
          proration_behavior: "always_invoice",
        },
      })
      const prorationBreakdown = getPreviewProrationBreakdown({
        invoice: preview,
        prorationDate,
      })

      return {
        amountDueNow: preview.amount_due,
        creditApplied: prorationBreakdown.creditApplied,
        currentAmount: getPlanAmount(currentPlan, targetSubscription.interval),
        currentInterval: targetSubscription.interval,
        currentPlanKey: currentPlan.key,
        effectiveAt: Date.now(),
        interval: args.interval,
        mode: "immediate_change" as const,
        planKey: targetPlan.key,
        prorationBehavior: "always_invoice" as const,
        prorationDate,
        proratedCharge: prorationBreakdown.proratedCharge,
        summary:
          prorationBreakdown.creditApplied > 0
            ? "This upgrade takes effect immediately. Stripe applied credit for the unused time on the current plan and reduced what is due today."
            : "This upgrade takes effect immediately. Stripe will create the change invoice right away.",
        targetAmount: getPlanAmount(targetPlan, args.interval),
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const changeSubscriptionPlan = action({
  args: {
    interval: billingIntervalValidator,
    planKey: v.string(),
    prorationDate: v.optional(v.number()),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await assertCheckoutEnabled(ctx)

      const userContext = await requireBillingUser(ctx)
      const targetSubscription = await getTargetSubscription({
        ctx,
        stripeSubscriptionId: args.stripeSubscriptionId,
        userContext,
      })

      const currentPlan = await ctx.runQuery(
        internal.queries.billing.internal.getPlanByKey,
        {
          planKey: targetSubscription.planKey,
        }
      )

      if (!currentPlan) {
        throw new BillingActionError(
          "missing_current_plan",
          "The current billing plan could not be resolved.",
          409
        )
      }

      const stripe = getStripe()
      const currentSubscription = await getExpandedSubscription({
        stripe,
        subscriptionId: targetSubscription.stripeSubscriptionId,
      })

      if (args.planKey === "free") {
        const updatedSubscription = await stripe.subscriptions.update(
          currentSubscription.id,
          {
            cancel_at_period_end: true,
          }
        )
        const expandedUpdatedSubscription = await getExpandedSubscription({
          stripe,
          subscriptionId: updatedSubscription.id,
        })

        await reconcileStripeSubscription({
          ctx,
          stripe,
          subscription: expandedUpdatedSubscription,
        })

        await ctx.runMutation(
          internal.mutations.billing.state.setSubscriptionScheduledChange,
          {
            scheduledChangeAt: getSubscriptionCurrentPeriodEnd(
              expandedUpdatedSubscription
            ),
            scheduledChangeRequestedAt: Date.now(),
            scheduledChangeType: "cancel",
            stripeSubscriptionId: expandedUpdatedSubscription.id,
          }
        )
        await syncCustomerBillingSnapshot({
          ctx,
          stripe,
          stripeCustomerId: targetSubscription.stripeCustomerId,
        })

        await recordBillingAuditLog({
          action: "billing.subscription.cancel_scheduled",
          ctx,
          details: JSON.stringify(
            {
              effectiveAt: getSubscriptionCurrentPeriodEnd(
                expandedUpdatedSubscription
              ),
            },
            null,
            2
          ),
          entityId: expandedUpdatedSubscription.id,
          entityLabel: currentPlan.name,
          result: "success",
          summary: `Scheduled cancellation for ${currentPlan.name}.`,
          user: userContext.user,
          userName: userContext.actorName,
        })

        return {
          effectiveAt: getSubscriptionCurrentPeriodEnd(
            expandedUpdatedSubscription
          ),
          mode: "cancel_at_period_end" as const,
          requiresConfirmation: false,
        }
      }

      const { plan: targetPlan, priceId } = await getPurchasablePlan({
        ctx,
        interval: args.interval,
        planKey: args.planKey,
      })
      const changeKind = classifyPlanChange({
        currentInterval: targetSubscription.interval,
        currentPlan,
        targetInterval: args.interval,
        targetPlan,
      })

      if (changeKind === "noop") {
        throw new BillingActionError(
          "noop_change",
          "That plan is already active.",
          409
        )
      }

      if (changeKind === "downgrade_later" || changeKind === "switch_later") {
        await releaseExistingSchedule(currentSubscription, stripe)

        const currentItem = getStripeSubscriptionItem(currentSubscription)
        const schedule = await stripe.subscriptionSchedules.create({
          from_subscription: currentSubscription.id,
        })
        const updatedSchedule = await stripe.subscriptionSchedules.update(
          schedule.id,
          {
            end_behavior: "release",
            phases: [
              {
                end_date: currentItem.current_period_end,
                items: [
                  {
                    price: currentItem.price.id,
                    quantity: currentItem.quantity ?? 1,
                  },
                ],
                start_date: "now",
              },
              {
                items: [
                  {
                    price: priceId,
                    quantity: 1,
                  },
                ],
                proration_behavior: "none",
                start_date:
                  getStripeSubscriptionItem(currentSubscription)
                    .current_period_end,
              },
            ],
          }
        )

        await ctx.runMutation(
          internal.mutations.billing.state.setSubscriptionScheduledChange,
          {
            scheduledChangeAt:
              getSubscriptionCurrentPeriodEnd(currentSubscription),
            scheduledChangeRequestedAt: Date.now(),
            scheduledChangeType: "plan_change",
            scheduledInterval: args.interval,
            scheduledPlanKey: targetPlan.key,
            stripeScheduleId: updatedSchedule.id,
            stripeSubscriptionId: currentSubscription.id,
          }
        )

        await recordBillingAuditLog({
          action: "billing.subscription.plan_change_scheduled",
          ctx,
          details: JSON.stringify(
            {
              effectiveAt: getSubscriptionCurrentPeriodEnd(currentSubscription),
              interval: args.interval,
              nextPlanKey: targetPlan.key,
            },
            null,
            2
          ),
          entityId: currentSubscription.id,
          entityLabel: `${currentPlan.name} -> ${targetPlan.name}`,
          result: "success",
          summary: `Scheduled ${targetPlan.name} (${args.interval}) for the next renewal.`,
          user: userContext.user,
          userName: userContext.actorName,
        })

        return {
          effectiveAt: getSubscriptionCurrentPeriodEnd(currentSubscription),
          mode: "scheduled_change" as const,
          requiresConfirmation: false,
        }
      }

      await releaseExistingSchedule(currentSubscription, stripe)

      const updatedSubscription = await stripe.subscriptions.update(
        currentSubscription.id,
        {
          cancel_at_period_end: false,
          expand: [
            "customer",
            "default_payment_method",
            "items.data.price.product",
            "latest_invoice.confirmation_secret",
            "latest_invoice.payment_intent",
            "pending_setup_intent",
            "schedule",
          ],
          items: [
            {
              id: getStripeSubscriptionItem(currentSubscription).id,
              price: priceId,
              quantity: 1,
            },
          ],
          payment_behavior: "pending_if_incomplete",
          proration_date: args.prorationDate,
          proration_behavior: "always_invoice",
        }
      )

      await reconcileStripeSubscription({
        ctx,
        stripe,
        subscription: updatedSubscription,
      })
      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: targetSubscription.stripeCustomerId,
      })
      await ctx.runMutation(
        internal.mutations.billing.state.clearSubscriptionScheduledChange,
        {
          stripeSubscriptionId: updatedSubscription.id,
        }
      )

      const confirmationPayload = getConfirmationPayload(updatedSubscription)

      await recordBillingAuditLog({
        action: "billing.subscription.plan_changed",
        ctx,
        details: JSON.stringify(
          {
            interval: args.interval,
            nextPlanKey: targetPlan.key,
            requiresConfirmation:
              confirmationPayload.clientSecret !== undefined,
          },
          null,
          2
        ),
        entityId: updatedSubscription.id,
        entityLabel: `${currentPlan.name} -> ${targetPlan.name}`,
        result: "success",
        summary: `Updated subscription to ${targetPlan.name} (${args.interval}).`,
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        clientSecret: confirmationPayload.clientSecret,
        effectiveAt: Date.now(),
        mode: "immediate_change" as const,
        requiresConfirmation: confirmationPayload.clientSecret !== undefined,
        secretType: confirmationPayload.secretType,
        status: updatedSubscription.status,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const cancelCurrentSubscription = action({
  args: {
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const userContext = await requireBillingUser(ctx)
      const targetSubscription = await getTargetSubscription({
        ctx,
        stripeSubscriptionId: args.stripeSubscriptionId,
        userContext,
      })

      const stripe = getStripe()
      const updatedSubscription = await stripe.subscriptions.update(
        targetSubscription.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
        }
      )
      const expandedUpdatedSubscription = await getExpandedSubscription({
        stripe,
        subscriptionId: updatedSubscription.id,
      })

      await reconcileStripeSubscription({
        ctx,
        stripe,
        subscription: expandedUpdatedSubscription,
      })

      await ctx.runMutation(
        internal.mutations.billing.state.setSubscriptionScheduledChange,
        {
          scheduledChangeAt: getSubscriptionCurrentPeriodEnd(
            expandedUpdatedSubscription
          ),
          scheduledChangeRequestedAt: Date.now(),
          scheduledChangeType: "cancel",
          stripeSubscriptionId: expandedUpdatedSubscription.id,
        }
      )
      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: targetSubscription.stripeCustomerId,
      })

      await recordBillingAuditLog({
        action: "billing.subscription.cancel_scheduled",
        ctx,
        details: JSON.stringify(
          {
            effectiveAt: getSubscriptionCurrentPeriodEnd(
              expandedUpdatedSubscription
            ),
          },
          null,
          2
        ),
        entityId: expandedUpdatedSubscription.id,
        entityLabel: targetSubscription.planKey,
        result: "success",
        summary: "Scheduled subscription cancellation at period end.",
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        effectiveAt: getSubscriptionCurrentPeriodEnd(
          expandedUpdatedSubscription
        ),
        mode: "cancel_at_period_end" as const,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})

export const reactivateCurrentSubscription = action({
  args: {
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      await assertCheckoutEnabled(ctx)

      const userContext = await requireBillingUser(ctx)
      const targetSubscription = await getTargetSubscription({
        ctx,
        stripeSubscriptionId: args.stripeSubscriptionId,
        userContext,
      })

      const stripe = getStripe()
      const currentSubscription = await getExpandedSubscription({
        stripe,
        subscriptionId: targetSubscription.stripeSubscriptionId,
      })

      await releaseExistingSchedule(currentSubscription, stripe)

      const updatedSubscription = await stripe.subscriptions.update(
        currentSubscription.id,
        {
          cancel_at_period_end: false,
          expand: [
            "customer",
            "default_payment_method",
            "items.data.price.product",
            "latest_invoice.confirmation_secret",
            "latest_invoice.payment_intent",
            "pending_setup_intent",
            "schedule",
          ],
        }
      )

      await reconcileStripeSubscription({
        ctx,
        stripe,
        subscription: updatedSubscription,
      })
      await syncCustomerBillingSnapshot({
        ctx,
        stripe,
        stripeCustomerId: targetSubscription.stripeCustomerId,
      })
      await ctx.runMutation(
        internal.mutations.billing.state.clearSubscriptionScheduledChange,
        {
          stripeSubscriptionId: updatedSubscription.id,
        }
      )

      await recordBillingAuditLog({
        action: "billing.subscription.reactivated",
        ctx,
        entityId: updatedSubscription.id,
        entityLabel: targetSubscription.planKey,
        result: "success",
        summary: "Reactivated the current subscription.",
        user: userContext.user,
        userName: userContext.actorName,
      })

      return {
        mode: "reactivated" as const,
        status: updatedSubscription.status,
      }
    } catch (error) {
      throw sanitizeBillingError(error)
    }
  },
})
