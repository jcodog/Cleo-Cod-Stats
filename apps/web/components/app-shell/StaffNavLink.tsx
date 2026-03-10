import Link from "next/link"
import { IconShieldLock } from "@tabler/icons-react"

import { Button } from "@workspace/ui/components/button"
import { getAuthorizedStaffContext } from "@/lib/server/staff-auth"

export async function StaffNavLink() {
  const access = await getAuthorizedStaffContext("staff")

  if (!access.ok) {
    return null
  }

  return (
    <Button asChild size="sm" variant="outline">
      <Link href="/staff">
        <IconShieldLock aria-hidden="true" data-icon="inline-start" />
        Staff Console
      </Link>
    </Button>
  )
}
