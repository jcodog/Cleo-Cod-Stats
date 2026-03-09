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

  const [billing, management] = await Promise.all([
    fetchAction(api.actions.staff.billing.getDashboard, {}, {
      token: access.convexToken,
    }),
    access.convexRole === "admin"
      ? fetchAction(api.actions.staff.management.getDashboard, {}, {
          token: access.convexToken,
        })
      : Promise.resolve(null),
  ])

  return <StaffOverviewView billing={billing} management={management} />
}

