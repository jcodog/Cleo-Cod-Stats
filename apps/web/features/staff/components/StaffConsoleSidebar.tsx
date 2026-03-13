"use client"

import { IconChevronRight } from "@tabler/icons-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  roleMeetsRequirement,
  type UserRole,
} from "@workspace/backend/convex/lib/staffRoles"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
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
  useSidebar,
} from "@workspace/ui/components/sidebar"

import {
  getStaffNavigationSections,
  isStaffBillingGroupOpen,
  isStaffRouteActive,
} from "@/features/staff/lib/staff-navigation"
import { UserButton } from "@clerk/nextjs"

export function StaffConsoleSidebar({ role }: { role: UserRole }) {
  const pathname = usePathname()
  const sections = getStaffNavigationSections(role)
  const { isMobile, state } = useSidebar()
  const isCollapsedDesktop = !isMobile && state === "collapsed"
  const primaryButtonClassName =
    "[&_svg]:size-5 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&>span]:hidden"
  const subButtonClassName = "[&_svg]:size-[1.125rem]"

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        <Link
          className="flex items-center gap-3 rounded-md px-2 py-2 text-sidebar-foreground transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          href="/staff"
        >
          <Avatar className="size-8 rounded-lg bg-primary/10">
            <AvatarImage alt="CodStats logo" src="/logo.png" />
            <AvatarFallback className="rounded-lg font-semibold">
              CS
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-semibold tracking-tight">
              Staff Console
            </div>
            <div className="truncate text-xs text-sidebar-foreground/70">
              CodStats
            </div>
          </div>
        </Link>
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
                          className={primaryButtonClassName}
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
                  const visibleSubItems = item.items.filter((subItem) =>
                    roleMeetsRequirement(role, subItem.minimumRole)
                  )

                  if (visibleSubItems.length === 0) {
                    return null
                  }

                  return (
                    <SidebarMenuItem key={item.key}>
                      {isCollapsedDesktop ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <SidebarMenuButton
                              className={primaryButtonClassName}
                              tooltip={item.label}
                            >
                              <item.icon aria-hidden="true" />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="start"
                            className="w-60"
                            side="right"
                          >
                            <DropdownMenuGroup>
                              {visibleSubItems.map((subItem) => {
                                const isActive = isStaffRouteActive(
                                  pathname,
                                  subItem.href,
                                  { exact: subItem.exact }
                                )

                                return (
                                  <DropdownMenuItem asChild key={subItem.key}>
                                    <Link
                                      aria-current={
                                        isActive ? "page" : undefined
                                      }
                                      className="flex items-center gap-2"
                                      href={subItem.href}
                                    >
                                      <subItem.icon aria-hidden="true" />
                                      <span>{subItem.label}</span>
                                    </Link>
                                  </DropdownMenuItem>
                                )
                              })}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Collapsible
                          className="group/collapsible"
                          defaultOpen={isStaffBillingGroupOpen(
                            pathname,
                            billingGroup
                          )}
                        >
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton
                              className={primaryButtonClassName}
                              tooltip={item.label}
                            >
                              <item.icon aria-hidden="true" />
                              <span>{item.label}</span>
                              <IconChevronRight
                                aria-hidden="true"
                                className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90"
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {visibleSubItems.map((subItem) => {
                                const isActive = isStaffRouteActive(
                                  pathname,
                                  subItem.href,
                                  { exact: subItem.exact }
                                )

                                return (
                                  <SidebarMenuSubItem key={subItem.key}>
                                    <SidebarMenuSubButton
                                      asChild
                                      className={subButtonClassName}
                                      isActive={isActive}
                                    >
                                      <Link
                                        aria-current={
                                          isActive ? "page" : undefined
                                        }
                                        href={subItem.href}
                                      >
                                        <subItem.icon aria-hidden="true" />
                                        <span>{subItem.label}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                )
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="rounded-md border border-sidebar-border/70 bg-sidebar p-3 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
          <div className="flex items-center justify-between gap-3 group-data-[collapsible=icon]:justify-center">
            <UserButton
              showName={!isCollapsedDesktop}
              userProfileMode="navigation"
              userProfileUrl="/account"
              appearance={{
                elements: {
                  userButtonTrigger:
                    "outline-none! ring-0! shadow-none! focus:ring-0! focus-visible:ring-0! focus-visible:outline-none! active:ring-0! active:outline-none! data-[state=open]:ring-0! data-[state=open]:shadow-none!",
                  userButtonBox: "flex-row-reverse! gap-0.5! pr-2!",
                },
              }}
            />
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
