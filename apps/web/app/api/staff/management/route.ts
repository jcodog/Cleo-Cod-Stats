import { fetchAction } from "convex/nextjs"
import { NextResponse } from "next/server"

import { api } from "@workspace/backend/convex/_generated/api"
import { requireAdminAccess } from "@/lib/server/staff-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const access = await requireAdminAccess()

  if (!access.ok) {
    return NextResponse.json(access, {
      status: access.reason === "role_mismatch" ? 409 : 403,
    })
  }

  const dashboard = await fetchAction(
    api.actions.staff.management.getDashboard,
    {},
    {
      token: access.convexToken,
    }
  )

  return NextResponse.json(dashboard)
}
