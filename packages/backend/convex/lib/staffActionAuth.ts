"use node"

import type { Id } from "../_generated/dataModel"
import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"
import { getClerkBackendClient } from "./clerk"
import {
  parseUserRole,
  roleMeetsRequirement,
  type RequiredStaffRole,
  type UserRole,
} from "./staffRoles"

export class StaffAuthorizationError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 403) {
    super(message)
    this.code = code
    this.status = status
  }
}

function getRoleFromPublicMetadata(
  publicMetadata: Record<string, unknown> | null | undefined
) {
  return parseUserRole(publicMetadata?.role)
}

function getPrimaryEmail(clerkUser: {
  emailAddresses?: Array<{ emailAddress?: string | null }> | null
  primaryEmailAddress?: { emailAddress?: string | null } | null
}) {
  return (
    clerkUser.primaryEmailAddress?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress ??
    undefined
  )
}

function getDisplayName(clerkUser: {
  firstName?: string | null
  lastName?: string | null
  username?: string | null
}) {
  const firstName = clerkUser.firstName?.trim()
  const lastName = clerkUser.lastName?.trim()
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim()

  return fullName || clerkUser.username?.trim() || "Staff user"
}

export type AuthorizedStaffActionContext = {
  actorClerkUserId: string
  actorDisplayName: string
  actorEmail?: string
  actorRole: UserRole
  actorUserId: Id<"users">
}

export async function requireAuthorizedStaffAction(
  ctx: ActionCtx,
  requiredRole: RequiredStaffRole
): Promise<AuthorizedStaffActionContext> {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new StaffAuthorizationError(
      "unauthenticated",
      "A signed-in session is required to access this staff action.",
      401
    )
  }

  const clerkUser = await getClerkBackendClient().users.getUser(identity.subject)
  const clerkRole = getRoleFromPublicMetadata(clerkUser.publicMetadata)

  if (!clerkRole) {
    throw new StaffAuthorizationError(
      "missing_clerk_role",
      "Your Clerk public metadata role is missing or invalid. Staff access is denied until it is repaired."
    )
  }

  const dbUser = await ctx.runQuery(
    internal.queries.staff.internal.getUserByClerkUserId,
    {
      clerkUserId: identity.subject,
    }
  )

  if (!dbUser) {
    throw new StaffAuthorizationError(
      "missing_convex_user",
      "Your Convex user record could not be found. Staff access is denied until it is repaired."
    )
  }

  const convexRole = parseUserRole(dbUser.role)

  if (!convexRole) {
    throw new StaffAuthorizationError(
      "missing_convex_role",
      "Your Convex role is missing or invalid. Staff access is denied until it is repaired."
    )
  }

  if (clerkRole !== convexRole) {
    throw new StaffAuthorizationError(
      "role_mismatch",
      "Your Clerk role and Convex role do not match. Staff access is denied until they are synchronized."
    )
  }

  if (!roleMeetsRequirement(convexRole, requiredRole)) {
    throw new StaffAuthorizationError(
      "insufficient_role",
      "You do not have the required staff role to perform this action."
    )
  }

  return {
    actorClerkUserId: dbUser.clerkUserId,
    actorDisplayName: getDisplayName(clerkUser),
    actorEmail: getPrimaryEmail(clerkUser),
    actorRole: convexRole,
    actorUserId: dbUser._id,
  }
}

