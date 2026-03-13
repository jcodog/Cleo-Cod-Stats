import { fetchAction } from "convex/nextjs"

import { api } from "@workspace/backend/convex/_generated/api"

import { StaffAccessState } from "@/features/staff/components/StaffAccessState"
import { StaffWebhookEventsView } from "@/features/staff/views/StaffWebhookEventsView"
import { requireAdminAccess } from "@/lib/server/staff-auth"

export default async function StaffSubscriptionsAuditLogPage() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    return <StaffAccessState access={access} />
  }

  const initialData = await fetchAction(
    api.actions.staff.billing.getWebhookDashboard,
    {},
    {
      token: access.convexToken,
    }
  )

  return <StaffWebhookEventsView initialData={initialData} />
}
