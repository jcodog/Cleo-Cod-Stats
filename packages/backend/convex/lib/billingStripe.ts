import Stripe from "stripe"

import type {
  BillingAttentionStatus,
  BillingInterval,
  BillingSubscriptionStatus,
} from "./billing"
import {
  isBillingInterval,
  maskIdentifier,
  unixSecondsToMillis,
} from "./billing"

function isExpandedObject<T extends { id: string }>(
  value: string | T | null | undefined
): value is T {
  return typeof value === "object" && value !== null && "id" in value
}

function getObjectRecord(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function getObjectIdentifier(value: unknown) {
  if (typeof value === "string") {
    return value
  }

  const record = getObjectRecord(value)
  return typeof record?.id === "string" ? record.id : undefined
}

export function getStripePriceId(price: string | Stripe.Price | null | undefined) {
  if (!price) {
    return undefined
  }

  return typeof price === "string" ? price : price.id
}

export function getStripeProductId(
  product: string | Stripe.Product | Stripe.DeletedProduct | null | undefined
) {
  if (!product) {
    return undefined
  }

  return typeof product === "string" ? product : product.id
}

export function getStripeScheduleId(
  schedule:
    | string
    | Stripe.SubscriptionSchedule
    | null
    | undefined
) {
  if (!schedule) {
    return undefined
  }

  return typeof schedule === "string" ? schedule : schedule.id
}

export function getStripeInvoiceId(
  invoice: string | Stripe.Invoice | null | undefined
) {
  if (!invoice) {
    return undefined
  }

  return typeof invoice === "string" ? invoice : invoice.id
}

export function getStripePaymentIntentId(
  paymentIntent: string | Stripe.PaymentIntent | null | undefined
) {
  if (!paymentIntent) {
    return undefined
  }

  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id
}

export function getStripeSetupIntentId(
  setupIntent: string | Stripe.SetupIntent | null | undefined
) {
  if (!setupIntent) {
    return undefined
  }

  return typeof setupIntent === "string" ? setupIntent : setupIntent.id
}

export function getStripeSubscriptionItem(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0]

  if (!item) {
    throw new Error(
      `Stripe subscription ${subscription.id} does not contain any items.`
    )
  }

  return item
}

export function getStripeSubscriptionInterval(
  subscription: Stripe.Subscription
): BillingInterval {
  const interval = getStripeSubscriptionItem(subscription).price.recurring?.interval

  if (!isBillingInterval(interval)) {
    throw new Error(
      `Stripe subscription ${subscription.id} uses unsupported interval ${interval ?? "unknown"}.`
    )
  }

  return interval
}

export function getSubscriptionItemCurrentPeriodStart(
  subscription: Stripe.Subscription
) {
  return unixSecondsToMillis(getStripeSubscriptionItem(subscription).current_period_start)
}

export function getSubscriptionItemCurrentPeriodEnd(
  subscription: Stripe.Subscription
) {
  return unixSecondsToMillis(getStripeSubscriptionItem(subscription).current_period_end)
}

export function mapStripeSubscriptionStatus(
  status: Stripe.Subscription.Status
): BillingSubscriptionStatus {
  switch (status) {
    case "active":
    case "canceled":
    case "incomplete":
    case "incomplete_expired":
    case "past_due":
    case "paused":
    case "trialing":
    case "unpaid":
      return status
  }
}

export function getInvoiceConfirmationSecret(
  invoice: string | Stripe.Invoice | null | undefined
) {
  if (!isExpandedObject(invoice)) {
    return undefined
  }

  return invoice.confirmation_secret?.client_secret ?? undefined
}

export function getSetupIntentClientSecret(
  setupIntent: string | Stripe.SetupIntent | null | undefined
) {
  if (!isExpandedObject(setupIntent)) {
    return undefined
  }

  return setupIntent.client_secret ?? undefined
}

