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

export type StaffBillingSectionConfig = {
  breadcrumb: StaffBreadcrumbItem[]
  description: string
  exact?: boolean
  href: string
  key: StaffBillingSection
  label: string
  title: string
}

const STAFF_BILLING_SECTIONS: Record<StaffBillingSection, StaffBillingSectionConfig> = {
  "catalog-overview": {
    breadcrumb: [
      { label: "Billing" },
      { label: "Catalog" },
      { label: "Overview" },
    ],
    description:
      "Review plan coverage, feature posture, and Stripe catalog sync state for the managed catalog.",
    exact: true,
    href: "/staff/billing/catalog",
    key: "catalog-overview",
    label: "Overview",
    title: "Catalog Overview",
  },
  "catalog-plans": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/catalog", label: "Catalog" },
      { label: "Plans" },
    ],
    description:
      "Create, edit, archive, and replace managed billing plans and prices.",
    href: "/staff/billing/catalog/plans",
    key: "catalog-plans",
    label: "Plans",
    title: "Plans",
  },
  "catalog-features": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/catalog", label: "Catalog" },
      { label: "Features" },
    ],
    description:
      "Manage entitlement and marketing features while keeping plan coverage explicit.",
    href: "/staff/billing/catalog/features",
    key: "catalog-features",
    label: "Features",
    title: "Features",
  },
  "catalog-assignments": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/catalog", label: "Catalog" },
      { label: "Assignments" },
    ],
    description:
      "Review plan-feature coverage and sync assignment changes with impact previews.",
    href: "/staff/billing/catalog/assignments",
    key: "catalog-assignments",
    label: "Assignments",
    title: "Assignments",
  },
  "catalog-operations": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/catalog", label: "Catalog" },
      { label: "Operations" },
    ],
    description:
      "Run controlled catalog sync operations and review the latest operational state.",
    href: "/staff/billing/catalog/operations",
    key: "catalog-operations",
    label: "Operations",
    title: "Operations",
  },
  "catalog-audit": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/catalog", label: "Catalog" },
      { label: "Audit" },
    ],
    description:
      "Inspect billing audit records for catalog edits, sync runs, and destructive actions.",
    href: "/staff/billing/catalog/audit",
    key: "catalog-audit",
    label: "Audit",
    title: "Audit",
  },
  "subscriptions-overview": {
    breadcrumb: [
      { label: "Billing" },
      { label: "Subscriptions" },
      { label: "Overview" },
    ],
    description:
      "Review customer footprint, live subscription coverage, and support-facing subscription signals.",
    exact: true,
    href: "/staff/billing/subscriptions",
    key: "subscriptions-overview",
    label: "Overview",
    title: "Subscriptions Overview",
  },
  "subscriptions-customers": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/subscriptions", label: "Subscriptions" },
      { label: "Customers" },
    ],
    description:
      "Review billing customer records, linked users, and current subscription coverage.",
    href: "/staff/billing/subscriptions/customers",
    key: "subscriptions-customers",
    label: "Customers",
    title: "Customers",
  },
  "subscriptions-active": {
    breadcrumb: [
      { label: "Billing" },
      { href: "/staff/billing/subscriptions", label: "Subscriptions" },
      { label: "Active" },
    ],
    description:
      "Track the subscription records most likely to be affected by plan and price operations.",
    href: "/staff/billing/subscriptions/active",
    key: "subscriptions-active",
    label: "Active",
    title: "Active Subscriptions",
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
] as const satisfies readonly StaffBillingSectionConfig[]

export function getStaffBillingSectionConfig(section: StaffBillingSection) {
  return STAFF_BILLING_SECTIONS[section]
}

export function resolveStaffBillingSectionFromPathname(
  pathname: string
): StaffBillingSection {
  if (pathname === "/staff/billing/catalog" || pathname === "/staff/billing/catalog/") {
    return "catalog-overview"
  }

  if (pathname.startsWith("/staff/billing/catalog/plans")) {
    return "catalog-plans"
  }

  if (pathname.startsWith("/staff/billing/catalog/features")) {
    return "catalog-features"
  }

  if (pathname.startsWith("/staff/billing/catalog/assignments")) {
    return "catalog-assignments"
  }

  if (pathname.startsWith("/staff/billing/catalog/operations")) {
    return "catalog-operations"
  }

  if (pathname.startsWith("/staff/billing/catalog/audit")) {
    return "catalog-audit"
  }

  if (
    pathname === "/staff/billing/subscriptions" ||
    pathname === "/staff/billing/subscriptions/"
  ) {
    return "subscriptions-overview"
  }

  if (pathname.startsWith("/staff/billing/subscriptions/customers")) {
    return "subscriptions-customers"
  }

  if (pathname.startsWith("/staff/billing/subscriptions/active")) {
    return "subscriptions-active"
  }

  return "catalog-overview"
}
