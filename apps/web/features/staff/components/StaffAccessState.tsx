import Link from "next/link"

import type { StaffAccessViewState } from "@workspace/backend/convex/lib/staffTypes"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"

export function StaffAccessState({
  access,
}: {
  access: Extract<StaffAccessViewState, { ok: false }>
}) {
  const repairHint =
    access.convexRole && !access.clerkRole
      ? `Convex already reports ${access.convexRole}. Clerk public metadata still needs to match it.`
      : access.convexRole && access.clerkRole && access.convexRole !== access.clerkRole
        ? `Convex is ${access.convexRole}, while Clerk is ${access.clerkRole}. Clerk metadata needs to be synchronized.`
        : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 py-12">
      <Card className="border-border/70">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Staff access is currently restricted</CardTitle>
            <Badge variant="outline">Requires {access.requiredRole}</Badge>
          </div>
          <CardDescription>{access.supportMessage}</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <Alert>
            <AlertTitle>Access check failed closed</AlertTitle>
            <AlertDescription>
              Clerk and Convex must both present the same elevated role before
              this staff surface opens.
              {repairHint ? ` ${repairHint}` : ""}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Clerk role</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {access.clerkRole ?? "Missing"}
              </p>
            </div>
            <div className="rounded-lg border border-border/70 bg-muted/30 p-4">
              <p className="text-sm font-medium">Convex role</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {access.convexRole ?? "Missing"}
              </p>
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/dashboard">Return to dashboard</Link>
            </Button>
            <Button asChild>
              <Link href="/account">Open account settings</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
