import {
  IconActivity,
  IconArrowsExchange,
  IconHistory,
  IconLayoutDashboard,
  IconListDetails,
  IconReceipt2,
  IconSettingsBolt,
  IconStars,
  IconUsers,
  type Icon,
} from "@tabler/icons-react"

import type { RequiredStaffRole } from "@workspace/backend/convex/lib/staffRoles"

export type StaffBreadcrumbItem = {
  href?: string
  label: string
}

export type StaffBillingSection =
  | "catalog-overview"
  | "catalog-plans"
  | "catalog-features"
  | "catalog-assignments"
  | "catalog-operations"
  | "catalog-audit"
  | "subscriptions-overview"
  | "subscriptions-customers"
  | "subscriptions-active"
  | "subscriptions-creator-access"
  | "subscriptions-audit-log"

export type StaffBillingSectionConfig = {
  breadcrumb: StaffBreadcrumbItem[]
  description: string
  exact?: boolean
  href: string
  icon: Icon
  key: StaffBillingSection
  label: string
  minimumRole: RequiredStaffRole
  title: string
}

const STAFF_BILLING_SECTIONS: Record<
  StaffBillingSection,
  StaffBillingSectionConfig
> = {
  "catalog-overview": {
    breadcrumb: [{ label: "Catalog" }, { label: "Overview" }],
    description:
      "Review plan coverage, feature posture, and Stripe catalog sync state for the managed catalog.",
    exact: true,
    href: "/staff/catalog",
    icon: IconLayoutDashboard,
    key: "catalog-overview",
    label: "Overview",
    minimumRole: "staff",
    title: "Catalog Overview",
  },
  "catalog-plans": {
    breadcrumb: [
      { href: "/staff/catalog", label: "Catalog" },
      { label: "Plans" },
    ],
    description:
      "Create, edit, archive, and replace managed billing plans and prices.",
    href: "/staff/catalog/plans",
    icon: IconReceipt2,
    key: "catalog-plans",
    label: "Plans",
    minimumRole: "staff",
    title: "Plans",
  },
  "catalog-features": {
    breadcrumb: [
      { href: "/staff/catalog", label: "Catalog" },
      { label: "Features" },
    ],
    description:
      "Manage entitlement and marketing features while keeping plan coverage explicit.",
    href: "/staff/catalog/features",
    icon: IconStars,
    key: "catalog-features",
    label: "Features",
    minimumRole: "staff",
    title: "Features",
  },
  "catalog-assignments": {
    breadcrumb: [
      { href: "/staff/catalog", label: "Catalog" },
      { label: "Assignments" },
    ],
    description:
      "Review plan-feature coverage and sync assignment changes with impact previews.",
    href: "/staff/catalog/assignments",
    icon: IconArrowsExchange,
    key: "catalog-assignments",
    label: "Assignments",
    minimumRole: "staff",
    title: "Assignments",
  },
  "catalog-operations": {
    breadcrumb: [
      { href: "/staff/catalog", label: "Catalog" },
      { label: "Operations" },
    ],
    description:
      "Run controlled catalog sync operations and review the latest operational state.",
    href: "/staff/catalog/operations",
    icon: IconSettingsBolt,
    key: "catalog-operations",
    label: "Operations",
    minimumRole: "staff",
    title: "Operations",
  },
  "catalog-audit": {
    breadcrumb: [
      { href: "/staff/catalog", label: "Catalog" },
      { label: "Audit log" },
    ],
    description:
      "Inspect billing audit records for catalog edits, sync runs, and destructive actions.",
    href: "/staff/catalog/audit-log",
    icon: IconHistory,
    key: "catalog-audit",
    label: "Audit log",
    minimumRole: "staff",
    title: "Audit Log",
  },
  "subscriptions-overview": {
    breadcrumb: [{ label: "Subscriptions" }, { label: "Overview" }],
    description:
      "Review customer footprint, live subscription coverage, and support-facing subscription signals.",
    exact: true,
    href: "/staff/subscriptions",
    icon: IconLayoutDashboard,
    key: "subscriptions-overview",
    label: "Overview",
    minimumRole: "staff",
    title: "Subscriptions Overview",
  },
  "subscriptions-customers": {
    breadcrumb: [
      { href: "/staff/subscriptions", label: "Subscriptions" },
      { label: "Customers" },
    ],
    description:
      "Review billing customer records, linked users, and current subscription coverage.",
    href: "/staff/subscriptions/customers",
    icon: IconUsers,
    key: "subscriptions-customers",
    label: "Customers",
    minimumRole: "staff",
    title: "Customers",
  },
  "subscriptions-active": {
    breadcrumb: [
      { href: "/staff/subscriptions", label: "Subscriptions" },
      { label: "Active" },
    ],
    description:
      "Track the subscription records most likely to be affected by plan and price operations.",
    href: "/staff/subscriptions/active",
    icon: IconActivity,
    key: "subscriptions-active",
    label: "Active",
    minimumRole: "staff",
    title: "Active Subscriptions",
  },
  "subscriptions-creator-access": {
    breadcrumb: [
      { href: "/staff/subscriptions", label: "Subscriptions" },
      { label: "Creator access" },
    ],
    description:
      "Grant Creator override access to one or more users with a required reason and explicit confirmation.",
    href: "/staff/subscriptions/creator-access",
    icon: IconListDetails,
    key: "subscriptions-creator-access",
    label: "Creator access",
    minimumRole: "staff",
    title: "Creator Access",
  },
  "subscriptions-audit-log": {
    breadcrumb: [
      { href: "/staff/subscriptions", label: "Subscriptions" },
      { label: "Audit log" },
    ],
    description:
      "Inspect Stripe webhook deliveries and raw payloads captured for subscription reconciliation.",
    href: "/staff/subscriptions/audit-log",
    icon: IconHistory,
    key: "subscriptions-audit-log",
    label: "Audit log",
    minimumRole: "admin",
    title: "Subscription Audit Log",
  },
}

