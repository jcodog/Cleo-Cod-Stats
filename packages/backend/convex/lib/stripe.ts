import Stripe from "stripe"

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-02-25.clover" as const

export const STRIPE_CATALOG_APP = "cod-stats-tracker"

let cachedStripe: Stripe | null = null
let cachedSecretKey: string | null = null

export function getStripe() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY")
  }

  if (cachedStripe && cachedSecretKey === stripeSecretKey) {
    return cachedStripe
  }

  cachedSecretKey = stripeSecretKey
  cachedStripe = new Stripe(stripeSecretKey, {
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
  })

  return cachedStripe
}
