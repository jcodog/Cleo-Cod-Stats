export const USER_ROLES = ["user", "staff", "admin", "super_admin"] as const

export const ASSIGNABLE_USER_ROLES = ["user", "staff", "admin"] as const

export const ELEVATED_ROLES = ["staff", "admin", "super_admin"] as const

export const ADMIN_CAPABLE_ROLES = ["admin", "super_admin"] as const

export type UserRole = (typeof USER_ROLES)[number]
export type AssignableUserRole = (typeof ASSIGNABLE_USER_ROLES)[number]
export type StaffRole = (typeof ELEVATED_ROLES)[number]
export type AdminCapableRole = (typeof ADMIN_CAPABLE_ROLES)[number]
export type RequiredStaffRole = StaffRole

export const FEATURE_APPLY_MODES = [
  "entitlement",
  "marketing",
  "both",
] as const

export type BillingFeatureApplyMode = (typeof FEATURE_APPLY_MODES)[number]

export const AUDIT_LOG_RESULTS = ["success", "warning", "error"] as const

export type AuditLogResult = (typeof AUDIT_LOG_RESULTS)[number]
export type ParsedRoleIssue = "invalid" | "missing"

function normalizeStringValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function getParsedUserRoleState(value: unknown): {
  issue: ParsedRoleIssue | null
  role: UserRole | null
} {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim().length === 0)
  ) {
    return {
      issue: "missing",
      role: null,
    }
  }

  const role = parseUserRole(value)

  if (role) {
    return {
      issue: null,
      role,
    }
  }

  return {
    issue: "invalid",
    role: null,
  }
}

export function parseUserRole(value: unknown): UserRole | null {
  const normalizedValue = normalizeStringValue(value)

  if (USER_ROLES.includes(normalizedValue as UserRole)) {
    return normalizedValue as UserRole
  }

  return null
}

export function parseRequiredStaffRole(
  value: unknown
): RequiredStaffRole | null {
  const normalizedValue = normalizeStringValue(value)

  if (ELEVATED_ROLES.includes(normalizedValue as StaffRole)) {
    return normalizedValue as StaffRole
  }

  return null
}

export function parseBillingFeatureApplyMode(
  value: unknown
): BillingFeatureApplyMode | null {
  const normalizedValue = normalizeStringValue(value)

  if (FEATURE_APPLY_MODES.includes(normalizedValue as BillingFeatureApplyMode)) {
    return normalizedValue as BillingFeatureApplyMode
  }

  return null
}

export function parseAuditLogResult(value: unknown): AuditLogResult | null {
  const normalizedValue = normalizeStringValue(value)

  if (AUDIT_LOG_RESULTS.includes(normalizedValue as AuditLogResult)) {
    return normalizedValue as AuditLogResult
  }

  return null
}

export function roleMeetsRequirement(
  role: UserRole,
  requiredRole: RequiredStaffRole
) {
  if (requiredRole === "staff") {
    return role === "staff" || role === "admin" || role === "super_admin"
  }

  return role === "admin" || role === "super_admin"
}

export function isAdminCapableRole(
  role: UserRole | null
): role is AdminCapableRole {
  return role === "admin" || role === "super_admin"
}

export function getAssignableRolesForActorRole(
  role: UserRole
): readonly AssignableUserRole[] {
  if (role === "super_admin") {
    return ASSIGNABLE_USER_ROLES
  }

  if (role === "admin") {
    return ["user", "staff"] as const
  }

  return []
}

export function resolveBillingFeatureApplyMode(
  value: unknown
): BillingFeatureApplyMode {
  return parseBillingFeatureApplyMode(value) ?? "both"
}
