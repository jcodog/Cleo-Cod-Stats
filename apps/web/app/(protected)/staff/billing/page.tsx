import { fetchAction } from "convex/nextjs"

import { api } from "@workspace/backend/convex/_generated/api"
import { StaffAccessState } from "@/features/staff/components/StaffAccessState"
import { StaffBillingView } from "@/features/staff/views/StaffBillingView"
import { requireStaffAccess } from "@/lib/server/staff-auth"

export default async function StaffBillingPage() {
  const access = await requireStaffAccess()

  if (!access.ok) {
    return <StaffAccessState access={access} />
  }

  const initialData = await fetchAction(api.actions.staff.billing.getDashboard, {}, {
    token: access.convexToken,
  })

  return <StaffBillingView initialData={initialData} />
}

