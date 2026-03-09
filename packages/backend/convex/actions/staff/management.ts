"use node"

import { v } from "convex/values"
import { action } from "../../_generated/server"
import { internal } from "../../_generated/api"
import { getClerkBackendClient } from "../../lib/clerk"
import { requireAuthorizedStaffAction } from "../../lib/staffActionAuth"
import { isConfiguredSuperAdminDiscordId } from "../../lib/staffRoleConfig"
import type {
  StaffAuditLogEntry,
  StaffManagementDashboard,
  StaffManagementUserRecord,
  StaffMutationResponse,
} from "../../lib/staffTypes"
import {
  getAssignableRolesForActorRole,
  isAdminCapableRole,
  parseUserRole,
  type AssignableUserRole,
  type UserRole,
} from "../../lib/staffRoles"

type ClerkListUserRecord = Awaited<
  ReturnType<ReturnType<typeof getClerkBackendClient>["users"]["getUserList"]>
>["data"][number]

function getClerkDisplayName(user: {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}) {
  const firstName = user.firstName?.trim()
  const lastName = user.lastName?.trim()
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()

  return fullName || user.username?.trim() || "Unknown user"
}

function getClerkEmail(user: {
  emailAddresses?: Array<{ emailAddress?: string | null }> | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
}) {
  return (
    user.primaryEmailAddress?.emailAddress ??
    user.emailAddresses?.[0]?.emailAddress ??
    undefined
  )
}

function mapAuditLogEntry(log: {
  _id: string
  action: string
  actorClerkUserId: string
  actorName: string
  actorRole: UserRole
  createdAt: number
  details?: string
  entityId: string
  entityLabel?: string
  entityType: string
  result: "error" | "success" | "warning"
  summary: string
}): StaffAuditLogEntry {
  return {
    action: log.action,
    actorClerkUserId: log.actorClerkUserId,
    actorName: log.actorName,
    actorRole: log.actorRole,
    createdAt: log.createdAt,
    details: log.details,
    entityId: log.entityId,
    entityLabel: log.entityLabel,
    entityType: log.entityType,
    id: log._id,
    result: log.result,
    summary: log.summary,
  }
}

function getRoleStatus(args: {
  clerkRole: UserRole | null
  convexRole: UserRole | null
}) {
  if (!args.clerkRole && !args.convexRole) {
    return "missing_both" as const
  }

  if (!args.clerkRole) {
    return "missing_clerk" as const
  }

  if (!args.convexRole) {
    return "missing_convex" as const
  }

  if (args.clerkRole !== args.convexRole) {
    return "mismatch" as const
  }

  return "matched" as const
}

async function listAllClerkUsers() {
  const clerkClient = getClerkBackendClient()
  const users: ClerkListUserRecord[] = []
  const pageSize = 100

  for (let offset = 0; ; offset += pageSize) {
    const page = await clerkClient.users.getUserList({
      limit: pageSize,
      offset,
    })

    if (!page.data.length) {
      break
    }

    users.push(...page.data)

    if (page.data.length < pageSize) {
      break
    }
  }

  return users
}

function buildManagementUsers(args: {
  clerkUsers: ClerkListUserRecord[]
  currentActorClerkUserId: string
  convexUsers: Array<{
    clerkUserId: string
    discordId: string
    name: string
    role?: UserRole
    status: "active" | "disabled"
  }>
}) {
  const clerkUsersById = new Map(
    args.clerkUsers.map((clerkUser) => [clerkUser.id, clerkUser])
  )
  const convexUsersById = new Map(
    args.convexUsers.map((convexUser) => [convexUser.clerkUserId, convexUser])
  )
  const userIds = new Set<string>([
    ...clerkUsersById.keys(),
    ...convexUsersById.keys(),
  ])
  const users: StaffManagementUserRecord[] = []

  for (const clerkUserId of userIds) {
    const clerkUser = clerkUsersById.get(clerkUserId)
    const convexUser = convexUsersById.get(clerkUserId)
    const clerkRole = parseUserRole(clerkUser?.publicMetadata?.role)
    const convexRole = parseUserRole(convexUser?.role)
    const displayName =
      (clerkUser && getClerkDisplayName(clerkUser)) ||
      convexUser?.name ||
      clerkUserId

    users.push({
      clerkRole,
      clerkUserId,
      convexRole,
      displayName,
      email: clerkUser ? getClerkEmail(clerkUser) : undefined,
      hasConvexUser: Boolean(convexUser),
      isReservedSuperAdmin: convexUser
        ? isConfiguredSuperAdminDiscordId(convexUser.discordId)
        : false,
      isCurrentUser: clerkUserId === args.currentActorClerkUserId,
      roleStatus: getRoleStatus({ clerkRole, convexRole }),
      status: convexUser?.status ?? "unknown",
    })
  }

  return users.sort(
    (left, right) =>
      left.displayName.localeCompare(right.displayName) ||
      left.clerkUserId.localeCompare(right.clerkUserId)
  )
}

