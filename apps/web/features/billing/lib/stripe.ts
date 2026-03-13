import { loadStripe } from "@stripe/stripe-js"
import type { Appearance } from "@stripe/stripe-js"

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

export const stripePromise = stripePublishableKey
  ? loadStripe(stripePublishableKey)
  : null

export function getStripePublishableKey() {
  return stripePublishableKey
}

export function getStripeElementsAppearance(
  resolvedTheme: string | null | undefined
): Appearance {
  if (resolvedTheme === "dark") {
    return {
      labels: "floating",
      theme: "night",
      variables: {
        borderRadius: "12px",
        colorBackground: "#111317",
        colorDanger: "#ef4444",
        colorPrimary: "#0f766e",
        colorPrimaryText: "#f8fafc",
        colorText: "#f4f4f5",
        colorTextSecondary: "#a1a1aa",
        fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
      },
      rules: {
        ".AccordionItem": {
          backgroundColor: "#111317",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "none",
        },
        ".Input": {
          backgroundColor: "#151821",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "none",
        },
        ".Input:focus": {
          border: "1px solid rgba(15,118,110,0.8)",
          boxShadow: "0 0 0 3px rgba(15,118,110,0.18)",
        },
        ".Label": {
          color: "#d4d4d8",
        },
        ".Tab": {
          backgroundColor: "#151821",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "none",
        },
        ".Tab--selected": {
          backgroundColor: "#1a1f29",
          borderColor: "rgba(15,118,110,0.65)",
          boxShadow: "0 0 0 1px rgba(15,118,110,0.18)",
        },
      },
    }
  }

  return {
    labels: "floating",
    theme: "flat",
    variables: {
      borderRadius: "12px",
      colorBackground: "#ffffff",
      colorDanger: "#dc2626",
      colorPrimary: "#0f766e",
      colorPrimaryText: "#ffffff",
      colorText: "#111827",
      colorTextSecondary: "#6b7280",
      fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
    },
    rules: {
      ".AccordionItem": {
        backgroundColor: "#ffffff",
        border: "1px solid rgba(17,24,39,0.1)",
        boxShadow: "none",
      },
      ".Input": {
        backgroundColor: "#ffffff",
        border: "1px solid rgba(17,24,39,0.12)",
        boxShadow: "none",
      },
      ".Input:focus": {
        border: "1px solid rgba(15,118,110,0.75)",
        boxShadow: "0 0 0 3px rgba(15,118,110,0.12)",
      },
      ".Label": {
        color: "#374151",
      },
      ".Tab": {
        backgroundColor: "#ffffff",
        border: "1px solid rgba(17,24,39,0.1)",
        boxShadow: "none",
      },
      ".Tab--selected": {
        backgroundColor: "#f8fafc",
        borderColor: "rgba(15,118,110,0.45)",
        boxShadow: "0 0 0 1px rgba(15,118,110,0.12)",
      },
    },
  }
}
