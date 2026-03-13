import { redirect } from "next/navigation"

export default async function StaffBillingWebhooksPage() {
  redirect("/staff/subscriptions/audit-log")
}
