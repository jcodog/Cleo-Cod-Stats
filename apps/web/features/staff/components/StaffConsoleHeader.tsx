"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconArrowBack } from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarTrigger } from "@workspace/ui/components/sidebar"

import { ThemeToggle } from "@/components/theme-toggle"
import {
  resolveStaffRoute,
  STAFF_CONSOLE_TITLE,
} from "@/features/staff/lib/staff-navigation"

function StaffConsoleBreadcrumb({ currentLabel }: { currentLabel: string }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href="/staff">{STAFF_CONSOLE_TITLE}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{currentLabel}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

export function StaffConsoleHeader() {
  const pathname = usePathname()
  const currentRoute = resolveStaffRoute(pathname)

  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarTrigger className="shrink-0" />
          <Link
            href="/staff"
            className="inline-flex min-w-0 items-center gap-2 rounded-md text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Avatar className="size-8 rounded-lg bg-primary/10">
              <AvatarImage src="/logo.png" alt="CodStats logo" />
              <AvatarFallback className="rounded-lg font-semibold">
                CS
              </AvatarFallback>
            </Avatar>
            <span className="truncate">{STAFF_CONSOLE_TITLE}</span>
          </Link>
          <Separator className="hidden h-5 md:block" orientation="vertical" />
          <div className="hidden min-w-0 md:block">
            <StaffConsoleBreadcrumb currentLabel={currentRoute.label} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              <IconArrowBack aria-hidden="true" data-icon="inline-start" />
              <span className="hidden sm:inline">Return to App</span>
              <span className="sm:hidden">Return</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="border-t border-border/50 px-4 py-2 md:hidden">
        <StaffConsoleBreadcrumb currentLabel={currentRoute.label} />
      </div>
    </header>
  )
}
