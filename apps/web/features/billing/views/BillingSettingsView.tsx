"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { Elements } from "@stripe/react-stripe-js"
import {
  IconAlertTriangle,
  IconCreditCard,
  IconFileInvoice,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import { useTheme } from "next-themes"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { CheckoutPaymentForm } from "@/features/billing/components/CheckoutPaymentForm"
import { InvoiceHistoryTable } from "@/features/billing/components/InvoiceHistoryTable"
import {
  BillingClientError,
  useBillingCenter,
  useCreatePaymentMethodSetupIntent,
  usePreviewSubscriptionChange,
  usePricingCatalog,
  useReactivateSubscription,
  useRemovePaymentMethod,
  useSetDefaultPaymentMethod,
  useSyncBillingCenter,
  useUpdateBillingProfile,
  useUpdateSubscriptionPlan,
  useCancelSubscription,
} from "@/features/billing/lib/billing-client"
import {
  formatBillingInterval,
  formatBillingStatusLabel,
  formatCardBrandLabel,
  formatCountryLabel,
  formatCurrencyAmount,
  formatDateLabel,
  formatDateTimeLabel,
  formatPaymentMethodTypeLabel,
} from "@/features/billing/lib/format"
import {
  getStripeElementsAppearance,
  getStripePublishableKey,
  stripePromise,
} from "@/features/billing/lib/stripe"
import type {
  BillingAddress,
  BillingCenterData,
  BillingCenterPaymentMethod,
  BillingCenterSubscription,
  BillingChangePreview,
  BillingChangeResult,
  BillingInterval,
  PricingCatalogPlan,
} from "@/features/billing/lib/billing-types"

type BillingProfileFormState = {
  businessName: string
  city: string
  country: string
  email: string
  line1: string
  line2: string
  name: string
  phone: string
  postalCode: string
  state: string
}

type SubscriptionDialogState = {
  interval: BillingInterval
  planKey: string
  stripeSubscriptionId: string
}

type SubscriptionConfirmationState = {
  clientSecret: string
  secretType: "payment_intent" | "setup_intent"
}

function createBillingProfileFormState(
  profile: BillingCenterData["billingProfile"]
): BillingProfileFormState {
  return {
    businessName: profile.businessName ?? "",
    city: profile.address?.city ?? "",
    country: profile.address?.country ?? "",
    email: profile.email ?? "",
    line1: profile.address?.line1 ?? "",
    line2: profile.address?.line2 ?? "",
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    postalCode: profile.address?.postalCode ?? "",
    state: profile.address?.state ?? "",
  }
}

function getAddressLabel(address: BillingAddress | null) {
  if (!address) {
    return "Not set"
  }

  const lines = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(", ") || undefined,
    [address.postalCode, address.country].filter(Boolean).join(" ") ||
      undefined,
  ].filter((value): value is string => Boolean(value && value.trim()))

  return lines.length > 0 ? lines.join(", ") : "Not set"
}

function getCardBrandSummary(
  brand: string | null | undefined,
  last4: string | null | undefined
) {
  if (last4) {
    return `${formatCardBrandLabel(brand)} •••• ${last4}`
  }

  return formatCardBrandLabel(brand)
}

function getPaymentMethodSummary(paymentMethod: BillingCenterPaymentMethod) {
  if (paymentMethod.type === "card") {
    return getCardBrandSummary(paymentMethod.brand, paymentMethod.last4)
  }

  if (paymentMethod.bankName && paymentMethod.last4) {
    return `${paymentMethod.bankName} •••• ${paymentMethod.last4}`
  }

  return formatPaymentMethodTypeLabel(paymentMethod.type)
}

function getSubscriptionBadgeVariant(
  status: BillingCenterSubscription["status"]
): "destructive" | "outline" | "secondary" {
  if (status === "active" || status === "trialing") {
    return "secondary"
  }

  if (status === "past_due" || status === "incomplete" || status === "unpaid") {
    return "destructive"
  }

  return "outline"
}

function getSubscriptionAmountLabel(subscription: BillingCenterSubscription) {
  if (subscription.amount === null || !subscription.currency) {
    return "Custom billing"
  }

  const totalAmount = subscription.amount * Math.max(subscription.quantity, 1)
  return `${formatCurrencyAmount(totalAmount, subscription.currency)} / ${subscription.billingInterval}`
}

function getSubscriptionRenewalLabel(subscription: BillingCenterSubscription) {
  if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd) {
    return `Ends ${formatDateLabel(subscription.currentPeriodEnd)}`
  }

  if (subscription.trialEnd) {
    return `Trial ends ${formatDateLabel(subscription.trialEnd)}`
  }

  if (subscription.currentPeriodEnd) {
    return `Renews ${formatDateLabel(subscription.currentPeriodEnd)}`
  }

  return "Renewal date unavailable"
}

function getSubscriptionChangeActionLabel(change: BillingChangeResult) {
  if (change.mode === "scheduled_change") {
    return "Subscription change scheduled."
  }

  if (change.mode === "cancel_at_period_end") {
    return "Subscription cancellation scheduled."
  }

  return "Subscription updated."
}

function hasPotentiallyStaleSubscriptionState(
  subscription: BillingCenterSubscription
) {
  return (
    subscription.status === "incomplete" ||
    subscription.status === "past_due" ||
    subscription.status === "unpaid"
  )
}

