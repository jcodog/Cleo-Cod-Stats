import { BillingSettingsView } from "@/features/billing/views/BillingSettingsView"
import { isFlagEnabled } from "@/lib/flags"

export default async function BillingSettingsPage() {
  return (
    <BillingSettingsView checkoutEnabled={await isFlagEnabled("checkout")} />
  )
}
