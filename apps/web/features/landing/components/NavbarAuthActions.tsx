"use client"

import { Authenticated, Unauthenticated } from "convex/react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

export function NavbarAuthActions() {
  return (
    <>
      <Authenticated>
        <Button asChild size="lg" className="h-9 px-4 text-sm">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </Authenticated>

      <Unauthenticated>
        <Button asChild variant="ghost" size="lg" className="h-9 px-4 text-sm">
          <Link href="/sign-in">Sign In</Link>
        </Button>
        <Button asChild size="lg" className="h-9 px-4 text-sm">
          <Link href="/sign-up">Sign Up</Link>
        </Button>
      </Unauthenticated>
    </>
  )
}
