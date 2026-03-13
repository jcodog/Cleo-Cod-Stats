import Stripe from "stripe"

import { internal } from "../_generated/api"
import {
  deriveAttentionStatus,
  getExpandedStripeCustomer,
  getInvoicePaymentIntentId,
  getStripeInvoiceId,
  getStripePaymentIntentId,
  getStripeProductId,
  getStripeScheduleId,
  getSubscriptionItemCurrentPeriodEnd,
  getSubscriptionItemCurrentPeriodStart,
  getStripeSubscriptionInterval,
  getStripeSubscriptionItem,
  mapStripeSubscriptionStatus,
  mapSubscriptionScheduleChange,
} from "./billingStripe"

type BillingLifecycleCtx = {
  runMutation: (reference: any, args: any) => Promise<any>
  runQuery: (reference: any, args: any) => Promise<any>
}

async function getStripeCustomerIfAvailable(args: {
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
  stripe: Stripe
}) {
  const expandedCustomer = getExpandedStripeCustomer(args.customer)

  if (expandedCustomer) {
    return expandedCustomer
  }

  if (!args.customer || typeof args.customer !== "string") {
    return null
  }

  const customer = await args.stripe.customers.retrieve(args.customer)

  if ("deleted" in customer && customer.deleted) {
    return null
  }

  return customer
}

function getStripeDefaultPaymentMethodId(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined
) {
  if (!paymentMethod) {
    return undefined
  }

  return typeof paymentMethod === "string" ? paymentMethod : paymentMethod.id
}

function normalizeBillingAddress(address: Stripe.Address | null | undefined) {
  if (!address) {
    return undefined
  }

  return {
    city: address.city ?? undefined,
    country: address.country ?? undefined,
    line1: address.line1 ?? undefined,
    line2: address.line2 ?? undefined,
    postalCode: address.postal_code ?? undefined,
    state: address.state ?? undefined,
  }
}

function getStripeCustomerBusinessName(customer: Stripe.Customer | null) {
  if (!customer) {
    return undefined
  }

  return customer.business_name ?? undefined
}

function getStripeCustomerPhone(customer: Stripe.Customer | null) {
  if (!customer) {
    return undefined
  }

  return customer.phone ?? undefined
}

async function listStripeCustomerTaxIds(args: {
  stripe: Stripe
  stripeCustomerId: string
}) {
  const taxIds = await args.stripe.customers.listTaxIds(args.stripeCustomerId, {
    limit: 20,
  })

  return [...taxIds.data]
    .map((taxId) => ({
      country: taxId.country ?? undefined,
      stripeTaxIdId: taxId.id,
      type: taxId.type,
      value: taxId.value,
      verificationStatus: taxId.verification?.status ?? undefined,
    }))
    .sort((left, right) =>
      left.stripeTaxIdId.localeCompare(right.stripeTaxIdId)
    )
}

function getExpandedPaymentMethod(
  paymentMethod: string | Stripe.PaymentMethod | null | undefined
) {
  if (!paymentMethod || typeof paymentMethod === "string") {
    return null
  }

  return paymentMethod
}

