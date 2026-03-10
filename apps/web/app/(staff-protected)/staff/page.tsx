import { fetchAction } from "convex/nextjs"

import { api } from "@workspace/backend/convex/_generated/api"
import { StaffAccessState } from "@/features/staff/components/StaffAccessState"
import { StaffOverviewView } from "@/features/staff/views/StaffOverviewView"
import { requireStaffAccess } from "@/lib/server/staff-auth"

export default async function StaffOverviewPage() {
  const access = await requireStaffAccess()

  if (!access.ok) {
    return <StaffAccessState access={access} />
  }

  const overview = await fetchAction(api.actions.staff.overview.getDashboard, {}, {
    token: access.convexToken,
  })

  return <StaffOverviewView overview={overview} />
}
