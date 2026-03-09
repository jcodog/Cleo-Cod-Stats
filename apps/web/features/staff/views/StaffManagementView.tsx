"use client"

import { useState } from "react"
import {
  IconAlertTriangle,
  IconDotsVertical,
  IconShieldCheck,
} from "@tabler/icons-react"
import {
  getAssignableRolesForActorRole,
  isAdminCapableRole,
  type AssignableUserRole,
  type UserRole,
} from "@workspace/backend/convex/lib/staffRoles"
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
  useStaffManagementClient,
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

  if (role === "super_admin") {
    return <Badge>Super admin</Badge>
  }

  if (role === "admin") {
    return <Badge variant="secondary">Admin</Badge>
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

function buildRoleOptionLabel(role: AssignableUserRole) {
  switch (role) {
    case "admin":
      return "Set as admin"
    case "staff":
      return "Set as staff"
    case "user":
      return "Set as user"
  }
}

function hasAdminCapableRole(user: StaffManagementUserRecord) {
  return (
    isAdminCapableRole(user.clerkRole) ||
    isAdminCapableRole(user.convexRole) ||
    user.isReservedSuperAdmin
  )
}

function getAllowedRoleOptions(args: {
  actorRole: UserRole
  user: StaffManagementUserRecord
}) {
  if (args.user.isCurrentUser || args.user.isReservedSuperAdmin || !args.user.hasConvexUser) {
    return [] as readonly AssignableUserRole[]
  }

  if (args.actorRole === "super_admin") {
    return getAssignableRolesForActorRole(args.actorRole)
  }

  if (args.actorRole === "admin" && !hasAdminCapableRole(args.user)) {
    return getAssignableRolesForActorRole(args.actorRole)
  }

  return [] as readonly AssignableUserRole[]
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
  const { data } = useStaffManagementDashboard(initialData)
  const managementClient = useStaffManagementClient()
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    nextRole: AssignableUserRole
    user: StaffManagementUserRecord
  } | null>(null)
  const alignedAdminCount = data.users.filter(
    (user) => user.roleStatus === "matched" && isAdminCapableRole(user.convexRole)
  ).length
  const mutation = useStaffMutation<
    ManagementActionRequest,
    StaffMutationResponse
  >({
    invalidate: ["management"],
    mutationFn: (request) =>
      managementClient.runAction<StaffMutationResponse>(request),
  })

  const columns = [
    {
      accessorKey: "displayName",
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-medium">{row.original.displayName}</div>
            {row.original.isCurrentUser ? (
              <Badge variant="outline">Current session</Badge>
            ) : null}
            {row.original.isReservedSuperAdmin ? (
              <Badge variant="outline">Reserved super-admin</Badge>
            ) : null}
          </div>
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
      cell: ({ row }: { row: { original: StaffManagementUserRecord } }) => {
        const allowedRoleOptions = getAllowedRoleOptions({
          actorRole: data.currentActorRole,
          user: row.original,
        })

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={mutation.isPending || allowedRoleOptions.length === 0}
                size="icon"
                variant="ghost"
              >
                <IconDotsVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {allowedRoleOptions.map((role) => (
                  <DropdownMenuItem
                    disabled={mutation.isPending || row.original.convexRole === role}
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
                {allowedRoleOptions.length === 0 ? (
                  <DropdownMenuItem disabled>
                    No permitted role changes
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
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
          nextRole: pendingRoleChange.nextRole,
          targetClerkUserId: pendingRoleChange.user.clerkUserId,
        },
      })

      toast.success(result.summary)

      setPendingRoleChange(null)
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
          {data.currentActorRole === "super_admin"
            ? "Super-admin controls"
            : "Admin controls"}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Staff management
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Admins can manage user and staff access for non-admin accounts.
          Super-admins can also grant and revoke admin. Reserved super-admin
          accounts stay config-controlled and cannot be edited here.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Aligned operators" value={alignedAdminCount} />
        <MetricCard label="Admins" value={data.adminCount} />
        <MetricCard label="Super-admins" value={data.superAdminCount} />
        <MetricCard label="Elevated users" value={data.staffCount} />
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            Search by name, email, or Clerk ID. The menu only shows role
            transitions that your current operator role is allowed to apply.
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

              {pendingRoleChange.nextRole === "admin" ? (
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-3 text-sm text-sky-100">
                  Only super-admins can grant or revoke admin access.
                </div>
              ) : null}

              {pendingRoleChange.user.roleStatus === "matched" &&
              isAdminCapableRole(pendingRoleChange.user.convexRole) &&
              !isAdminCapableRole(pendingRoleChange.nextRole) &&
              alignedAdminCount <= 1 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                  This is the last aligned admin-capable account. Promote
                  another admin first.
                </div>
              ) : null}

              {pendingRoleChange.user.isReservedSuperAdmin ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-950 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-medium">
                    <IconAlertTriangle />
                    Reserved role
                  </div>
                  <p className="mt-2 text-sm/relaxed">
                    This account is pinned as a super-admin by
                    `SUPER_ADMIN_DISCORD_IDS` and should be changed in
                    configuration instead of from the dashboard.
                  </p>
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
                setPendingRoleChange(null)
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={
                mutation.isPending ||
                Boolean(
                  pendingRoleChange?.user.roleStatus === "matched" &&
                    isAdminCapableRole(pendingRoleChange.user.convexRole) &&
                    !isAdminCapableRole(pendingRoleChange.nextRole) &&
                    alignedAdminCount <= 1
                )
              }
              onClick={() => {
                void confirmRoleChange()
              }}
            >
              {mutation.isPending ? "Saving..." : "Apply role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