function shouldAttemptBackgroundStripeResync(billingCenter: BillingCenterData) {
  if (!billingCenter.billingProfile.stripeCustomerId) {
    return false
  }

  if (billingCenter.subscriptions.some(hasPotentiallyStaleSubscriptionState)) {
    return true
  }

  return (
    billingCenter.portalMode === "management" &&
    billingCenter.subscriptions.length > 0 &&
    billingCenter.invoices.length === 0
  )
}

function BillingValue(args: {
  label: string
  value: ReactNode
  valueClassName?: string
}) {
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{args.label}</span>
      <div
        className={cn(
          "min-w-0 break-words text-sm font-medium",
          args.valueClassName
        )}
      >
        {args.value}
      </div>
    </div>
  )
}

function BillingProfileCard(args: {
  onEdit: () => void
  profile: BillingCenterData["billingProfile"]
}) {
  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Billing profile</CardTitle>
          <CardDescription>
            Customer details stored against the linked Stripe billing profile.
          </CardDescription>
        </div>
        <Button
          disabled={!args.profile.canEdit}
          onClick={args.onEdit}
          size="sm"
          variant="outline"
        >
          Edit
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <BillingValue
          label="Customer name"
          value={args.profile.name ?? "Not set"}
        />
        <BillingValue
          label="Billing email"
          value={args.profile.email ?? "Not set"}
        />
        <BillingValue label="Phone" value={args.profile.phone ?? "Not set"} />
        <BillingValue
          label="Company or business"
          value={args.profile.businessName ?? "Not set"}
        />
        <BillingValue
          label="Billing address"
          value={getAddressLabel(args.profile.address)}
        />
        <BillingValue
          label="Country or region"
          value={formatCountryLabel(args.profile.country)}
        />
        <BillingValue
          label="Tax status"
          value={
            args.profile.taxExempt
              ? formatBillingStatusLabel(args.profile.taxExempt)
              : "Not set"
          }
        />
        <BillingValue
          label="Billing reference"
          value={args.profile.stripeCustomerId ?? "Not linked"}
          valueClassName="break-all font-mono text-xs text-foreground/90"
        />
        <div className="md:col-span-2">
          <BillingValue
            label="Tax IDs / VAT"
            value={
              args.profile.taxIds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {args.profile.taxIds.map((taxId) => (
                    <Badge key={taxId.stripeTaxIdId} variant="outline">
                      {taxId.type.toUpperCase()} {taxId.value}
                    </Badge>
                  ))}
                </div>
              ) : (
                "Not set"
              )
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentMethodsCard(args: {
  addDisabled: boolean
  addPending: boolean
  onAdd: () => void
  onMakeDefault: (paymentMethod: BillingCenterPaymentMethod) => void
  onRemove: (paymentMethod: BillingCenterPaymentMethod) => void
  paymentMethods: BillingCenterPaymentMethod[]
  setDefaultPending: boolean
}) {
  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Payment methods</CardTitle>
          <CardDescription>
            Saved Stripe payment methods for subscription renewals and change
            invoices.
          </CardDescription>
        </div>
        <Button
          disabled={args.addDisabled || args.addPending}
          onClick={args.onAdd}
          size="sm"
          variant="outline"
        >
          <IconPlus data-icon="inline-start" />
          {args.addPending ? "Preparing..." : "Add"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {args.paymentMethods.length > 0 ? (
          args.paymentMethods.map((paymentMethod) => (
            <div
              className="flex flex-col gap-4 rounded-lg border border-border/70 bg-muted/10 px-4 py-4"
              key={paymentMethod.stripePaymentMethodId}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {getPaymentMethodSummary(paymentMethod)}
                    </span>
                    {paymentMethod.isDefault ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {paymentMethod.expMonth && paymentMethod.expYear
                      ? `Expires ${String(paymentMethod.expMonth).padStart(2, "0")}/${paymentMethod.expYear}`
                      : formatPaymentMethodTypeLabel(paymentMethod.type)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!paymentMethod.isDefault ? (
                    <Button
                      disabled={args.setDefaultPending}
                      onClick={() => args.onMakeDefault(paymentMethod)}
                      size="sm"
                      variant="outline"
                    >
                      Make default
                    </Button>
                  ) : null}
                  <Button
                    disabled={paymentMethod.isDefault}
                    onClick={() => args.onRemove(paymentMethod)}
                    size="sm"
                    variant="outline"
                  >
                    <IconTrash data-icon="inline-start" />
                    Remove
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <BillingValue
                  label="Cardholder"
                  value={paymentMethod.cardholderName ?? "Not set"}
                />
                <BillingValue
                  label="Billing address"
                  value={getAddressLabel(paymentMethod.address)}
                />
              </div>
            </div>
          ))
        ) : (
          <Empty className="border border-dashed border-border/70 bg-muted/10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconCreditCard />
              </EmptyMedia>
              <EmptyTitle>No saved payment methods</EmptyTitle>
              <EmptyDescription>
                Add a payment method to handle renewals and any immediate Stripe
                change invoices inside the app.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
      {!getStripePublishableKey() ? (
        <CardFooter className="border-t border-border/70 bg-muted/10">
          <Alert variant="destructive">
            <AlertTitle>Stripe publishable key missing</AlertTitle>
            <AlertDescription>
              Set <code>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</code> before adding
              payment methods in-app.
            </AlertDescription>
          </Alert>
        </CardFooter>
      ) : null}
    </Card>
  )
}

function SubscriptionsCard(args: {
  checkoutEnabled: boolean
  onOpenSubscription: (subscription: BillingCenterSubscription) => void
  portalMode: BillingCenterData["portalMode"]
  subscriptions: BillingCenterSubscription[]
}) {
  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Subscriptions</CardTitle>
          <CardDescription>
            Managed Stripe subscriptions for this account, including renewal and
            cancellation state.
          </CardDescription>
        </div>
        {args.portalMode === "acquisition" && args.checkoutEnabled ? (
          <Button asChild size="sm" variant="outline">
            <Link href="/checkout">Start checkout</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {args.subscriptions.length > 0 ? (
          args.subscriptions.map((subscription) => (
            <button
              className="flex w-full flex-col gap-4 rounded-lg border border-border/70 bg-muted/10 px-4 py-4 text-left transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              key={subscription.stripeSubscriptionId}
              onClick={() => args.onOpenSubscription(subscription)}
              type="button"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {subscription.productName}
                    </span>
                    <Badge
                      variant={getSubscriptionBadgeVariant(subscription.status)}
                    >
                      {formatBillingStatusLabel(subscription.status)}
                    </Badge>
                    {subscription.cancelAtPeriodEnd ? (
                      <Badge variant="outline">Cancels at period end</Badge>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getSubscriptionAmountLabel(subscription)}
                  </div>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  Manage
                </span>
              </div>

              <div className="grid gap-3 text-sm md:grid-cols-4">
                <BillingValue
                  label="Billing interval"
                  value={formatBillingInterval(subscription.billingInterval)}
                />
                <BillingValue
                  label="Renewal"
                  value={getSubscriptionRenewalLabel(subscription)}
                />
                <BillingValue
                  label="Quantity"
                  value={
                    subscription.quantity > 1 ? subscription.quantity : "1"
                  }
                />
                <BillingValue
                  label="Payment method"
                  value={
                    subscription.defaultPaymentMethodSummary
                      ? getCardBrandSummary(
                          subscription.defaultPaymentMethodSummary.brand,
                          subscription.defaultPaymentMethodSummary.last4
                        )
                      : "No default payment method"
                  }
                />
              </div>

              {subscription.scheduledChange ? (
                <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-3 text-sm text-muted-foreground">
                  {subscription.scheduledChange.type === "cancel"
                    ? `Scheduled to cancel on ${formatDateLabel(subscription.scheduledChange.effectiveAt)}.`
                    : `Scheduled to move to ${subscription.scheduledChange.planName ?? subscription.scheduledChange.planKey ?? "another plan"} on ${formatDateLabel(subscription.scheduledChange.effectiveAt)}.`}
                </div>
              ) : null}
            </button>
          ))
        ) : (
          <Empty className="border border-dashed border-border/70 bg-muted/10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <IconFileInvoice />
              </EmptyMedia>
              <EmptyTitle>No subscriptions yet</EmptyTitle>
              <EmptyDescription>
                {args.checkoutEnabled
                  ? "Start checkout to create the first managed Stripe subscription for this account."
                  : "Checkout is currently disabled for this account."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  )
}

function BillingProfileDialog(args: {
  onClose: () => void
  onFormChange: (
    updater: (current: BillingProfileFormState) => BillingProfileFormState
  ) => void
  onSave: () => void
  pending: boolean
  profile: BillingCenterData["billingProfile"]
  state: BillingProfileFormState
}) {
  return (
    <Dialog onOpenChange={(open) => !open && args.onClose()} open>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit billing profile</DialogTitle>
          <DialogDescription>
            Update the Stripe billing contact and address details that this
            account uses for invoices and payment method matching.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                value={args.state.name}
              />
            </Field>
            <Field>
              <FieldLabel>Billing email</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
                type="email"
                value={args.state.email}
              />
            </Field>
            <Field>
              <FieldLabel>Phone</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
                value={args.state.phone}
              />
            </Field>
            <Field>
              <FieldLabel>Company or business</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    businessName: event.target.value,
                  }))
                }
                value={args.state.businessName}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Address line 1</FieldLabel>
            <Input
              onChange={(event) =>
                args.onFormChange((current) => ({
                  ...current,
                  line1: event.target.value,
                }))
              }
              value={args.state.line1}
            />
          </Field>
          <Field>
            <FieldLabel>Address line 2</FieldLabel>
            <Input
              onChange={(event) =>
                args.onFormChange((current) => ({
                  ...current,
                  line2: event.target.value,
                }))
              }
              value={args.state.line2}
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel>City</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    city: event.target.value,
                  }))
                }
                value={args.state.city}
              />
            </Field>
            <Field>
              <FieldLabel>State or county</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    state: event.target.value,
                  }))
                }
                value={args.state.state}
              />
            </Field>
            <Field>
              <FieldLabel>Postal code</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    postalCode: event.target.value,
                  }))
                }
                value={args.state.postalCode}
              />
            </Field>
            <Field>
              <FieldLabel>Country or region</FieldLabel>
              <Input
                onChange={(event) =>
                  args.onFormChange((current) => ({
                    ...current,
                    country: event.target.value,
                  }))
                }
                placeholder="GB"
                value={args.state.country}
              />
              <FieldDescription>
                Stripe expects the two-letter billing country code, for example
                GB or US.
              </FieldDescription>
            </Field>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-4">
            <div className="text-sm font-medium">Stripe-managed details</div>
            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
              <BillingValue
                label="Tax status"
                value={
                  args.profile.taxExempt
                    ? formatBillingStatusLabel(args.profile.taxExempt)
                    : "Not set"
                }
              />
              <BillingValue
                label="Billing reference"
                value={args.profile.stripeCustomerId ?? "Not linked"}
                valueClassName="break-all font-mono text-xs text-foreground/90"
              />
              <div className="md:col-span-2">
                <BillingValue
                  label="Tax IDs / VAT"
                  value={
                    args.profile.taxIds.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {args.profile.taxIds.map((taxId) => (
                          <Badge key={taxId.stripeTaxIdId} variant="outline">
                            {taxId.type.toUpperCase()} {taxId.value}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      "Not set"
                    )
                  }
                />
              </div>
            </div>
          </div>
        </FieldGroup>

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.pending} onClick={args.onSave}>
            {args.pending ? "Saving..." : "Save profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PaymentMethodSetupDialog(args: {
  clientSecret: string
  defaultBillingEmail?: string
  onClose: () => void
  resolvedTheme: string | null | undefined
}) {
  return (
    <Dialog onOpenChange={(open) => !open && args.onClose()} open>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add payment method</DialogTitle>
          <DialogDescription>
            Save a payment method to Stripe for renewals and in-app subscription
            changes.
          </DialogDescription>
        </DialogHeader>

        {stripePromise ? (
          <Elements
            key={args.clientSecret}
            options={{
              appearance: getStripeElementsAppearance(args.resolvedTheme),
              clientSecret: args.clientSecret,
            }}
            stripe={stripePromise}
          >
            <CheckoutPaymentForm
              clientSecret={args.clientSecret}
              defaultBillingEmail={args.defaultBillingEmail}
              returnUrl="/settings/billing"
              secretType="setup_intent"
              submitLabel="Save payment method"
              subtitle="Stripe will attach this payment method to your billing customer for future billing."
              title="Payment details"
            />
          </Elements>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Stripe failed to load</AlertTitle>
            <AlertDescription>
              The publishable key is missing or Stripe.js could not initialize.
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  )
}

function SubscriptionManagementDialog(args: {
  catalogPending: boolean
  changePending: boolean
  confirmation: SubscriptionConfirmationState | null
  onClose: () => void
  onConfirmCancellation: () => void
  onIntervalChange: (interval: BillingInterval) => void
  onPlanChange: (planKey: string) => void
  onPreview: () => void
  onResume: () => void
  onSubmitChange: () => void
  preview: BillingChangePreview | null
  previewPending: boolean
  pricingPlans: PricingCatalogPlan[]
  profileEmail?: string | null
  reactivatePending: boolean
  resolvedTheme: string | null | undefined
  selectedPlan: PricingCatalogPlan | null
  state: SubscriptionDialogState
  subscription: BillingCenterSubscription
}) {
  const selectedPrice =
    args.selectedPlan &&
    (args.state.interval === "year"
      ? args.selectedPlan.pricing.year
      : args.selectedPlan.pricing.month)

  return (
    <Dialog onOpenChange={(open) => !open && args.onClose()} open>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100%-1.5rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manage subscription</DialogTitle>
          <DialogDescription>
            Review the current Stripe subscription state first, then apply an
            allowed change from this dialog.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <BillingValue
                label="Product"
                value={args.subscription.productName}
              />
              <BillingValue
                label="Current price"
                value={getSubscriptionAmountLabel(args.subscription)}
              />
              <BillingValue
                label="Status"
                value={
                  <Badge
                    variant={getSubscriptionBadgeVariant(
                      args.subscription.status
                    )}
                  >
                    {formatBillingStatusLabel(args.subscription.status)}
                  </Badge>
                }
              />
              <BillingValue
                label="Renewal"
                value={getSubscriptionRenewalLabel(args.subscription)}
              />
              <BillingValue
                label="Started"
                value={formatDateLabel(args.subscription.startedAt)}
              />
              <BillingValue
                label="Quantity"
                value={String(args.subscription.quantity)}
              />
              <BillingValue
                label="Default payment method"
                value={
                  args.subscription.defaultPaymentMethodSummary
                    ? getCardBrandSummary(
                        args.subscription.defaultPaymentMethodSummary.brand,
                        args.subscription.defaultPaymentMethodSummary.last4
                      )
                    : "No default payment method"
                }
              />
              <BillingValue
                label="Reference"
                value={args.subscription.stripeSubscriptionId}
                valueClassName="break-all font-mono text-xs text-foreground/90"
              />
            </div>

            {args.subscription.scheduledChange ? (
              <div className="mt-4 rounded-lg border border-border/70 bg-background/70 px-3 py-3 text-sm text-muted-foreground">
                {args.subscription.scheduledChange.type === "cancel"
                  ? `This subscription is scheduled to cancel on ${formatDateLabel(args.subscription.scheduledChange.effectiveAt)}.`
                  : `This subscription is scheduled to move to ${args.subscription.scheduledChange.planName ?? args.subscription.scheduledChange.planKey ?? "another plan"} on ${formatDateLabel(args.subscription.scheduledChange.effectiveAt)}.`}
              </div>
            ) : null}
          </div>

          {args.subscription.isManageable ? (
            <div className="grid gap-4">
              <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-4">
                <div className="flex flex-col gap-1">
                  <div className="font-medium">
                    Change plan or billing interval
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Immediate upgrades are invoiced through Stripe. Downgrades
                    and lateral changes are scheduled for the next renewal when
                    Stripe requires it.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel>Billing interval</FieldLabel>
                    <NativeSelect
                      onChange={(event) =>
                        args.onIntervalChange(
                          event.target.value as BillingInterval
                        )
                      }
                      value={args.state.interval}
                    >
                      <NativeSelectOption value="month">
                        Monthly
                      </NativeSelectOption>
                      <NativeSelectOption value="year">
                        Yearly
                      </NativeSelectOption>
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel>Target plan</FieldLabel>
                    <NativeSelect
                      onChange={(event) =>
                        args.onPlanChange(event.target.value)
                      }
                      value={args.state.planKey}
                    >
                      {args.pricingPlans.map((plan) => {
                        const price =
                          args.state.interval === "year"
                            ? plan.pricing.year
                            : plan.pricing.month

                        return (
                          <NativeSelectOption
                            key={plan.planKey}
                            value={plan.planKey}
                          >
                            {plan.name}
                            {price
                              ? ` (${formatCurrencyAmount(price.amount, price.currency)} / ${price.interval})`
                              : " (not sold on this interval)"}
                          </NativeSelectOption>
                        )
                      })}
                    </NativeSelect>
                  </Field>
                </div>

                {args.catalogPending ? (
                  <div className="mt-4 rounded-lg border border-border/70 bg-muted/10 px-3 py-3 text-sm text-muted-foreground">
                    Loading the current pricing catalog.
                  </div>
                ) : null}

                {!args.catalogPending && !selectedPrice ? (
                  <Alert className="mt-4" variant="destructive">
                    <AlertTitle>Plan change unavailable</AlertTitle>
                    <AlertDescription>
                      The selected plan does not currently expose a Stripe price
                      for this billing interval.
                    </AlertDescription>
                  </Alert>
                ) : null}

                {args.preview ? (
                  <div className="mt-4 rounded-lg border border-border/70 bg-muted/10 px-4 py-4">
                    <div className="font-medium">Change summary</div>
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {args.preview.summary}
                    </p>
                    <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                      <BillingValue
                        label="Current amount"
                        value={
                          args.subscription.currency
                            ? formatCurrencyAmount(
                                args.preview.currentAmount,
                                args.subscription.currency
                              )
                            : "Not available"
                        }
                      />
                      <BillingValue
                        label="Target amount"
                        value={
                          selectedPrice
                            ? formatCurrencyAmount(
                                args.preview.targetAmount,
                                selectedPrice.currency
                              )
                            : "Not available"
                        }
                      />
                      <BillingValue
                        label="Due now"
                        value={
                          selectedPrice
                            ? formatCurrencyAmount(
                                args.preview.amountDueNow,
                                selectedPrice.currency
                              )
                            : "Not available"
                        }
                      />
                      <BillingValue
                        label="Effective date"
                        value={formatDateLabel(args.preview.effectiveAt)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={
                      args.catalogPending ||
                      !selectedPrice ||
                      args.previewPending
                    }
                    onClick={args.onPreview}
                    variant="outline"
                  >
                    {args.previewPending ? "Reviewing..." : "Review change"}
                  </Button>
                  <Button
                    disabled={
                      args.catalogPending ||
                      !selectedPrice ||
                      !args.preview ||
                      args.changePending
                    }
                    onClick={args.onSubmitChange}
                  >
                    {args.changePending ? "Applying..." : "Apply change"}
                  </Button>
                  {args.subscription.cancelAtPeriodEnd ? (
                    <Button
                      disabled={args.reactivatePending}
                      onClick={args.onResume}
                      variant="outline"
                    >
                      {args.reactivatePending
                        ? "Resuming..."
                        : "Resume renewal"}
                    </Button>
                  ) : (
                    <Button
                      onClick={args.onConfirmCancellation}
                      variant="outline"
                    >
                      Cancel at period end
                    </Button>
                  )}
                </div>
              </div>

              {args.confirmation ? (
                <div className="rounded-lg border border-border/70 bg-background/60 px-4 py-4">
                  <div className="flex flex-col gap-1">
                    <div className="font-medium">Confirm billing in Stripe</div>
                    <p className="text-sm text-muted-foreground">
                      Stripe needs payment confirmation before this subscription
                      change can complete.
                    </p>
                  </div>
                  <div className="mt-4">
                    {stripePromise ? (
                      <Elements
                        key={args.confirmation.clientSecret}
                        options={{
                          appearance: getStripeElementsAppearance(
                            args.resolvedTheme
                          ),
                          clientSecret: args.confirmation.clientSecret,
                        }}
                        stripe={stripePromise}
                      >
                        <CheckoutPaymentForm
                          clientSecret={args.confirmation.clientSecret}
                          defaultBillingEmail={args.profileEmail ?? undefined}
                          returnUrl="/settings/billing"
                          secretType={args.confirmation.secretType}
                          submitLabel="Confirm billing change"
                          subtitle="Stripe will only finalize the subscription change after this confirmation succeeds."
                          title="Payment confirmation"
                        />
                      </Elements>
                    ) : (
                      <Alert variant="destructive">
                        <AlertTitle>Stripe failed to load</AlertTitle>
                        <AlertDescription>
                          The payment confirmation form could not be
                          initialized.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <Alert>
              <AlertTitle>Management unavailable</AlertTitle>
              <AlertDescription>
                This subscription is no longer in a Stripe-managed state that
                can be changed in-app. Review the record above and start a new
                checkout only if you need a fresh subscription.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function BillingSettingsView({
  checkoutEnabled,
}: {
  checkoutEnabled: boolean
}) {
  const { resolvedTheme } = useTheme()
  const billingCenterQuery = useBillingCenter()
  const pricingCatalogQuery = usePricingCatalog()
  const syncBillingCenter = useSyncBillingCenter()
  const updateBillingProfile = useUpdateBillingProfile()
  const createPaymentMethodSetupIntent = useCreatePaymentMethodSetupIntent()
  const setDefaultPaymentMethod = useSetDefaultPaymentMethod()
  const removePaymentMethod = useRemovePaymentMethod()
  const previewSubscriptionChange = usePreviewSubscriptionChange()
  const updateSubscription = useUpdateSubscriptionPlan()
  const cancelSubscription = useCancelSubscription()
  const reactivateSubscription = useReactivateSubscription()

  const [billingProfileDialogOpen, setBillingProfileDialogOpen] =
    useState(false)
  const [billingProfileForm, setBillingProfileForm] =
    useState<BillingProfileFormState | null>(null)
  const [paymentMethodClientSecret, setPaymentMethodClientSecret] = useState<
    string | null
  >(null)
  const [paymentMethodPendingRemoval, setPaymentMethodPendingRemoval] =
    useState<BillingCenterPaymentMethod | null>(null)
  const [subscriptionDialogState, setSubscriptionDialogState] =
    useState<SubscriptionDialogState | null>(null)
  const [subscriptionChangePreview, setSubscriptionChangePreview] =
    useState<BillingChangePreview | null>(null)
  const [subscriptionConfirmation, setSubscriptionConfirmation] =
    useState<SubscriptionConfirmationState | null>(null)
  const [subscriptionPendingCancellation, setSubscriptionPendingCancellation] =
    useState<BillingCenterSubscription | null>(null)
  const [didAttemptStripeResync, setDidAttemptStripeResync] = useState(false)

  const billingCenter = billingCenterQuery.data
  const pricingPlans =
    pricingCatalogQuery.data?.plans.filter(
      (plan) => plan.planType === "paid" && plan.active
    ) ?? []
  const selectedSubscription = subscriptionDialogState
    ? (billingCenter?.subscriptions.find(
        (subscription) =>
          subscription.stripeSubscriptionId ===
          subscriptionDialogState.stripeSubscriptionId
      ) ?? null)
    : null
  const selectedSubscriptionPlan =
    pricingPlans.find(
      (plan) => plan.planKey === subscriptionDialogState?.planKey
    ) ?? null

  useEffect(() => {
    if (
      subscriptionDialogState &&
      pricingPlans.length > 0 &&
      !pricingPlans.some(
        (plan) => plan.planKey === subscriptionDialogState.planKey
      )
    ) {
      setSubscriptionDialogState((current) =>
        current
          ? {
              ...current,
              planKey: pricingPlans[0]?.planKey ?? current.planKey,
            }
          : current
      )
    }
  }, [pricingPlans, subscriptionDialogState])

  useEffect(() => {
    if (
      !billingCenter ||
      didAttemptStripeResync ||
      syncBillingCenter.isPending ||
      !shouldAttemptBackgroundStripeResync(billingCenter)
    ) {
      return
    }

    setDidAttemptStripeResync(true)
    void syncBillingCenter.mutateAsync().catch(() => {
      toast.error("Unable to refresh the latest Stripe billing state.")
    })
  }, [billingCenter, didAttemptStripeResync, syncBillingCenter])

  async function handleRefresh() {
    try {
      await syncBillingCenter.mutateAsync()
      toast.success("Billing data refreshed.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to refresh billing data."
      )
    }
  }

  function openBillingProfileDialog() {
    if (!billingCenter) {
      return
    }

    setBillingProfileForm(
      createBillingProfileFormState(billingCenter.billingProfile)
    )
    setBillingProfileDialogOpen(true)
  }

  async function handleSaveBillingProfile() {
    if (!billingProfileForm) {
      return
    }

    try {
      await updateBillingProfile.mutateAsync({
        address: {
          city: billingProfileForm.city,
          country: billingProfileForm.country,
          line1: billingProfileForm.line1,
          line2: billingProfileForm.line2,
          postalCode: billingProfileForm.postalCode,
          state: billingProfileForm.state,
        },
        businessName: billingProfileForm.businessName,
        email: billingProfileForm.email,
        name: billingProfileForm.name,
        phone: billingProfileForm.phone,
      })
      setBillingProfileDialogOpen(false)
      toast.success("Billing profile updated.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to update the billing profile."
      )
    }
  }

  async function handleAddPaymentMethod() {
    try {
      const result = await createPaymentMethodSetupIntent.mutateAsync()
      setPaymentMethodClientSecret(result.clientSecret)
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to start the payment method flow."
      )
    }
  }

  async function handleMakeDefaultPaymentMethod(
    paymentMethod: BillingCenterPaymentMethod
  ) {
    try {
      await setDefaultPaymentMethod.mutateAsync({
        paymentMethodId: paymentMethod.stripePaymentMethodId,
      })
      toast.success("Default payment method updated.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to update the default payment method."
      )
    }
  }

  async function handleConfirmPaymentMethodRemoval() {
    if (!paymentMethodPendingRemoval) {
      return
    }

    try {
      await removePaymentMethod.mutateAsync({
        paymentMethodId: paymentMethodPendingRemoval.stripePaymentMethodId,
      })
      setPaymentMethodPendingRemoval(null)
      toast.success("Payment method removed.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to remove the payment method."
      )
    }
  }

  function openSubscriptionDialog(subscription: BillingCenterSubscription) {
    const initialPlanKey =
      pricingPlans.find((plan) => plan.planKey === subscription.planKey)
        ?.planKey ??
      pricingPlans[0]?.planKey ??
      subscription.planKey

    setSubscriptionDialogState({
      interval: subscription.billingInterval,
      planKey: initialPlanKey,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
    })
    setSubscriptionChangePreview(null)
    setSubscriptionConfirmation(null)
  }

  async function handlePreviewSubscriptionUpdate() {
    if (!subscriptionDialogState || !selectedSubscription) {
      return
    }

    try {
      const result = await previewSubscriptionChange.mutateAsync({
        interval: subscriptionDialogState.interval,
        planKey: subscriptionDialogState.planKey,
        stripeSubscriptionId: selectedSubscription.stripeSubscriptionId,
      })
      setSubscriptionChangePreview(result)
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to preview the subscription change."
      )
    }
  }

  async function handleApplySubscriptionUpdate() {
    if (!subscriptionDialogState || !selectedSubscription) {
      return
    }

    try {
      const result = await updateSubscription.mutateAsync({
        interval: subscriptionDialogState.interval,
        planKey: subscriptionDialogState.planKey,
        stripeSubscriptionId: selectedSubscription.stripeSubscriptionId,
      })

      if (
        result.clientSecret &&
        result.requiresConfirmation &&
        result.secretType &&
        result.secretType !== "none"
      ) {
        setSubscriptionConfirmation({
          clientSecret: result.clientSecret,
          secretType: result.secretType,
        })
        toast.success("Stripe is ready for payment confirmation.")
        return
      }

      setSubscriptionDialogState(null)
      setSubscriptionChangePreview(null)
      setSubscriptionConfirmation(null)
      toast.success(getSubscriptionChangeActionLabel(result))
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to update the subscription."
      )
    }
  }

  async function handleResumeSubscription() {
    if (!selectedSubscription) {
      return
    }

    try {
      await reactivateSubscription.mutateAsync({
        stripeSubscriptionId: selectedSubscription.stripeSubscriptionId,
      })
      setSubscriptionDialogState(null)
      setSubscriptionChangePreview(null)
      setSubscriptionConfirmation(null)
      toast.success("Subscription renewed.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to resume the subscription."
      )
    }
  }

  async function handleConfirmSubscriptionCancellation() {
    if (!subscriptionPendingCancellation) {
      return
    }

    try {
      await cancelSubscription.mutateAsync({
        stripeSubscriptionId:
          subscriptionPendingCancellation.stripeSubscriptionId,
      })
      setSubscriptionPendingCancellation(null)
      setSubscriptionDialogState(null)
      setSubscriptionChangePreview(null)
      setSubscriptionConfirmation(null)
      toast.success("Subscription cancellation scheduled.")
    } catch (error) {
      toast.error(
        error instanceof BillingClientError
          ? error.message
          : "Unable to schedule the subscription cancellation."
      )
    }
  }

  if (billingCenterQuery.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-5 w-96 max-w-full rounded-lg" />
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-80 rounded-lg" />
        </div>
        <Skeleton className="h-72 rounded-lg" />
        <Skeleton className="h-80 rounded-lg" />
      </div>
    )
  }

  if (billingCenterQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Billing failed to load</AlertTitle>
        <AlertDescription>
          The billing center could not load the current Stripe-backed account
          state.
        </AlertDescription>
      </Alert>
    )
  }

  if (!billingCenter) {
    return (
      <Alert>
        <AlertTitle>Billing unavailable</AlertTitle>
        <AlertDescription>
          Billing data is not available for this account yet.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Manage your billing profile, saved payment methods, subscriptions,
            and invoices without leaving the app.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 lg:items-end">
          <div className="text-sm text-muted-foreground">
            Last synced {formatDateTimeLabel(billingCenter.lastSyncedAt)}
          </div>
          <Button
            disabled={syncBillingCenter.isPending}
            onClick={() => void handleRefresh()}
            variant="outline"
          >
            <IconRefresh data-icon="inline-start" />
            {syncBillingCenter.isPending ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BillingProfileCard
          onEdit={openBillingProfileDialog}
          profile={billingCenter.billingProfile}
        />
        <PaymentMethodsCard
          addDisabled={!getStripePublishableKey()}
          addPending={createPaymentMethodSetupIntent.isPending}
          onAdd={() => void handleAddPaymentMethod()}
          onMakeDefault={(paymentMethod) =>
            void handleMakeDefaultPaymentMethod(paymentMethod)
          }
          onRemove={setPaymentMethodPendingRemoval}
          paymentMethods={billingCenter.paymentMethods}
          setDefaultPending={setDefaultPaymentMethod.isPending}
        />
      </div>

      <SubscriptionsCard
        checkoutEnabled={checkoutEnabled}
        onOpenSubscription={openSubscriptionDialog}
        portalMode={billingCenter.portalMode}
        subscriptions={billingCenter.subscriptions}
      />

      <InvoiceHistoryTable invoices={billingCenter.invoices} />

      {billingProfileDialogOpen && billingProfileForm ? (
        <BillingProfileDialog
          onClose={() => setBillingProfileDialogOpen(false)}
          onFormChange={(updater) =>
            setBillingProfileForm((current) =>
              current ? updater(current) : current
            )
          }
          onSave={() => void handleSaveBillingProfile()}
          pending={updateBillingProfile.isPending}
          profile={billingCenter.billingProfile}
          state={billingProfileForm}
        />
      ) : null}

      {paymentMethodClientSecret ? (
        <PaymentMethodSetupDialog
          clientSecret={paymentMethodClientSecret}
          defaultBillingEmail={billingCenter.billingProfile.email ?? undefined}
          onClose={() => setPaymentMethodClientSecret(null)}
          resolvedTheme={resolvedTheme}
        />
      ) : null}

      {subscriptionDialogState && selectedSubscription ? (
        <SubscriptionManagementDialog
          catalogPending={pricingCatalogQuery.isPending}
          changePending={updateSubscription.isPending}
          confirmation={subscriptionConfirmation}
          onClose={() => {
            setSubscriptionDialogState(null)
            setSubscriptionChangePreview(null)
            setSubscriptionConfirmation(null)
          }}
          onConfirmCancellation={() =>
            setSubscriptionPendingCancellation(selectedSubscription)
          }
          onIntervalChange={(interval) => {
            setSubscriptionDialogState((current) =>
              current ? { ...current, interval } : current
            )
            setSubscriptionChangePreview(null)
            setSubscriptionConfirmation(null)
          }}
          onPlanChange={(planKey) => {
            setSubscriptionDialogState((current) =>
              current ? { ...current, planKey } : current
            )
            setSubscriptionChangePreview(null)
            setSubscriptionConfirmation(null)
          }}
          onPreview={() => void handlePreviewSubscriptionUpdate()}
          onResume={() => void handleResumeSubscription()}
          onSubmitChange={() => void handleApplySubscriptionUpdate()}
          preview={subscriptionChangePreview}
          previewPending={previewSubscriptionChange.isPending}
          pricingPlans={pricingPlans}
          profileEmail={billingCenter.billingProfile.email}
          reactivatePending={reactivateSubscription.isPending}
          resolvedTheme={resolvedTheme}
          selectedPlan={selectedSubscriptionPlan}
          state={subscriptionDialogState}
          subscription={selectedSubscription}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(open) => !open && setPaymentMethodPendingRemoval(null)}
        open={Boolean(paymentMethodPendingRemoval)}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader className="items-start text-left">
            <AlertDialogTitle>Remove payment method</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved payment method from Stripe for this billing
              customer. Renewal attempts will stop using it immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {paymentMethodPendingRemoval ? (
            <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-4 text-sm">
              <div className="font-medium">
                {getPaymentMethodSummary(paymentMethodPendingRemoval)}
              </div>
              <div className="mt-1 text-muted-foreground">
                {paymentMethodPendingRemoval.isDefault
                  ? "Set another payment method as default before removing this one."
                  : "This action cannot be undone from the billing center."}
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep payment method</AlertDialogCancel>
            <AlertDialogAction
              disabled={removePaymentMethod.isPending}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmPaymentMethodRemoval()
              }}
            >
              {removePaymentMethod.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) =>
          !open && setSubscriptionPendingCancellation(null)
        }
        open={Boolean(subscriptionPendingCancellation)}
      >
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader className="items-start text-left">
            <AlertDialogTitle>Cancel at period end</AlertDialogTitle>
            <AlertDialogDescription>
              Stripe will keep the current subscription active until the end of
              the paid period, then stop renewal.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {subscriptionPendingCancellation ? (
            <div className="rounded-lg border border-border/70 bg-muted/10 px-4 py-4 text-sm">
              <div className="font-medium">
                {subscriptionPendingCancellation.productName}
              </div>
              <div className="mt-1 text-muted-foreground">
                {subscriptionPendingCancellation.currentPeriodEnd
                  ? `Access will remain active until ${formatDateLabel(subscriptionPendingCancellation.currentPeriodEnd)}.`
                  : "Stripe did not return a current period end for this subscription."}
              </div>
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelSubscription.isPending}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmSubscriptionCancellation()
              }}
            >
              {cancelSubscription.isPending
                ? "Scheduling..."
                : "Schedule cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {pricingCatalogQuery.isError ? (
        <Alert>
          <AlertTitle>Plan catalog unavailable</AlertTitle>
          <AlertDescription>
            Subscription records are available, but pricing changes are
            temporarily unavailable until the billing catalog loads again.
          </AlertDescription>
        </Alert>
      ) : null}

      {billingCenter.portalMode === "acquisition" &&
      billingCenter.subscriptions.length > 0 ? (
        <Alert>
          <AlertTitle>Managed subscription not currently active</AlertTitle>
          <AlertDescription>
            Historical subscription records remain visible here. Start a new
            checkout only if you want to create a fresh paid subscription for
            this account.
          </AlertDescription>
        </Alert>
      ) : null}

      {billingCenter.subscriptions.some(
        (subscription) =>
          subscription.status === "past_due" ||
          subscription.status === "incomplete" ||
          subscription.status === "unpaid"
      ) ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Billing attention required</AlertTitle>
          <AlertDescription>
            One or more subscriptions need payment follow-up. Review the
            affected subscription in the management dialog before attempting
            additional changes.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
