import type { Doc } from "../../_generated/dataModel"
import { query } from "../../_generated/server"
import { isManageableSubscriptionStatus } from "../../lib/billing"

type BillingCustomerRecord = Doc<"billingCustomers">
type BillingInvoiceRecord = Doc<"billingInvoices">
type BillingPaymentMethodRecord = Doc<"billingPaymentMethods">
type BillingPlanRecord = Doc<"billingPlans">
type BillingSubscriptionRecord = Doc<"billingSubscriptions">

function getSubscriptionPriority(subscription: BillingSubscriptionRecord) {
  switch (subscription.status) {
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

function normalizeAddress(
  address: BillingCustomerRecord["billingAddress"] | BillingPaymentMethodRecord["billingAddress"]
) {
  if (!address) {
    return null
  }

  if (
    !address.line1 &&
    !address.line2 &&
    !address.city &&
    !address.state &&
    !address.postalCode &&
    !address.country
  ) {
    return null
  }

  return address
}

function isManageableSubscription(
  subscription: BillingSubscriptionRecord,
  now: number
) {
  if (isManageableSubscriptionStatus(subscription.status)) {
    return true
  }

  return (
    subscription.status === "canceled" &&
    (subscription.currentPeriodEnd ?? subscription.endedAt ?? 0) > now
  )
}

function sortSubscriptions(
  left: BillingSubscriptionRecord,
  right: BillingSubscriptionRecord
) {
  const priorityDifference =
    getSubscriptionPriority(right) - getSubscriptionPriority(left)

  if (priorityDifference !== 0) {
    return priorityDifference
  }

  if ((right.updatedAt ?? 0) !== (left.updatedAt ?? 0)) {
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  }

  return right._creationTime - left._creationTime
}

function sortPaymentMethods(
  left: BillingPaymentMethodRecord,
  right: BillingPaymentMethodRecord
) {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1
  }

  if ((right.updatedAt ?? 0) !== (left.updatedAt ?? 0)) {
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  }

  return right._creationTime - left._creationTime
}

function sortInvoices(left: BillingInvoiceRecord, right: BillingInvoiceRecord) {
  if (right.invoiceIssuedAt !== left.invoiceIssuedAt) {
    return right.invoiceIssuedAt - left.invoiceIssuedAt
  }

  if ((right.updatedAt ?? 0) !== (left.updatedAt ?? 0)) {
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  }

  return right._creationTime - left._creationTime
}

function getSubscriptionAmount(
  plan: BillingPlanRecord | null,
  interval: BillingSubscriptionRecord["interval"]
) {
  if (!plan || plan.planType !== "paid") {
    return null
  }

  return interval === "year" ? plan.yearlyPriceAmount : plan.monthlyPriceAmount
}

export const getCurrentUserBillingCenter = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      return null
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (query) => query.eq("clerkUserId", identity.subject))
      .unique()

    if (!user) {
      return null
    }

    const now = Date.now()
    const [customer, invoices, paymentMethods, plans, subscriptions] = await Promise.all([
      ctx.db
        .query("billingCustomers")
        .withIndex("by_userId", (query) => query.eq("userId", user._id))
        .unique(),
      ctx.db
        .query("billingInvoices")
        .withIndex("by_userId", (query) => query.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("billingPaymentMethods")
        .withIndex("by_userId", (query) => query.eq("userId", user._id))
        .collect(),
      ctx.db.query("billingPlans").collect(),
      ctx.db
        .query("billingSubscriptions")
        .withIndex("by_userId", (query) => query.eq("userId", user._id))
        .collect(),
    ])

    const activePaymentMethods = paymentMethods
      .filter((paymentMethod) => paymentMethod.active)
      .sort(sortPaymentMethods)
    const plansByKey = new Map(plans.map((plan) => [plan.key, plan]))
    const paymentMethodsById = new Map(
      activePaymentMethods.map((paymentMethod) => [
        paymentMethod.stripePaymentMethodId,
        paymentMethod,
      ])
    )
    const sortedSubscriptions = [...subscriptions].sort(sortSubscriptions)
    const visibleSubscriptions = sortedSubscriptions.filter((subscription) =>
      isManageableSubscription(subscription, now)
    )
    const manageableSubscriptionExists = visibleSubscriptions.length > 0
    const visibleInvoices = [...invoices]
      .filter((invoice) => invoice.status !== "draft" && invoice.status !== "void")
      .sort(sortInvoices)

    const lastSyncedAtCandidates = [
      customer?.lastSyncedAt ?? 0,
      ...activePaymentMethods.map((paymentMethod) => paymentMethod.updatedAt ?? 0),
      ...visibleInvoices.map((invoice) => invoice.updatedAt ?? 0),
      ...sortedSubscriptions.map((subscription) => subscription.updatedAt ?? 0),
    ]
    const lastSyncedAt = Math.max(...lastSyncedAtCandidates)

    return {
      billingProfile: {
        address: normalizeAddress(customer?.billingAddress),
        businessName: customer?.businessName ?? null,
        canEdit: true,
        country: customer?.billingAddress?.country ?? null,
        defaultPaymentMethodId: customer?.defaultPaymentMethodId ?? null,
        email: customer?.email ?? null,
        name: customer?.name ?? user.name,
        phone: customer?.phone ?? null,
        stripeCustomerId: customer?.stripeCustomerId ?? null,
        taxExempt: customer?.taxExempt ?? null,
        taxIds: customer?.taxIds ?? [],
      },
      invoices: visibleInvoices.map((invoice) => {
        const relatedSubscription = invoice.stripeSubscriptionId
          ? sortedSubscriptions.find(
              (subscription) =>
                subscription.stripeSubscriptionId === invoice.stripeSubscriptionId
            ) ?? null
          : null
        const relatedPlan = relatedSubscription
          ? plansByKey.get(relatedSubscription.planKey) ?? null
          : null

        return {
          amountDue: invoice.amountDue,
          amountPaid: invoice.amountPaid,
          currency: invoice.currency,
          description: invoice.description,
          hostedInvoiceUrl: invoice.hostedInvoiceUrl ?? null,
          invoiceNumber: invoice.invoiceNumber ?? null,
          invoicePdfUrl: invoice.invoicePdfUrl ?? null,
          issuedAt: invoice.invoiceIssuedAt,
          paymentMethodBrand: invoice.paymentMethodBrand ?? null,
          paymentMethodLast4: invoice.paymentMethodLast4 ?? null,
          paymentMethodType: invoice.paymentMethodType ?? null,
          relatedProductName: relatedPlan?.name ?? null,
          relatedSubscriptionId: invoice.stripeSubscriptionId ?? null,
          status: invoice.status,
          stripeInvoiceId: invoice.stripeInvoiceId,
        }
      }),
      lastSyncedAt: lastSyncedAt > 0 ? lastSyncedAt : null,
      paymentMethods: activePaymentMethods.map((paymentMethod) => ({
        address: normalizeAddress(paymentMethod.billingAddress),
        bankName: paymentMethod.bankName ?? null,
        brand: paymentMethod.brand ?? null,
        cardholderName: paymentMethod.cardholderName ?? null,
        expMonth: paymentMethod.expMonth ?? null,
        expYear: paymentMethod.expYear ?? null,
        isDefault: paymentMethod.isDefault,
        last4: paymentMethod.last4 ?? null,
        stripePaymentMethodId: paymentMethod.stripePaymentMethodId,
        type: paymentMethod.type,
      })),
      portalMode: manageableSubscriptionExists ? "management" : "acquisition",
      subscriptions: visibleSubscriptions.map((subscription) => {
        const plan = plansByKey.get(subscription.planKey) ?? null
        const subscriptionPaymentMethod =
          (subscription.defaultPaymentMethodId
            ? paymentMethodsById.get(subscription.defaultPaymentMethodId)
            : null) ??
          (customer?.defaultPaymentMethodId
            ? paymentMethodsById.get(customer.defaultPaymentMethodId)
            : null) ??
          null

        return {
          amount: getSubscriptionAmount(plan, subscription.interval),
          attentionStatus: subscription.attentionStatus,
          billingInterval: subscription.interval,
          cancelAt: subscription.cancelAt ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          canceledAt: subscription.canceledAt ?? null,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          currentPeriodStart: subscription.currentPeriodStart ?? null,
          currency: plan?.currency ?? null,
          defaultPaymentMethodId:
            subscription.defaultPaymentMethodId ??
            customer?.defaultPaymentMethodId ??
            null,
          defaultPaymentMethodSummary: subscriptionPaymentMethod
            ? {
                brand: subscriptionPaymentMethod.brand ?? null,
                last4: subscriptionPaymentMethod.last4 ?? null,
                type: subscriptionPaymentMethod.type,
              }
            : null,
          endedAt: subscription.endedAt ?? null,
          isManageable: isManageableSubscription(subscription, now),
          planKey: subscription.planKey,
          productName: plan?.name ?? subscription.planKey,
          quantity: subscription.quantity ?? 1,
          scheduledChange:
            subscription.scheduledChangeType && subscription.scheduledChangeAt
              ? {
                  effectiveAt: subscription.scheduledChangeAt,
                  interval: subscription.scheduledInterval ?? null,
                  planKey: subscription.scheduledPlanKey ?? null,
                  planName: subscription.scheduledPlanKey
                    ? (plansByKey.get(subscription.scheduledPlanKey)?.name ?? null)
                    : null,
                  type: subscription.scheduledChangeType,
                }
              : null,
          startedAt: subscription.startedAt ?? null,
          status: subscription.status,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          trialEnd: subscription.trialEnd ?? null,
          trialStart: subscription.trialStart ?? null,
        }
      }),
    }
  },
})