export function deriveAttentionStatus(args: {
  invoiceEventType?:
    | "invoice.payment_action_required"
    | "invoice.payment_failed"
    | "invoice.payment_succeeded"
  subscription: Stripe.Subscription
}) {
  if (args.invoiceEventType === "invoice.payment_action_required") {
    return "requires_action" satisfies BillingAttentionStatus
  }

  if (args.invoiceEventType === "invoice.payment_failed") {
    return "payment_failed" satisfies BillingAttentionStatus
  }

  if (args.subscription.status === "past_due") {
    return "past_due" satisfies BillingAttentionStatus
  }

  if (args.subscription.status === "paused") {
    return "paused" satisfies BillingAttentionStatus
  }

  return "none" satisfies BillingAttentionStatus
}

export function getInvoicePaymentIntentId(
  invoice: string | Stripe.Invoice | null | undefined
) {
  if (!isExpandedObject(invoice)) {
    return undefined
  }

  return getStripePaymentIntentId(invoice.payments?.data[0]?.payment.payment_intent)
}

export function getExpandedStripeInvoice(
  invoice: string | Stripe.Invoice | null | undefined
) {
  return isExpandedObject(invoice) ? invoice : null
}

export function getExpandedStripeCustomer(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
) {
  if (!customer || typeof customer === "string") {
    return null
  }

  if ("deleted" in customer && customer.deleted) {
    return null
  }

  return customer
}

export function mapSubscriptionScheduleChange(args: {
  priceIdToPlan: Map<string, { interval: BillingInterval; planKey: string }>
  schedule: Stripe.SubscriptionSchedule | null
  subscription: Stripe.Subscription
}) {
  const currentPeriodEnd = getSubscriptionItemCurrentPeriodEnd(args.subscription)

  if (!args.schedule) {
    if (args.subscription.cancel_at_period_end && currentPeriodEnd) {
      return {
        scheduledChangeAt: currentPeriodEnd,
        scheduledChangeRequestedAt: undefined,
        scheduledChangeType: "cancel" as const,
        scheduledInterval: undefined,
        scheduledPlanKey: undefined,
        stripeScheduleId: undefined,
      }
    }

    return {
      scheduledChangeAt: undefined,
      scheduledChangeRequestedAt: undefined,
      scheduledChangeType: undefined,
      scheduledInterval: undefined,
      scheduledPlanKey: undefined,
      stripeScheduleId: undefined,
    }
  }

  const nowInSeconds = Math.floor(Date.now() / 1000)
  const nextPhase = args.schedule.phases.find((phase) => {
    const startDate =
      typeof phase.start_date === "number" ? phase.start_date : undefined

    return startDate !== undefined && startDate >= nowInSeconds
  })

  const nextPriceId =
    nextPhase?.items?.[0]?.price && typeof nextPhase.items[0].price === "string"
      ? nextPhase.items[0].price
      : undefined
  const scheduledPlan = nextPriceId
    ? args.priceIdToPlan.get(nextPriceId) ?? null
    : null

  if (!nextPhase || !scheduledPlan) {
    return {
      scheduledChangeAt: undefined,
      scheduledChangeRequestedAt: undefined,
      scheduledChangeType: undefined,
      scheduledInterval: undefined,
      scheduledPlanKey: undefined,
      stripeScheduleId: args.schedule.id,
    }
  }

  const scheduledChangeAt =
    typeof nextPhase.start_date === "number"
      ? unixSecondsToMillis(nextPhase.start_date)
      : undefined

  return {
    scheduledChangeAt,
    scheduledChangeRequestedAt: args.schedule.released_at
      ? unixSecondsToMillis(args.schedule.released_at)
      : unixSecondsToMillis(args.schedule.created),
    scheduledChangeType: "plan_change" as const,
    scheduledInterval: scheduledPlan.interval,
    scheduledPlanKey: scheduledPlan.planKey,
    stripeScheduleId: args.schedule.id,
  }
}