function getSafeHttpsUrl(value: string | null | undefined) {
  if (!value) {
    return undefined
  }

  try {
    const url = new URL(value)
    return url.protocol === "https:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  return invoice.parent?.type === "subscription_details" &&
    typeof invoice.parent.subscription_details?.subscription === "string"
    ? invoice.parent.subscription_details.subscription
    : undefined
}

function resolveInvoicePaymentMethod(
  invoice: Stripe.Invoice,
  paymentMethodsById: ReadonlyMap<string, Stripe.PaymentMethod>
) {
  for (const invoicePayment of invoice.payments?.data ?? []) {
    if (
      invoicePayment.payment.type !== "payment_intent" ||
      typeof invoicePayment.payment.payment_intent !== "object"
    ) {
      continue
    }

    const expandedPaymentMethod = getExpandedPaymentMethod(
      invoicePayment.payment.payment_intent.payment_method
    )

    if (expandedPaymentMethod) {
      return expandedPaymentMethod
    }

    const paymentMethodId = getStripeDefaultPaymentMethodId(
      invoicePayment.payment.payment_intent.payment_method
    )

    if (paymentMethodId) {
      return paymentMethodsById.get(paymentMethodId) ?? null
    }
  }

  const defaultPaymentMethod = getExpandedPaymentMethod(
    invoice.default_payment_method
  )

  if (defaultPaymentMethod) {
    return defaultPaymentMethod
  }

  const defaultPaymentMethodId = getStripeDefaultPaymentMethodId(
    invoice.default_payment_method
  )

  return defaultPaymentMethodId
    ? paymentMethodsById.get(defaultPaymentMethodId) ?? null
    : null
}

async function listInvoicePaymentMethods(args: {
  invoices: Stripe.Invoice[]
  stripe: Stripe
}) {
  const paymentMethodsById = new Map<string, Stripe.PaymentMethod>()
  const paymentMethodIds = new Set<string>()

  for (const invoice of args.invoices) {
    const defaultPaymentMethod = getExpandedPaymentMethod(
      invoice.default_payment_method
    )

    if (defaultPaymentMethod) {
      paymentMethodsById.set(defaultPaymentMethod.id, defaultPaymentMethod)
    }

    const defaultPaymentMethodId = getStripeDefaultPaymentMethodId(
      invoice.default_payment_method
    )

    if (defaultPaymentMethodId) {
      paymentMethodIds.add(defaultPaymentMethodId)
    }

    for (const invoicePayment of invoice.payments?.data ?? []) {
      if (
        invoicePayment.payment.type !== "payment_intent" ||
        typeof invoicePayment.payment.payment_intent !== "object"
      ) {
        continue
      }

      const expandedPaymentMethod = getExpandedPaymentMethod(
        invoicePayment.payment.payment_intent.payment_method
      )

      if (expandedPaymentMethod) {
        paymentMethodsById.set(expandedPaymentMethod.id, expandedPaymentMethod)
      }

      const paymentMethodId = getStripeDefaultPaymentMethodId(
        invoicePayment.payment.payment_intent.payment_method
      )

      if (paymentMethodId) {
        paymentMethodIds.add(paymentMethodId)
      }
    }
  }

  const missingPaymentMethodIds = Array.from(paymentMethodIds).filter(
    (paymentMethodId) => !paymentMethodsById.has(paymentMethodId)
  )

  const retrievals = await Promise.allSettled(
    missingPaymentMethodIds.map(async (paymentMethodId) => ({
      paymentMethod: await args.stripe.paymentMethods.retrieve(paymentMethodId),
      paymentMethodId,
    }))
  )

  for (const retrieval of retrievals) {
    if (retrieval.status !== "fulfilled") {
      continue
    }

    paymentMethodsById.set(
      retrieval.value.paymentMethodId,
      retrieval.value.paymentMethod
    )
  }

  return paymentMethodsById
}

export async function reconcileBillingCustomer(args: {
  active?: boolean
  ctx: BillingLifecycleCtx
  stripe: Stripe
  stripeCustomerId: string
}) {
  const billingContext = await args.ctx.runQuery(
    internal.queries.billing.internal.getBillingContextByStripeCustomerId,
    {
      stripeCustomerId: args.stripeCustomerId,
    }
  )

  if (!billingContext) {
    return null
  }

  const stripeCustomer = await getStripeCustomerIfAvailable({
    customer: args.stripeCustomerId,
    stripe: args.stripe,
  })
  const taxIds = stripeCustomer
    ? await listStripeCustomerTaxIds({
        stripe: args.stripe,
        stripeCustomerId: args.stripeCustomerId,
      })
    : []

  await args.ctx.runMutation(
    internal.mutations.billing.state.upsertBillingCustomer,
    {
      active: args.active ?? billingContext.customer?.active ?? true,
      billingAddress: normalizeBillingAddress(stripeCustomer?.address ?? null),
      businessName:
        getStripeCustomerBusinessName(stripeCustomer) ??
        billingContext.customer?.businessName ??
        undefined,
      clerkUserId: billingContext.user.clerkUserId,
      defaultPaymentMethodId: getStripeDefaultPaymentMethodId(
        stripeCustomer?.invoice_settings.default_payment_method
      ),
      email:
        stripeCustomer?.email ?? billingContext.customer?.email ?? undefined,
      lastSyncedAt: Date.now(),
      name:
        stripeCustomer?.name ??
        billingContext.customer?.name ??
        billingContext.user.name,
      phone:
        getStripeCustomerPhone(stripeCustomer) ??
        billingContext.customer?.phone ??
        undefined,
      stripeCustomerId: args.stripeCustomerId,
      taxExempt: stripeCustomer?.tax_exempt ?? undefined,
      taxIds,
      userId: billingContext.user._id,
    }
  )

  return {
    billingContext,
    stripeCustomer,
  }
}

export async function reconcileStripeSubscription(args: {
  ctx: BillingLifecycleCtx
  invoiceEventType?:
    | "invoice.payment_action_required"
    | "invoice.payment_failed"
    | "invoice.payment_succeeded"
  lastStripeEventId?: string
  stripe: Stripe
  subscription: Stripe.Subscription
}) {
  const stripeCustomerId =
    typeof args.subscription.customer === "string"
      ? args.subscription.customer
      : args.subscription.customer.id
  const billingContext = await args.ctx.runQuery(
    internal.queries.billing.internal.getBillingContextByStripeCustomerId,
    {
      stripeCustomerId,
    }
  )

  if (!billingContext) {
    return null
  }

  const item = getStripeSubscriptionItem(args.subscription)
  const priceId = item.price.id
  const plan = await args.ctx.runQuery(
    internal.queries.billing.internal.getPlanByStripePriceId,
    {
      stripePriceId: priceId,
    }
  )

  if (!plan) {
    throw new Error(
      `Billing plan not found for Stripe price ${priceId} on subscription ${args.subscription.id}.`
    )
  }

  const stripeCustomer = await getStripeCustomerIfAvailable({
    customer: args.subscription.customer,
    stripe: args.stripe,
  })

  await args.ctx.runMutation(
    internal.mutations.billing.state.upsertBillingCustomer,
    {
      active: true,
      clerkUserId: billingContext.user.clerkUserId,
      email:
        stripeCustomer?.email ?? billingContext.customer?.email ?? undefined,
      name:
        stripeCustomer?.name ??
        billingContext.customer?.name ??
        billingContext.user.name,
      stripeCustomerId,
      userId: billingContext.user._id,
    }
  )

  const scheduleId = getStripeScheduleId(args.subscription.schedule)
  const schedule = scheduleId
    ? await args.stripe.subscriptionSchedules.retrieve(scheduleId)
    : null
  const priceIdToPlan = new Map<
    string,
    { interval: "month" | "year"; planKey: string }
  >()
  const plans = await args.ctx.runQuery(
    internal.queries.billing.catalog.getBillingPlans,
    {}
  )

  for (const currentPlan of plans) {
    if (currentPlan.monthlyPriceId) {
      priceIdToPlan.set(currentPlan.monthlyPriceId, {
        interval: "month",
        planKey: currentPlan.key,
      })
    }

    if (currentPlan.yearlyPriceId) {
      priceIdToPlan.set(currentPlan.yearlyPriceId, {
        interval: "year",
        planKey: currentPlan.key,
      })
    }
  }

  const scheduledChange = mapSubscriptionScheduleChange({
    priceIdToPlan,
    schedule,
    subscription: args.subscription,
  })

  await args.ctx.runMutation(
    internal.mutations.billing.state.upsertBillingSubscription,
    {
      attentionStatus: deriveAttentionStatus({
        invoiceEventType: args.invoiceEventType,
        subscription: args.subscription,
      }),
      attentionUpdatedAt: Date.now(),
      cancelAt:
        typeof args.subscription.cancel_at === "number"
          ? args.subscription.cancel_at * 1000
          : undefined,
      cancelAtPeriodEnd: args.subscription.cancel_at_period_end,
      canceledAt:
        typeof args.subscription.canceled_at === "number"
          ? args.subscription.canceled_at * 1000
          : undefined,
      clerkUserId: billingContext.user.clerkUserId,
      clearScheduledChange:
        scheduledChange.scheduledChangeType === undefined &&
        !args.subscription.cancel_at_period_end,
      currentPeriodEnd: getSubscriptionItemCurrentPeriodEnd(args.subscription),
      currentPeriodStart: getSubscriptionItemCurrentPeriodStart(
        args.subscription
      ),
      defaultPaymentMethodId: getStripeDefaultPaymentMethodId(
        args.subscription.default_payment_method
      ),
      endedAt:
        typeof args.subscription.ended_at === "number"
          ? args.subscription.ended_at * 1000
          : undefined,
      interval: getStripeSubscriptionInterval(args.subscription),
      lastStripeEventId: args.lastStripeEventId,
      planKey: plan.key,
      quantity: item.quantity ?? 1,
      scheduledChangeAt: scheduledChange.scheduledChangeAt,
      scheduledChangeRequestedAt: scheduledChange.scheduledChangeRequestedAt,
      scheduledChangeType: scheduledChange.scheduledChangeType,
      scheduledInterval: scheduledChange.scheduledInterval,
      scheduledPlanKey: scheduledChange.scheduledPlanKey,
      startedAt:
        typeof args.subscription.start_date === "number"
          ? args.subscription.start_date * 1000
          : undefined,
      status: mapStripeSubscriptionStatus(args.subscription.status),
      stripeCustomerId,
      stripeLatestInvoiceId: getStripeInvoiceId(
        args.subscription.latest_invoice
      ),
      stripeLatestPaymentIntentId: getInvoicePaymentIntentId(
        args.subscription.latest_invoice
      ),
      stripePriceId: priceId,
      stripeProductId: getStripeProductId(item.price.product),
      stripeScheduleId: scheduledChange.stripeScheduleId ?? scheduleId,
      stripeSubscriptionId: args.subscription.id,
      stripeSubscriptionItemId: item.id,
      trialEnd:
        typeof args.subscription.trial_end === "number"
          ? args.subscription.trial_end * 1000
          : undefined,
      trialStart:
        typeof args.subscription.trial_start === "number"
          ? args.subscription.trial_start * 1000
          : undefined,
      userId: billingContext.user._id,
    }
  )

  return {
    planKey: plan.key,
    status: args.subscription.status,
    stripeCustomerId,
    subscriptionId: args.subscription.id,
  }
}

export async function reconcileStripeInvoice(args: {
  ctx: BillingLifecycleCtx
  eventType:
    | "invoice.payment_action_required"
    | "invoice.payment_failed"
    | "invoice.payment_succeeded"
  invoice: Stripe.Invoice
  lastStripeEventId?: string
  stripe: Stripe
}) {
  const stripeCustomerId =
    typeof args.invoice.customer === "string"
      ? args.invoice.customer
      : undefined
  const stripeSubscriptionId =
    args.invoice.parent?.type === "subscription_details" &&
    typeof args.invoice.parent.subscription_details?.subscription === "string"
      ? args.invoice.parent.subscription_details.subscription
      : undefined

  if (stripeCustomerId) {
    await reconcileBillingCustomer({
      active: true,
      ctx: args.ctx,
      stripe: args.stripe,
      stripeCustomerId,
    })
    await syncBillingInvoicesForCustomer({
      ctx: args.ctx,
      stripe: args.stripe,
      stripeCustomerId,
    })
  }

  if (!stripeSubscriptionId) {
    return null
  }

  const subscription = await args.stripe.subscriptions.retrieve(
    stripeSubscriptionId,
    {
      expand: [
        "customer",
        "items.data.price.product",
        "latest_invoice.confirmation_secret",
        "latest_invoice.payment_intent",
        "pending_setup_intent",
        "schedule",
      ],
    }
  )

  return await reconcileStripeSubscription({
    ctx: args.ctx,
    invoiceEventType: args.eventType,
    lastStripeEventId: args.lastStripeEventId,
    stripe: args.stripe,
    subscription,
  })
}

export async function syncBillingPaymentMethodsForCustomer(args: {
  ctx: BillingLifecycleCtx
  stripe: Stripe
  stripeCustomerId: string
}) {
  const billingContext = await args.ctx.runQuery(
    internal.queries.billing.internal.getBillingContextByStripeCustomerId,
    {
      stripeCustomerId: args.stripeCustomerId,
    }
  )

  if (!billingContext) {
    return null
  }

  const stripeCustomer = await getStripeCustomerIfAvailable({
    customer: args.stripeCustomerId,
    stripe: args.stripe,
  })
  const paymentMethods = await args.stripe.customers.listPaymentMethods(
    args.stripeCustomerId,
    {
      limit: 24,
    }
  )

  await args.ctx.runMutation(
    internal.mutations.billing.state.syncBillingPaymentMethods,
    {
      clerkUserId: billingContext.user.clerkUserId,
      defaultPaymentMethodId: getStripeDefaultPaymentMethodId(
        stripeCustomer?.invoice_settings.default_payment_method
      ),
      paymentMethods: paymentMethods.data.map((paymentMethod) => ({
        bankName:
          paymentMethod.us_bank_account?.bank_name ??
          paymentMethod.sepa_debit?.bank_code ??
          undefined,
        billingAddress: normalizeBillingAddress(
          paymentMethod.billing_details.address
        ),
        brand:
          paymentMethod.card?.brand ??
          paymentMethod.us_bank_account?.bank_name ??
          undefined,
        cardholderName: paymentMethod.billing_details.name ?? undefined,
        expMonth: paymentMethod.card?.exp_month ?? undefined,
        expYear: paymentMethod.card?.exp_year ?? undefined,
        last4:
          paymentMethod.card?.last4 ??
          paymentMethod.us_bank_account?.last4 ??
          paymentMethod.sepa_debit?.last4 ??
          undefined,
        stripePaymentMethodId: paymentMethod.id,
        type: paymentMethod.type,
      })),
      stripeCustomerId: args.stripeCustomerId,
      userId: billingContext.user._id,
    }
  )

  return {
    count: paymentMethods.data.length,
    stripeCustomerId: args.stripeCustomerId,
  }
}

export async function syncBillingInvoicesForCustomer(args: {
  ctx: BillingLifecycleCtx
  limit?: number
  stripe: Stripe
  stripeCustomerId: string
}) {
  const billingContext = await args.ctx.runQuery(
    internal.queries.billing.internal.getBillingContextByStripeCustomerId,
    {
      stripeCustomerId: args.stripeCustomerId,
    }
  )

  if (!billingContext) {
    return null
  }

  const invoicePage = await args.stripe.invoices.list({
    customer: args.stripeCustomerId,
    expand: ["data.default_payment_method"],
    limit: args.limit ?? 36,
  })
  // Stripe allows `payments.data.payment.payment_intent` on invoice retrieval,
  // but not on invoice lists because the leading `data` pushes list expansion
  // depth beyond the documented four-level limit.
  const invoices = await Promise.all(
    invoicePage.data.map(async (invoice) => {
      try {
        return await args.stripe.invoices.retrieve(invoice.id, {
          expand: [
            "default_payment_method",
            "payments.data.payment.payment_intent",
          ],
        })
      } catch {
        return invoice
      }
    })
  )
  const paymentMethodsById = await listInvoicePaymentMethods({
    invoices,
    stripe: args.stripe,
  })

  await args.ctx.runMutation(
    internal.mutations.billing.state.syncBillingInvoices,
    {
      clerkUserId: billingContext.user.clerkUserId,
      invoices: invoices.map((invoice) => {
        const paymentMethod = resolveInvoicePaymentMethod(
          invoice,
          paymentMethodsById
        )

        return {
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
          description:
            invoice.lines.data[0]?.description ??
            invoice.description ??
            invoice.number ??
            "Subscription invoice",
          hostedInvoiceUrl: getSafeHttpsUrl(invoice.hosted_invoice_url),
          invoiceIssuedAt: invoice.created * 1000,
          invoiceNumber: invoice.number ?? undefined,
          invoicePdfUrl: getSafeHttpsUrl(invoice.invoice_pdf),
          paymentMethodBrand:
            paymentMethod?.card?.brand ??
            paymentMethod?.us_bank_account?.bank_name ??
            undefined,
          paymentMethodLast4:
            paymentMethod?.card?.last4 ??
            paymentMethod?.us_bank_account?.last4 ??
            paymentMethod?.sepa_debit?.last4 ??
            undefined,
          paymentMethodType: paymentMethod?.type ?? undefined,
          status: invoice.status ?? "draft",
          stripeInvoiceId: invoice.id,
          stripeSubscriptionId: getInvoiceSubscriptionId(invoice),
        }
      }),
      stripeCustomerId: args.stripeCustomerId,
      userId: billingContext.user._id,
    }
  )

  return {
    count: invoices.length,
    stripeCustomerId: args.stripeCustomerId,
  }
}
