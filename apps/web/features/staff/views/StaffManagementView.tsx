"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconShieldCheck,
} from "@tabler/icons-react"
import type {
  StaffManagementDashboard,
  StaffManagementUserRecord,
  StaffMutationResponse,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"

import {
  StaffClientError,
  runManagementAction,
  useStaffManagementDashboard,
  useStaffMutation,
} from "@/features/staff/lib/staff-client"
import { StaffDataTable } from "@/features/staff/components/StaffDataTable"
import type { ManagementActionRequest } from "@/features/staff/lib/staff-schemas"

function RoleBadge({
  role,
}: {
  role: StaffManagementUserRecord["clerkRole"] | StaffManagementUserRecord["convexRole"]
}) {
  if (!role) {
    return <Badge variant="outline">Missing</Badge>
  }

  if (role === "admin") {
    return <Badge>Admin</Badge>
  }

  if (role === "staff") {
    return <Badge variant="secondary">Staff</Badge>
  }

  return <Badge variant="outline">User</Badge>
}

function RoleStatusBadge({ user }: { user: StaffManagementUserRecord }) {
  if (user.roleStatus === "matched") {
    return <Badge variant="secondary">Aligned</Badge>
  }

  return <Badge variant="destructive">Attention</Badge>
}

function buildRoleOptionLabel(role: "user" | "staff" | "admin") {
  switch (role) {
    case "admin":
      return "Set as admin"
    case "staff":
      return "Set as staff"
    case "user":
      return "Set as user"
  }
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

export function StaffManagementView({
  initialData,
}: {
  initialData: StaffManagementDashboard
}) {
  const router = useRouter()
  const { data } = useStaffManagementDashboard(initialData)
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    nextRole: "user" | "staff" | "admin"
    user: StaffManagementUserRecord
  } | null>(null)
  const [confirmSelfChange, setConfirmSelfChange] = useState(false)
  const [isRedirecting, startRedirect] = useTransition()
  const alignedAdminCount = data.users.filter(
    (user) => user.clerkRole === "admin" && user.convexRole === "admin"
  ).length
  const mutation = useStaffMutation<
    ManagementActionRequest,
    StaffMutationResponse
  >({
    invalidate: ["management"],
    mutationFn: (request) => runManagementAction<StaffMutationResponse>(request),
  })

  const columns = [
    {
      accessorKey: "displayName",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <div className="flex flex-col gap-1">
          <div className="font-medium">{row.original.displayName}</div>
          <div className="text-xs text-muted-foreground">
            {row.original.email ?? row.original.clerkUserId}
          </div>
        </div>
      ),
      header: "User",
    },
    {
      accessorKey: "convexRole",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <RoleBadge role={row.original.convexRole} />
      ),
      header: "Convex",
    },
    {
      accessorKey: "clerkRole",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <RoleBadge role={row.original.clerkRole} />
      ),
      header: "Clerk",
    },
    {
      accessorKey: "roleStatus",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <RoleStatusBadge user={row.original} />
      ),
      header: "Status",
    },
    {
      accessorKey: "clerkUserId",
      header: "Clerk ID",
    },
    {
      id: "actions",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <IconDotsVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              {(["user", "staff", "admin"] as const).map((role) => (
                <DropdownMenuItem
                  disabled={
                    !row.original.hasConvexUser ||
                    mutation.isPending ||
                    row.original.convexRole === role
                  }
                  key={role}
                  onClick={() =>
                    setPendingRoleChange({
                      nextRole: role,
                      user: row.original,
                    })
                  }
                >
                  {buildRoleOptionLabel(role)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableGlobalFilter: false,
      header: "",
    },
  ]

  async function confirmRoleChange() {
    if (!pendingRoleChange) {
      return
    }

    try {
      const result = await mutation.mutateAsync({
        action: "updateUserRole",
        input: {
          confirmSelfChange,
          nextRole: pendingRoleChange.nextRole,
          targetClerkUserId: pendingRoleChange.user.clerkUserId,
        },
      })

      toast.success(result.summary)
      const requiresRefresh = result.requiresSessionRefresh
      const isSelf = pendingRoleChange.user.isCurrentUser
      const nextRole = pendingRoleChange.nextRole

      setPendingRoleChange(null)
      setConfirmSelfChange(false)

      if (requiresRefresh && isSelf) {
        startRedirect(() => {
          if (nextRole !== "admin") {
            router.replace("/dashboard")
            return
          }

          router.refresh()
        })
      }
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Role update failed."
      )
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconShieldCheck />
          Admin-only controls
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Staff management
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Promote and demote staff safely, keep Clerk and Convex roles in sync,
          and review an audit trail of every privileged role change.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Aligned admins" value={alignedAdminCount} />
        <MetricCard label="Convex admins" value={data.adminCount} />
        <MetricCard label="Elevated users" value={data.staffCount} />
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            Search by name, email, or Clerk ID and review role alignment before
            changing permissions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffDataTable
            columns={columns}
            data={data.users}
            emptyDescription="No staff-manageable users are currently available."
            emptyTitle="No users found"
            getRowId={(row) => row.clerkUserId}
            searchPlaceholder="Search users, emails, or Clerk IDs"
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Role audit log</CardTitle>
          <CardDescription>
            Recent role changes and failures captured for internal review.
          </CardDescription>
        </CardHeader>
        <CardContent className="rounded-lg border border-border/70 p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.auditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{log.actorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {log.actorClerkUserId}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    {log.summary}
                  </TableCell>
                  <TableCell>
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

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setConfirmSelfChange(false)
            setPendingRoleChange(null)
          }
        }}
        open={Boolean(pendingRoleChange)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm role change</DialogTitle>
            <DialogDescription>
              Review the guardrails below before changing this user&apos;s
              elevated access.
            </DialogDescription>
          </DialogHeader>

          {pendingRoleChange ? (
            <FieldGroup>
              <Field>
                <FieldLabel>Target user</FieldLabel>
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  {pendingRoleChange.user.displayName}
                </div>
              </Field>

              <Field>
                <FieldLabel>Role transition</FieldLabel>
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  {pendingRoleChange.user.convexRole ?? "missing"} to{" "}
                  {pendingRoleChange.nextRole}
                </div>
              </Field>

              {pendingRoleChange.user.isCurrentUser ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-medium">
                    <IconAlertTriangle />
                    This change targets the current session
                  </div>
                  <p className="mt-2 text-sm/relaxed">
                    Your current Clerk session may need a refresh after the role
                    update completes.
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      checked={confirmSelfChange}
                      className="size-4"
                      onChange={(event) =>
                        setConfirmSelfChange(event.target.checked)
                      }
                      type="checkbox"
                    />
                    Confirm that this self-role change is intentional
                  </label>
                </div>
              ) : null}

              {pendingRoleChange.user.clerkRole === "admin" &&
              pendingRoleChange.user.convexRole === "admin" &&
              pendingRoleChange.nextRole !== "admin" &&
              alignedAdminCount <= 1 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  This is the last aligned admin. Promote another admin first.
                </div>
              ) : null}

              {pendingRoleChange.user.roleStatus !== "matched" ? (
                <Field>
                  <FieldDescription>
                    This account is already out of sync. The update will attempt
                    to repair Clerk and Convex together.
                  </FieldDescription>
                </Field>
              ) : null}
            </FieldGroup>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => {
                setConfirmSelfChange(false)
                setPendingRoleChange(null)
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                isRedirecting ||
                Boolean(
                  pendingRoleChange?.user.isCurrentUser &&
                    pendingRoleChange.nextRole !== "admin" &&
                    !confirmSelfChange
                ) ||
                Boolean(
                  pendingRoleChange?.user.clerkRole === "admin" &&
                    pendingRoleChange.user.convexRole === "admin" &&
                    pendingRoleChange.nextRole !== "admin" &&
                    alignedAdminCount <= 1
                )
              }
              onClick={() => {
                void confirmRoleChange()
              }}
            >
              {mutation.isPending || isRedirecting ? "Saving..." : "Apply role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
