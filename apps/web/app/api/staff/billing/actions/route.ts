import { fetchAction } from "convex/nextjs"
import { NextResponse } from "next/server"

import { api } from "@workspace/backend/convex/_generated/api"
import { billingActionSchema } from "@/features/staff/lib/staff-schemas"
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

  const parsedBody = billingActionSchema.safeParse(body)

  if (!parsedBody.success) {
    return NextResponse.json(
      {
        issues: parsedBody.error.flatten(),
        message: "Invalid staff billing request payload.",
      },
      { status: 400 }
    )
  }

  try {
    const access = await requireStaffApiAccess("staff")
    const action = parsedBody.data

    switch (action.action) {
      case "archiveFeature":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.archiveFeature, action.input, {
            token: access.convexToken,
          })
        )
      case "archivePlan":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.archivePlan, action.input, {
            token: access.convexToken,
          })
        )
      case "previewFeatureArchive":
        return NextResponse.json(
          await fetchAction(
            api.actions.staff.billing.previewFeatureArchive,
            action.input,
            {
              token: access.convexToken,
            }
          )
        )
      case "previewFeatureAssignmentChange":
        return NextResponse.json(
          await fetchAction(
            api.actions.staff.billing.previewFeatureAssignmentChange,
            action.input,
            {
              token: access.convexToken,
            }
          )
        )
      case "previewPlanArchive":
        return NextResponse.json(
          await fetchAction(
            api.actions.staff.billing.previewPlanArchive,
            action.input,
            {
              token: access.convexToken,
            }
          )
        )
      case "previewPriceReplacement":
        return NextResponse.json(
          await fetchAction(
            api.actions.staff.billing.previewPriceReplacement,
            action.input,
            {
              token: access.convexToken,
            }
          )
        )
      case "replacePlanPrice":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.replacePlanPrice, action.input, {
            token: access.convexToken,
          })
        )
      case "runCatalogSync":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.runCatalogSync, {}, {
            token: access.convexToken,
          })
        )
      case "setFeatureAssignment":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.setFeatureAssignment, action.input, {
            token: access.convexToken,
          })
        )
      case "upsertFeature":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.upsertFeature, action.input, {
            token: access.convexToken,
          })
        )
      case "upsertPlan":
        return NextResponse.json(
          await fetchAction(api.actions.staff.billing.upsertPlan, action.input, {
            token: access.convexToken,
          })
        )
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

