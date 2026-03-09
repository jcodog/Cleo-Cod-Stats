import Link from "next/link"

import type {
  StaffBillingDashboard,
  StaffManagementDashboard,
} from "@workspace/backend/convex/lib/staffTypes"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Table, TableBody, TableCell, TableRow } from "@workspace/ui/components/table"

export function StaffOverviewView({
  billing,
  management,
}: {
  billing: StaffBillingDashboard
  management: StaffManagementDashboard | null
}) {
  const activity = [
    ...billing.auditLogs.slice(0, 4),
    ...(management?.auditLogs.slice(0, 4) ?? []),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 6)

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">Internal</Badge>
          Staff area
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Operations hub</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Use management for RBAC changes and billing for catalog, Stripe sync,
          and subscription-impacting operations.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,18rem)_minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Management</CardTitle>
            <CardDescription>
              Review role alignment, manage staff access, and audit privileged operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              {management
                ? `${management.users.length} tracked users, ${management.adminCount} admins, ${management.superAdminCount} super-admins`
                : "Admin access required"}
            </div>
            {management ? (
              <Button asChild>
                <Link href="/staff/management">Open management</Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/dashboard">Admin access required</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              Manage plans, features, sync runs, and active subscription impact.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground">
              {billing.plans.length} plans, {billing.features.length} features,{" "}
              {billing.activeSubscriptionCount} active subscriptions
            </div>
            <Button asChild>
              <Link href="/staff/billing">Open billing</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              The most recent role and billing operations across the internal dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="rounded-lg border border-border/70 p-0">
            <Table>
              <TableBody>
                {activity.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="w-44 text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(log.createdAt)}
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal">
                      <div className="font-medium">{log.summary}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {log.actorName}
                      </div>
                    </TableCell>
                    <TableCell className="w-28">
                      <Badge
                        variant={log.result === "success" ? "secondary" : "destructive"}
                      >
                        {log.result}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
