import { IconLayoutDashboard, IconUsers } from "@tabler/icons-react"

import {
  roleMeetsRequirement,
  type RequiredStaffRole,
  type UserRole,
} from "@workspace/backend/convex/lib/staffRoles"

import type {
  StaffBillingSectionConfig,
  StaffBreadcrumbItem,
} from "@/features/staff/lib/staff-billing-sections"
import {
  STAFF_BILLING_CATALOG_ITEMS,
  STAFF_BILLING_SUBSCRIPTION_ITEMS,
  getStaffBillingSectionConfig,
  resolveStaffBillingSectionFromPathname,
} from "@/features/staff/lib/staff-billing-sections"

export const STAFF_CONSOLE_TITLE = "Staff Console"

type StaffNavGroup = "administration" | "billing" | "workspace"
type StaffNavIcon = typeof IconLayoutDashboard
type StaffPrimaryRouteKey = "management" | "overview"

export type StaffRouteContext = {
  breadcrumbs: StaffBreadcrumbItem[]
  key: StaffPrimaryRouteKey | `billing-${string}`
  label: string
}

export type StaffNavLinkItem = {
  description: string
  exact?: boolean
  group: StaffNavGroup
  href: string
  icon: StaffNavIcon
  key: StaffPrimaryRouteKey
  kind: "link"
  label: string
  minimumRole: RequiredStaffRole
}

export type StaffNavCollapsibleItem = {
  group: StaffNavGroup
  items: readonly StaffBillingSectionConfig[]
  key: "billing-catalog" | "billing-subscriptions"
  kind: "collapsible"
  label: "Catalog" | "Subscriptions"
  minimumRole: RequiredStaffRole
}

export type StaffNavItem = StaffNavCollapsibleItem | StaffNavLinkItem

export type StaffNavSection = {
  items: StaffNavItem[]
  key: StaffNavGroup
  label: string
}

const STAFF_NAV_LINKS = {
  management: {
    description: "Role alignment and staff access controls.",
    group: "administration",
    href: "/staff/management",
    icon: IconUsers,
    key: "management",
    kind: "link",
    label: "Management",
    minimumRole: "admin",
  },
  overview: {
    description: "Operational summary and current signals.",
    exact: true,
    group: "workspace",
    href: "/staff",
    icon: IconLayoutDashboard,
    key: "overview",
    kind: "link",
    label: "Overview",
    minimumRole: "staff",
  },
} as const satisfies Record<StaffPrimaryRouteKey, StaffNavLinkItem>

const STAFF_NAV_GROUPS: readonly StaffNavGroup[] = [
  "workspace",
  "billing",
  "administration",
]

const STAFF_NAV_GROUP_LABELS: Record<StaffNavGroup, string> = {
  administration: "Administration",
  billing: "Billing",
  workspace: "Workspace",
}

const STAFF_BILLING_NAV_ITEMS = {
  catalog: {
    group: "billing",
    items: STAFF_BILLING_CATALOG_ITEMS,
    key: "billing-catalog",
    kind: "collapsible",
    label: "Catalog",
    minimumRole: "staff",
  },
  subscriptions: {
    group: "billing",
    items: STAFF_BILLING_SUBSCRIPTION_ITEMS,
    key: "billing-subscriptions",
    kind: "collapsible",
    label: "Subscriptions",
    minimumRole: "staff",
  },
} as const satisfies Record<"catalog" | "subscriptions", StaffNavCollapsibleItem>

export function resolveStaffRoute(pathname: string): StaffRouteContext {
  if (pathname.startsWith("/staff/management")) {
    return {
      breadcrumbs: [{ label: "Management" }],
      key: STAFF_NAV_LINKS.management.key,
      label: STAFF_NAV_LINKS.management.label,
    }
  }

  if (pathname.startsWith("/staff/billing")) {
    const section = resolveStaffBillingSectionFromPathname(pathname)
    const config = getStaffBillingSectionConfig(section)

    return {
      breadcrumbs: config.breadcrumb,
      key: `billing-${section}`,
      label: config.title,
    }
  }

  return {
    breadcrumbs: [{ label: STAFF_NAV_LINKS.overview.label }],
    key: STAFF_NAV_LINKS.overview.key,
    label: STAFF_NAV_LINKS.overview.label,
  }
}

export function getStaffNavigationSections(role: UserRole) {
  return STAFF_NAV_GROUPS.map<StaffNavSection | null>((group) => {
    const items = [
      ...(group === "workspace"
        ? [
            STAFF_NAV_LINKS.overview,
          ]
        : group === "billing"
          ? [
            STAFF_BILLING_NAV_ITEMS.catalog,
            STAFF_BILLING_NAV_ITEMS.subscriptions,
          ]
        : [STAFF_NAV_LINKS.management]),
    ].filter((item) => roleMeetsRequirement(role, item.minimumRole))

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

export function isStaffRouteActive(
  pathname: string,
  href: string,
  options?: { exact?: boolean }
) {
  if (options?.exact) {
    return pathname === href
  }

  if (href === "/staff") {
    return pathname === href
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isStaffBillingGroupOpen(
  pathname: string,
  group: keyof typeof STAFF_BILLING_NAV_ITEMS
) {
  if (pathname === "/staff/billing") {
    return true
  }

  return pathname.startsWith(`/staff/billing/${group}`)
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
