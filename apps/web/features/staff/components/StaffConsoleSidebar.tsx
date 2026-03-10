"use client"

import { UserButton } from "@clerk/nextjs"
import { IconChevronRight } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import type { UserRole } from "@workspace/backend/convex/lib/staffRoles"
import { Badge } from "@workspace/ui/components/badge"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

import {
  formatStaffRoleLabel,
  getStaffNavigationSections,
  isStaffBillingGroupOpen,
  isStaffRouteActive,
} from "@/features/staff/lib/staff-navigation"

export function StaffConsoleSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const sections = getStaffNavigationSections(role)

  return (
    <Sidebar collapsible="offcanvas" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <div className="text-xs font-medium text-sidebar-foreground/70">
          Internal Navigation
        </div>
      </SidebarHeader>

      <SidebarContent className="py-3">
        {sections.map((section) => (
          <SidebarGroup key={section.key}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  if (item.kind === "link") {
                    const isActive = isStaffRouteActive(pathname, item.href, {
                      exact: item.exact,
                    })

                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                        >
                          <Link
                            aria-current={isActive ? "page" : undefined}
                            href={item.href}
                          >
                            <item.icon aria-hidden="true" />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  }

                  const billingGroup =
                    item.key === "billing-catalog" ? "catalog" : "subscriptions"

                  return (
                    <Collapsible
                      className="group/collapsible"
                      defaultOpen={isStaffBillingGroupOpen(pathname, billingGroup)}
                      key={item.key}
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.label}>
                            <span>{item.label}</span>
                            <IconChevronRight
                              aria-hidden="true"
                              className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
                            />
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {item.items.map((subItem) => {
                              const isActive = isStaffRouteActive(
                                pathname,
                                subItem.href,
                                { exact: subItem.exact }
                              )

                              return (
                                <SidebarMenuSubItem key={subItem.key}>
                                  <SidebarMenuSubButton asChild isActive={isActive}>
                                    <Link
                                      aria-current={isActive ? "page" : undefined}
                                      href={subItem.href}
                                    >
                                      <span>{subItem.label}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="rounded-md border border-sidebar-border/70 bg-sidebar p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-medium text-sidebar-foreground/70">
                Signed in
              </div>
              <div className="mt-2 overflow-hidden">
                <UserButton
                  showName
                  userProfileMode="navigation"
                  userProfileUrl="/account"
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-sidebar-foreground/70">
              Current Role
            </span>
            <Badge variant="outline">{formatStaffRoleLabel(role)}</Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
