import { redirect } from "next/navigation"

export default async function StaffWebhooksPage() {
  redirect("/staff/subscriptions/audit-log")
}
