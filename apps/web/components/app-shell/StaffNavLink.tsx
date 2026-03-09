import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { getAuthorizedStaffContext } from "@/lib/server/staff-auth"

export async function StaffNavLink() {
  const access = await getAuthorizedStaffContext("staff")

  if (!access.ok) {
    return null
  }

  return (
    <Button asChild size="sm" variant="ghost">
      <Link href="/staff">Staff</Link>
    </Button>
  )
}
