import type { ReactNode } from "react"

import { StaffAccessState } from "@/features/staff/components/StaffAccessState"
import { StaffConsoleShell } from "@/features/staff/components/StaffConsoleShell"
import { requireStaffAccess } from "@/lib/server/staff-auth"

export default async function StaffLayout({
  children,
}: {
  children: ReactNode
}) {
  const access = await requireStaffAccess()

  if (!access.ok) {
    return <StaffAccessState access={access} />
  }

  return <StaffConsoleShell role={access.convexRole}>{children}</StaffConsoleShell>
}
