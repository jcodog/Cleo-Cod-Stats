import { fetchAction } from "convex/nextjs"

import { api } from "@workspace/backend/convex/_generated/api"
import { StaffAccessState } from "@/features/staff/components/StaffAccessState"
import { StaffManagementView } from "@/features/staff/views/StaffManagementView"
import { requireAdminAccess } from "@/lib/server/staff-auth"

export default async function StaffManagementPage() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    return <StaffAccessState access={access} />
  }

  const initialData = await fetchAction(api.actions.staff.management.getDashboard, {}, {
    token: access.convexToken,
  })

  return <StaffManagementView initialData={initialData} />
}

