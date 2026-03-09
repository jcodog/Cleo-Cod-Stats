import { fetchAction } from "convex/nextjs"
import { NextResponse } from "next/server"

import { api } from "@workspace/backend/convex/_generated/api"
import { managementActionSchema } from "@/features/staff/lib/staff-schemas"
import {
  StaffRouteAccessError,
  requireStaffApiAccess,
} from "@/lib/server/staff-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: unknown

  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 }
    )
  }

  const parsedBody = managementActionSchema.safeParse(body)

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        issues: parsedBody.error.flatten(),
        message: "Invalid staff management request payload.",
      },
      { status: 400 }
    )
  }

  try {
    const access = await requireStaffApiAccess("admin")
    const action = parsedBody.data

    switch (action.action) {
      case "updateUserRole": {
        const result = await fetchAction(
          api.actions.staff.management.updateUserRole,
          action.input,
          {
            token: access.convexToken,
          }
        )

        return NextResponse.json(result)
      }
    }
  } catch (error) {
    if (error instanceof StaffRouteAccessError) {
      return NextResponse.json(error.context, { status: error.status })
    }

    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Staff action failed.",
      },
      { status: 500 }
    )
  }
}