export const STAFF_BILLING_CATALOG_ITEMS = [
  STAFF_BILLING_SECTIONS["catalog-overview"],
  STAFF_BILLING_SECTIONS["catalog-plans"],
  STAFF_BILLING_SECTIONS["catalog-features"],
  STAFF_BILLING_SECTIONS["catalog-assignments"],
  STAFF_BILLING_SECTIONS["catalog-operations"],
  STAFF_BILLING_SECTIONS["catalog-audit"],
] as const satisfies readonly StaffBillingSectionConfig[]

export const STAFF_BILLING_SUBSCRIPTION_ITEMS = [
  STAFF_BILLING_SECTIONS["subscriptions-overview"],
  STAFF_BILLING_SECTIONS["subscriptions-customers"],
  STAFF_BILLING_SECTIONS["subscriptions-active"],
  STAFF_BILLING_SECTIONS["subscriptions-creator-access"],
  STAFF_BILLING_SECTIONS["subscriptions-audit-log"],
] as const satisfies readonly StaffBillingSectionConfig[]

export function getStaffBillingSectionConfig(section: StaffBillingSection) {
  return STAFF_BILLING_SECTIONS[section]
}

export function resolveStaffBillingSectionFromPathname(
  pathname: string
): StaffBillingSection {
  if (pathname === "/staff/catalog" || pathname === "/staff/catalog/") {
    return "catalog-overview"
  }

  if (pathname.startsWith("/staff/catalog/plans")) {
    return "catalog-plans"
  }

  if (pathname.startsWith("/staff/catalog/features")) {
    return "catalog-features"
  }

  if (pathname.startsWith("/staff/catalog/assignments")) {
    return "catalog-assignments"
  }

  if (pathname.startsWith("/staff/catalog/operations")) {
    return "catalog-operations"
  }

  if (
    pathname.startsWith("/staff/catalog/audit-log") ||
    pathname.startsWith("/staff/catalog/audit")
  ) {
    return "catalog-audit"
  }

  if (
    pathname === "/staff/subscriptions" ||
    pathname === "/staff/subscriptions/"
  ) {
    return "subscriptions-overview"
  }

  if (pathname.startsWith("/staff/subscriptions/customers")) {
    return "subscriptions-customers"
  }

  if (pathname.startsWith("/staff/subscriptions/active")) {
    return "subscriptions-active"
  }

  if (pathname.startsWith("/staff/subscriptions/creator-access")) {
    return "subscriptions-creator-access"
  }

  if (pathname.startsWith("/staff/subscriptions/audit-log")) {
    return "subscriptions-audit-log"
  }

  return "catalog-overview"
}
