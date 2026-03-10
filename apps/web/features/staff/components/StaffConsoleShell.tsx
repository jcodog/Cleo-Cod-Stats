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
    <SidebarProvider className="bg-muted/20">
      <a
        href="#staff-console-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <StaffConsoleSidebar role={role} />
      <SidebarInset className="min-h-svh overflow-x-hidden bg-background">
        <StaffConsoleHeader />
        <div className="flex flex-1 flex-col px-4 py-6 md:px-6 md:py-8 lg:px-8">
          <main
            className="mx-auto flex w-full max-w-[1400px] min-w-0 flex-1 flex-col"
            id="staff-console-content"
            tabIndex={-1}
          >
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
