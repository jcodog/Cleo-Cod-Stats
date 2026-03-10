import type { ReactNode } from "react"

import type { AuditLogResult } from "@workspace/backend/convex/lib/staffRoles"
import type { StaffOverviewDashboard } from "@workspace/backend/convex/lib/staffTypes"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { STAFF_CONSOLE_TITLE } from "@/features/staff/lib/staff-navigation"

function getAuditResultVariant(result: AuditLogResult) {
  if (result === "success") {
    return "secondary"
  }

  if (result === "error") {
    return "destructive"
  }

  return "outline"
}

function getActivityArea(entityType: string) {
  return entityType.startsWith("billing") ? "Billing" : "Access"
}

function getBarWidth(value: number, max: number) {
  if (max <= 0 || value <= 0) {
    return "0%"
  }

  return `${Math.max((value / max) * 100, 8)}%`
}

function getSyncBadge(args: StaffOverviewDashboard["lastSync"]) {
  if (!args) {
    return <Badge variant="outline">Not run yet</Badge>
  }

  if (args.result === "success") {
    return <Badge variant="secondary">Healthy</Badge>
  }

  if (args.result === "error") {
    return <Badge variant="destructive">Needs review</Badge>
  }

  return <Badge variant="outline">Warnings</Badge>
}

function SummaryPanel({
  description,
  rows,
  title,
}: {
  description: string
  rows: Array<{
    label: string
    value: ReactNode
  }>
  title: string
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3">
          {rows.map((row) => (
            <div
              className="flex min-w-0 items-baseline justify-between gap-4"
              key={row.label}
            >
              <dt className="text-sm text-muted-foreground">{row.label}</dt>
              <dd className="text-right text-sm font-semibold tabular-nums">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export function StaffOverviewView({
  overview,
}: {
  overview: StaffOverviewDashboard
}) {
  const subscriptionBreakdown = overview.subscriptionStatusCounts.map(
    ({ count, status }) => ({
      count,
      label:
        status === "past_due"
          ? "Past due"
          : status === "trialing"
            ? "Trialing"
            : status === "paused"
              ? "Paused"
                : "Active",
    })
  )
  const totalSubscriptions = subscriptionBreakdown.reduce(
    (sum, item) => sum + item.count,
    0
  )
  const activityBreakdown = overview.activityTimeline.map(({ count, dayStart }) => ({
    count,
    label: new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
    }).format(dayStart),
  }))
  const maxSubscriptionCount = Math.max(
    ...subscriptionBreakdown.map((item) => item.count),
    0
  )
  const maxActivityCount = Math.max(...activityBreakdown.map((item) => item.count), 0)

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Overview
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Monitor user coverage, billing health, and recent privileged activity from
          the {` ${STAFF_CONSOLE_TITLE.toLowerCase()}`}.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <SummaryPanel
          description="Role counts derived from tracked Convex user records."
          rows={[
            {
              label: "Tracked users",
              value: overview.counts.trackedUsers,
            },
            {
              label: "Staff",
              value: overview.counts.staffUsers,
            },
            {
              label: "Admins",
              value: overview.counts.adminUsers,
            },
            {
              label: "Super-admins",
              value: overview.counts.superAdminUsers,
            },
          ]}
          title="People"
        />
        <SummaryPanel
          description="Current catalog coverage and sync gaps that still need cleanup."
          rows={[
            {
              label: "Plans",
              value: overview.counts.billingPlans,
            },
            {
              label: "Features",
              value: overview.counts.billingFeatures,
            },
            {
              label: "Need sync attention",
              value: overview.counts.syncAttentionPlans,
            },
          ]}
          title="Catalog"
        />
        <SummaryPanel
          description="Subscriptions currently in scope for billing and support follow-up."
          rows={[
            {
              label: "Active or trialing",
              value: overview.counts.activeSubscriptions,
            },
            {
              label: "Need attention",
              value: overview.counts.attentionSubscriptions,
            },
            {
              label: "Cancel at period end",
              value: overview.cancelAtPeriodEndCount,
            },
          ]}
          title="Subscriptions"
        />
        <SummaryPanel
          description={
            overview.lastSync?.summary ??
            "A Stripe catalog sync has not been recorded yet."
          }
          rows={[
            {
              label: "Status",
              value: getSyncBadge(overview.lastSync),
            },
            {
              label: "Warnings",
              value: overview.lastSync?.warningCount ?? 0,
            },
            {
              label: "Last run",
              value: overview.lastSync
                ? new Intl.DateTimeFormat("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(overview.lastSync.syncedAt)
                : "Not recorded",
            },
          ]}
          title="Latest Sync"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Subscription Health</CardTitle>
              <CardDescription>
                Current subscription distribution across the statuses staff can
                act on.
              </CardDescription>
            </div>
            {overview.cancelAtPeriodEndCount > 0 ? (
              <Badge variant="outline">
                {overview.cancelAtPeriodEndCount} canceling at period end
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            {totalSubscriptions > 0 ? (
              <div className="grid gap-4">
                {subscriptionBreakdown.map((item) => (
                  <div className="grid gap-2" key={item.label}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div className="font-medium">{item.label}</div>
                      <div className="tabular-nums text-muted-foreground">
                        {item.count}
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/80"
                        style={{ width: getBarWidth(item.count, maxSubscriptionCount) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                No in-scope subscription records are currently available.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Recent Activity Volume</CardTitle>
            <CardDescription>
              Staff events captured over the last 7 days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {maxActivityCount > 0 ? (
              <div className="grid gap-4">
                {activityBreakdown.map((item) => (
                  <div className="grid gap-2" key={item.label}>
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <div className="font-medium">{item.label}</div>
                      <div className="tabular-nums text-muted-foreground">
                        {item.count}
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-foreground/70"
                        style={{ width: getBarWidth(item.count, maxActivityCount) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                No recent staff events were recorded in the last 7 days.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            The latest staff events that are relevant to the current operator role.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {overview.recentActivity.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.recentActivity.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="w-44 text-sm text-muted-foreground">
                      {new Intl.DateTimeFormat("en-GB", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(log.createdAt)}
                    </TableCell>
                    <TableCell className="w-32">
                      <Badge variant="outline">
                        {getActivityArea(log.entityType)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xl whitespace-normal">
                      <div className="font-medium">{log.summary}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {log.actorName}
                      </div>
                    </TableCell>
                    <TableCell className="w-28">
                      <Badge variant={getAuditResultVariant(log.result)}>
                        {log.result}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-6 py-10 text-sm text-muted-foreground">
              No recent staff activity is currently available.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