function buildRoleChangeDetails(args: {
  nextRole: AssignableUserRole
  previousClerkRole: UserRole | null
  previousConvexRole: UserRole | null
}) {
  return JSON.stringify(
    {
      after: {
        clerkRole: args.nextRole,
        convexRole: args.nextRole,
      },
      before: {
        clerkRole: args.previousClerkRole,
        convexRole: args.previousConvexRole,
      },
    },
    null,
    2
  )
}

function countAlignedAdmins(users: StaffManagementUserRecord[]) {
  return users.filter(
    (user) =>
      user.roleStatus === "matched" && isAdminCapableRole(user.convexRole)
  ).length
}

function hasAdminCapableRole(user: StaffManagementUserRecord) {
  return (
    isAdminCapableRole(user.clerkRole) ||
    isAdminCapableRole(user.convexRole) ||
    user.isReservedSuperAdmin
  )
}

function getAllowedNextRoles(args: {
  actorRole: UserRole
  targetUser: StaffManagementUserRecord
}) {
  if (args.targetUser.isCurrentUser || args.targetUser.isReservedSuperAdmin) {
    return [] as const
  }

  if (args.actorRole === "super_admin") {
    return getAssignableRolesForActorRole(args.actorRole)
  }

  if (args.actorRole === "admin" && !hasAdminCapableRole(args.targetUser)) {
    return getAssignableRolesForActorRole(args.actorRole)
  }

  return [] as const
}

export const getDashboard = action({
  args: {},
  handler: async (ctx): Promise<StaffManagementDashboard> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const [records, clerkUsers] = await Promise.all([
      ctx.runQuery(internal.queries.staff.internal.getManagementRecords, {}),
      listAllClerkUsers(),
    ])
    const users = buildManagementUsers({
      clerkUsers,
      convexUsers: records.users,
      currentActorClerkUserId: operator.actorClerkUserId,
    })

    return {
      adminCount: users.filter((user) => user.convexRole === "admin").length,
      auditLogs: records.roleAuditLogs.map(mapAuditLogEntry),
      currentActorClerkUserId: operator.actorClerkUserId,
      currentActorRole: operator.actorRole,
      generatedAt: Date.now(),
      staffCount: users.filter((user) => user.convexRole && user.convexRole !== "user")
        .length,
      superAdminCount: users.filter((user) => user.convexRole === "super_admin")
        .length,
      users,
    }
  },
})

