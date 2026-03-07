import { UserButton } from "@clerk/nextjs"
import Link from "next/link"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"

type AppShellProps = {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-md text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Avatar className="h-8 w-8 rounded-lg bg-primary/10">
                <AvatarImage src="/logo.png" alt="CodStats logo" />
                <AvatarFallback className="rounded-lg font-semibold">
                  CS
                </AvatarFallback>
              </Avatar>
              CodStats
            </Link>

            <nav
              aria-label="Protected"
              className="hidden items-center gap-2 md:flex"
            >
              <Button asChild size="sm" variant="ghost">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href="/account">Account</Link>
              </Button>
            </nav>
          </div>

          <UserButton
            showName
            userProfileMode="navigation"
            userProfileUrl="/account"
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
