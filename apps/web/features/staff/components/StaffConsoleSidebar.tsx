"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import type { UserRole } from "@workspace/backend/convex/lib/staffRoles"
import { Badge } from "@workspace/ui/components/badge"
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
} from "@workspace/ui/components/sidebar"

import {
  formatStaffRoleLabel,
  getStaffNavigationSections,
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
                  const isActive = isStaffRouteActive(pathname, item.href)

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
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="rounded-md border border-sidebar-border/70 bg-sidebar p-3">
          <div className="text-xs font-medium text-sidebar-foreground/70">
            Current Role
          </div>
          <div className="mt-2">
            <Badge variant="outline">{formatStaffRoleLabel(role)}</Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
