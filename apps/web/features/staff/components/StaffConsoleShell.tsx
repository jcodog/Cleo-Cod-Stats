"use client"

import type { ReactNode } from "react"

import type { UserRole } from "@workspace/backend/convex/lib/staffRoles"
import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { StaffConsoleHeader } from "@/features/staff/components/StaffConsoleHeader"
import { StaffConsoleSidebar } from "@/features/staff/components/StaffConsoleSidebar"

export function StaffConsoleShell({
  children,
  role,
}: {
  children: ReactNode
  role: UserRole
}) {
  return (
    <SidebarProvider className="h-svh overflow-hidden bg-muted/20">
      <a
        href="#staff-console-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <StaffConsoleSidebar role={role} />
      <SidebarInset className="min-h-0 overflow-hidden bg-background md:peer-data-[variant=inset]:m-1 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-1">
        <StaffConsoleHeader role={role} />
        <div className="flex min-h-0 flex-1 flex-col px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <main
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain supports-[scrollbar-gutter:stable]:[scrollbar-gutter:stable]"
            id="staff-console-content"
            tabIndex={-1}
          >
            <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col">
              {children}
            </div>
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
