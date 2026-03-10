import {
  IconCreditCard,
  IconLayoutDashboard,
  IconUsers,
} from "@tabler/icons-react"

import {
  roleMeetsRequirement,
  type RequiredStaffRole,
  type UserRole,
} from "@workspace/backend/convex/lib/staffRoles"

export const STAFF_CONSOLE_TITLE = "Staff Console"

type StaffRouteKey = "overview" | "billing" | "management"
type StaffNavGroup = "administration" | "workspace"
type StaffNavIcon = typeof IconLayoutDashboard

export type StaffNavItem = {
  description: string
  group: StaffNavGroup
  href: string
  icon: StaffNavIcon
  key: StaffRouteKey
  label: string
  minimumRole: RequiredStaffRole
}

export type StaffNavSection = {
  items: StaffNavItem[]
  key: StaffNavGroup
  label: string
}

const STAFF_NAV_ITEMS = [
  {
    description: "Operational summary and current signals.",
    group: "workspace",
    href: "/staff",
    icon: IconLayoutDashboard,
    key: "overview",
    label: "Overview",
    minimumRole: "staff",
  },
  {
    description: "Plans, features, sync health, and subscriptions.",
    group: "workspace",
    href: "/staff/billing",
    icon: IconCreditCard,
    key: "billing",
    label: "Billing",
    minimumRole: "staff",
  },
  {
    description: "Role alignment and staff access controls.",
    group: "administration",
    href: "/staff/management",
    icon: IconUsers,
    key: "management",
    label: "Management",
    minimumRole: "admin",
  },
] as const satisfies readonly StaffNavItem[]

const STAFF_NAV_GROUP_ORDER: StaffNavGroup[] = ["workspace", "administration"]

const STAFF_NAV_GROUP_LABELS: Record<StaffNavGroup, string> = {
  administration: "Administration",
  workspace: "Workspace",
}

export function resolveStaffRoute(pathname: string) {
  if (pathname.startsWith("/staff/management")) {
    return STAFF_NAV_ITEMS[2]
  }

  if (pathname.startsWith("/staff/billing")) {
    return STAFF_NAV_ITEMS[1]
  }

  return STAFF_NAV_ITEMS[0]
}

export function getStaffNavigationSections(role: UserRole) {
  return STAFF_NAV_GROUP_ORDER.map<StaffNavSection | null>((group) => {
    const items = STAFF_NAV_ITEMS.filter(
      (item) =>
        item.group === group && roleMeetsRequirement(role, item.minimumRole)
    )

    if (items.length === 0) {
      return null
    }

    return {
      items,
      key: group,
      label: STAFF_NAV_GROUP_LABELS[group],
    }
  }).filter((section): section is StaffNavSection => section !== null)
}

export function isStaffRouteActive(pathname: string, href: string) {
  if (href === "/staff") {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function formatStaffRoleLabel(role: UserRole) {
  switch (role) {
    case "super_admin":
      return "Super admin"
    case "admin":
      return "Admin"
    case "staff":
      return "Staff"
    case "user":
      return "User"
  }
}
