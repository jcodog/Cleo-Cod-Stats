import "server-only"

import { cache } from "react"
import { auth, currentUser } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { redirect } from "next/navigation"

import { api } from "@workspace/backend/convex/_generated/api"
import { syncClerkPublicMetadataRole } from "@workspace/backend/convex/lib/clerk"
import type { StaffAccessViewState } from "@workspace/backend/convex/lib/staffTypes"
import {
  getParsedUserRoleState,
  roleMeetsRequirement,
  type RequiredStaffRole,
  type UserRole,
} from "@workspace/backend/convex/lib/staffRoles"

type AuthorizedStaffContext = Extract<StaffAccessViewState, { ok: true }> & {
  convexToken: string
}

type RestrictedStaffContext = Extract<StaffAccessViewState, { ok: false }>

export class StaffRouteAccessError extends Error {
  context: RestrictedStaffContext
  status: number

  constructor(context: RestrictedStaffContext, status: number) {
    super(context.supportMessage)
    this.context = context
    this.status = status
  }
}

function getDisplayName(user: Awaited<ReturnType<typeof currentUser>>) {
  if (!user) {
    return "Unknown user"
  }

  const fullName = [user.firstName, user.lastName]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ")
    .trim()

  return fullName || user.username?.trim() || user.id
}

function getEmail(user: Awaited<ReturnType<typeof currentUser>>) {
  return (
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    undefined
  )
}

function buildRestrictedContext(args: {
  clerkRole: UserRole | null
  clerkUserId: string
  convexRole: UserRole | null
  displayName: string
  email?: string
  reason: RestrictedStaffContext["reason"]
  requiredRole: RequiredStaffRole
}): RestrictedStaffContext {
  const supportMessageByReason: Record<RestrictedStaffContext["reason"], string> = {
    insufficient_role:
      "This staff area is restricted to a higher role than the one currently assigned to your account.",
    invalid_clerk_role:
      "Your Clerk role is invalid. Staff access is blocked until it is corrected.",
    invalid_convex_role:
      "Your Convex role is invalid. Staff access is blocked until it is corrected.",
    missing_clerk_role:
      "Your Clerk public metadata role is missing. Staff access is blocked until it is set.",
    missing_convex_role:
      "Your Convex role is missing. Staff access is blocked until it is repaired.",
    missing_convex_token:
      "The Convex session token could not be issued for this request, so elevated access cannot be verified.",
    missing_convex_user:
      "A matching Convex user record could not be found for this Clerk account.",
    role_mismatch:
      "Your Clerk role and Convex role do not match. Elevated access is blocked until they are synchronized.",
  }

  return {
    clerkRole: args.clerkRole,
    clerkUserId: args.clerkUserId,
    convexRole: args.convexRole,
    displayName: args.displayName,
    email: args.email,
    ok: false,
    reason: args.reason,
    requiredRole: args.requiredRole,
    supportMessage: supportMessageByReason[args.reason],
  }
}

const getStaffAccessContext = cache(async (
  requiredRole: RequiredStaffRole
): Promise<AuthorizedStaffContext | RestrictedStaffContext> => {
  const { userId, getToken } = await auth()

  if (!userId) {
    redirect("/sign-in")
  }

  const [clerkUser, convexToken] = await Promise.all([
    currentUser(),
    getToken({ template: "convex" }).catch(() => null),
  ])
  const displayName = getDisplayName(clerkUser)
  const email = getEmail(clerkUser)
  const clerkRoleState = getParsedUserRoleState(clerkUser?.publicMetadata?.role)

  if (!convexToken) {
    return buildRestrictedContext({
      clerkRole: clerkRoleState.role,
      clerkUserId: userId,
      convexRole: null,
      displayName,
      email,
      reason: "missing_convex_token",
      requiredRole,
    })
  }

  const dbUser = await fetchQuery(api.queries.users.current, {}, { token: convexToken })
  const convexRoleState = getParsedUserRoleState(dbUser?.role)
  const convexRole = convexRoleState.role

  if (!dbUser) {
    return buildRestrictedContext({
      clerkRole: clerkRoleState.role,
      clerkUserId: userId,
      convexRole: null,
      displayName,
      email,
      reason: "missing_convex_user",
      requiredRole,
    })
  }

  let resolvedClerkRole = clerkRoleState.role

  if (
    clerkUser &&
    convexRole &&
    resolvedClerkRole !== convexRole
  ) {
    try {
      await syncClerkPublicMetadataRole({
        clerkUserId: userId,
        currentPublicMetadata: clerkUser.publicMetadata,
        role: convexRole,
      })
      resolvedClerkRole = convexRole
    } catch {
      resolvedClerkRole = clerkRoleState.role
    }
  }

  if (!resolvedClerkRole) {
    return buildRestrictedContext({
      clerkRole: null,
      clerkUserId: userId,
      convexRole,
      displayName,
      email,
      reason:
        clerkRoleState.issue === "invalid"
          ? "invalid_clerk_role"
          : "missing_clerk_role",
      requiredRole,
    })
  }

  if (!convexRole) {
    return buildRestrictedContext({
      clerkRole: resolvedClerkRole,
      clerkUserId: userId,
      convexRole: null,
      displayName,
      email,
      reason:
        convexRoleState.issue === "invalid"
          ? "invalid_convex_role"
          : "missing_convex_role",
      requiredRole,
    })
  }

  if (resolvedClerkRole !== convexRole) {
    return buildRestrictedContext({
      clerkRole: resolvedClerkRole,
      clerkUserId: userId,
      convexRole,
      displayName,
      email,
      reason: "role_mismatch",
      requiredRole,
    })
  }

  if (!roleMeetsRequirement(convexRole, requiredRole)) {
    return buildRestrictedContext({
      clerkRole: resolvedClerkRole,
      clerkUserId: userId,
      convexRole,
      displayName,
      email,
      reason: "insufficient_role",
      requiredRole,
    })
  }

  return {
    clerkRole: resolvedClerkRole,
    clerkUserId: userId,
    convexRole,
    convexToken,
    displayName,
    email,
    ok: true,
    requiredRole,
  }
})

export async function getAuthorizedStaffContext(requiredRole: RequiredStaffRole) {
  return getStaffAccessContext(requiredRole)
}

export async function requireStaffAccess() {
  return getStaffAccessContext("staff")
}

export async function requireAdminAccess() {
  return getStaffAccessContext("admin")
}

export async function requireStaffApiAccess(requiredRole: RequiredStaffRole) {
  const context = await getStaffAccessContext(requiredRole)

  if (!context.ok) {
    throw new StaffRouteAccessError(
      context,
      context.reason === "role_mismatch" ? 409 : 403
    )
  }

  return context
}