function getInvoiceSubscriptionId(
  object: Record<string, unknown> | null
) {
  const directSubscriptionId = getObjectIdentifier(object?.subscription)

  if (directSubscriptionId) {
    return directSubscriptionId
  }

  const parent =
    object?.parent && typeof object.parent === "object"
      ? (object.parent as Record<string, unknown>)
      : null
  const subscriptionDetails =
    parent?.subscription_details &&
    typeof parent.subscription_details === "object"
      ? (parent.subscription_details as Record<string, unknown>)
      : null

  return getObjectIdentifier(subscriptionDetails?.subscription)
}

function getEventCustomerId(object: Record<string, unknown> | null) {
  const directCustomerId = getObjectIdentifier(object?.customer)

  if (directCustomerId) {
    return directCustomerId
  }

  const latestInvoice = getObjectRecord(object?.latest_invoice)
  return getObjectIdentifier(latestInvoice?.customer)
}

function getEventInvoiceId(args: {
  eventType: string
  object: Record<string, unknown> | null
}) {
  if (
    typeof args.object?.id === "string" &&
    args.eventType.startsWith("invoice.")
  ) {
    return args.object.id
  }

  return getObjectIdentifier(args.object?.latest_invoice)
}

function getInvoicePaymentIntentIdFromObject(
  object: Record<string, unknown> | null
) {
  const directPaymentIntentId = getObjectIdentifier(object?.payment_intent)

  if (directPaymentIntentId) {
    return directPaymentIntentId
  }

  const payments = getObjectRecord(object?.payments)
  const paymentEntries = Array.isArray(payments?.data) ? payments.data : []

  for (const paymentEntry of paymentEntries) {
    const paymentEntryRecord = getObjectRecord(paymentEntry)
    const payment = getObjectRecord(paymentEntryRecord?.payment)
    const paymentIntentId = getObjectIdentifier(payment?.payment_intent)

    if (paymentIntentId) {
      return paymentIntentId
    }
  }

  return undefined
}

function getEventPaymentIntentId(object: Record<string, unknown> | null) {
  const directPaymentIntentId = getInvoicePaymentIntentIdFromObject(object)

  if (directPaymentIntentId) {
    return directPaymentIntentId
  }

  const latestInvoice = getObjectRecord(object?.latest_invoice)
  return getInvoicePaymentIntentIdFromObject(latestInvoice)
}

function extractWebhookObjectIds(event: Stripe.Event) {
  const object =
    event.data.object && typeof event.data.object === "object"
      ? (event.data.object as unknown as Record<string, unknown>)
      : null

  return {
    customerId: getEventCustomerId(object),
    invoiceId: getEventInvoiceId({
      eventType: event.type,
      object,
    }),
    paymentIntentId: getEventPaymentIntentId(object),
    subscriptionId:
      getInvoiceSubscriptionId(object) ??
      (typeof object?.id === "string" &&
      event.type.startsWith("customer.subscription")
        ? object.id
        : undefined),
  }
}

export function getWebhookObjectIdsFromPayloadJson(payloadJson: string | undefined) {
  if (!payloadJson) {
    return null
  }

  try {
    return extractWebhookObjectIds(JSON.parse(payloadJson) as Stripe.Event)
  } catch {
    return null
  }
}

export function buildWebhookSafeSummary(event: Stripe.Event) {
  const { customerId, invoiceId, paymentIntentId, subscriptionId } =
    extractWebhookObjectIds(event)

  return [
    event.type,
    customerId ? `customer=${maskIdentifier(customerId)}` : null,
    subscriptionId ? `subscription=${maskIdentifier(subscriptionId)}` : null,
    invoiceId ? `invoice=${maskIdentifier(invoiceId)}` : null,
    paymentIntentId ? `payment_intent=${maskIdentifier(paymentIntentId)}` : null,
  ]
    .filter(Boolean)
    .join(" ")
}

export function getWebhookObjectIds(event: Stripe.Event) {
  return extractWebhookObjectIds(event)
}
