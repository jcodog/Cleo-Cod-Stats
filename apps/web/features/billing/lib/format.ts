import type { BillingInterval } from "@/features/billing/lib/billing-types"

export function formatCurrencyAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(amount / 100)
}

export function formatBillingInterval(interval: BillingInterval) {
  return interval === "year" ? "yearly" : "monthly"
}

export function formatDateLabel(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return "Not set"
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(value)
}

export function formatDateTimeLabel(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) {
    return "Not set"
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
}

export function formatCountryLabel(value: string | null | undefined) {
  if (!value) {
    return "Not set"
  }

  try {
    const displayNames = new Intl.DisplayNames(["en-GB"], {
      type: "region",
    })

    return displayNames.of(value.toUpperCase()) ?? value.toUpperCase()
  } catch {
    return value.toUpperCase()
  }
}

export function formatBillingStatusLabel(value: string) {
  return value.replaceAll("_", " ")
}

export function formatPaymentMethodTypeLabel(value: string) {
  return value.replaceAll("_", " ")
}

export function formatCardBrandLabel(value: string | null | undefined) {
  if (!value) {
    return "Card"
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