export const updateUserRole = action({
  args: {
    nextRole: v.union(v.literal("user"), v.literal("staff"), v.literal("admin")),
    targetClerkUserId: v.string(),
  },
  handler: async (ctx, args): Promise<StaffMutationResponse> => {
    const operator = await requireAuthorizedStaffAction(ctx, "admin")
    const [records, clerkUsers] = await Promise.all([
      ctx.runQuery(internal.queries.staff.internal.getManagementRecords, {}),
      listAllClerkUsers(),
    ])
    const users = buildManagementUsers({
      clerkUsers,
      convexUsers: records.users,
      currentActorClerkUserId: operator.actorClerkUserId,
    })
    const targetUser = users.find(
      (user) => user.clerkUserId === args.targetClerkUserId
    )

    if (!targetUser) {
      throw new Error(`Unable to find Clerk user ${args.targetClerkUserId}`)
    }

    if (!targetUser.hasConvexUser) {
      throw new Error(
        "This user does not have a Convex user record yet, so their role cannot be synchronized safely."
      )
    }

    if (targetUser.isCurrentUser) {
      throw new Error("You cannot change your own role from the staff dashboard.")
    }

    if (targetUser.isReservedSuperAdmin) {
      throw new Error(
        "This account is a reserved super-admin from configuration and cannot be edited here."
      )
    }

    const allowedNextRoles = getAllowedNextRoles({
      actorRole: operator.actorRole,
      targetUser,
    })

    if (!allowedNextRoles.includes(args.nextRole)) {
      throw new Error(
        operator.actorRole === "super_admin"
          ? "Only non-reserved users can be assigned user, staff, or admin roles from this dashboard."
          : "Admins can only manage non-admin users and assign user or staff roles."
      )
    }

    const alignedAdminCount = countAlignedAdmins(users)
    const targetIsAlignedAdmin =
      targetUser.roleStatus === "matched" && isAdminCapableRole(targetUser.convexRole)

    if (
      targetIsAlignedAdmin &&
      !isAdminCapableRole(args.nextRole) &&
      alignedAdminCount <= 1
    ) {
      throw new Error(
        "The last aligned admin-capable user cannot be demoted. Promote another admin first."
      )
    }

    if (
      targetUser.clerkRole === args.nextRole &&
      targetUser.convexRole === args.nextRole
    ) {
      return {
        summary: `${targetUser.displayName} is already set to ${args.nextRole}.`,
      }
    }

    const clerkClient = getClerkBackendClient()
    const clerkUser = clerkUsers.find((user) => user.id === args.targetClerkUserId)

    if (!clerkUser) {
      throw new Error(`Unable to load Clerk user ${args.targetClerkUserId}`)
    }

    const previousPublicMetadata = { ...(clerkUser.publicMetadata ?? {}) }

    try {
      await clerkClient.users.updateUserMetadata(args.targetClerkUserId, {
        publicMetadata: {
          ...previousPublicMetadata,
          role: args.nextRole,
        },
      })

      await ctx.runMutation(internal.mutations.staff.internal.setUserRole, {
        clerkUserId: args.targetClerkUserId,
        role: args.nextRole,
      })
    } catch (error) {
      try {
        await clerkClient.users.updateUserMetadata(args.targetClerkUserId, {
          publicMetadata: previousPublicMetadata,
        })
      } catch (rollbackError) {
        await ctx.runMutation(internal.mutations.staff.internal.insertAuditLog, {
          action: "staff.role.rollback_failed",
          actorClerkUserId: operator.actorClerkUserId,
          actorName: operator.actorDisplayName,
          actorRole: operator.actorRole,
          details: JSON.stringify(
            {
              message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
              targetClerkUserId: args.targetClerkUserId,
            },
            null,
            2
          ),
          entityId: args.targetClerkUserId,
          entityLabel: targetUser.displayName,
          entityType: "user",
          result: "error",
          summary: `Role update for ${targetUser.displayName} failed and the Clerk rollback also failed.`,
        })
      }

      await ctx.runMutation(internal.mutations.staff.internal.insertAuditLog, {
        action: "staff.role.update_failed",
        actorClerkUserId: operator.actorClerkUserId,
        actorName: operator.actorDisplayName,
        actorRole: operator.actorRole,
        details: JSON.stringify(
          {
            message: error instanceof Error ? error.message : String(error),
            nextRole: args.nextRole,
            previousClerkRole: targetUser.clerkRole,
            previousConvexRole: targetUser.convexRole,
          },
          null,
          2
        ),
        entityId: args.targetClerkUserId,
        entityLabel: targetUser.displayName,
        entityType: "user",
        result: "error",
        summary: `Role update for ${targetUser.displayName} to ${args.nextRole} failed.`,
      })

      throw error
    }

    await ctx.runMutation(internal.mutations.staff.internal.insertAuditLog, {
      action: "staff.role.updated",
      actorClerkUserId: operator.actorClerkUserId,
      actorName: operator.actorDisplayName,
      actorRole: operator.actorRole,
      details: buildRoleChangeDetails({
        nextRole: args.nextRole,
        previousClerkRole: targetUser.clerkRole,
        previousConvexRole: targetUser.convexRole,
      }),
      entityId: args.targetClerkUserId,
      entityLabel: targetUser.displayName,
      entityType: "user",
      result: "success",
      summary: `Updated ${targetUser.displayName} to ${args.nextRole}.`,
    })

    return {
      summary: `Updated ${targetUser.displayName} to ${args.nextRole}.`,
    }
  },
})
