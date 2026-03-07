"use client"

import { Suspense } from "react"
import { AuthLoading, Authenticated, Unauthenticated } from "convex/react"
import { usePathname, useSearchParams } from "next/navigation"

import { AppShellLoadingView } from "@/features/auth/components/AppShellLoadingView"
import {
  buildAuthHref,
  buildProtectedRedirectTarget,
} from "@/features/auth/lib/auth-redirects"
import { AuthFallbackView } from "@/features/auth/views/AuthFallbackView"

type AppAuthGateProps = {
  children: React.ReactNode
}

export function AppAuthGate({ children }: AppAuthGateProps) {
  return (
    <Suspense fallback={<AppShellLoadingView />}>
      <AppAuthGateContent>{children}</AppAuthGateContent>
    </Suspense>
  )
}

function AppAuthGateContent({ children }: AppAuthGateProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const redirectTo = buildProtectedRedirectTarget(
    pathname,
    searchParams.toString()
  )

  return (
    <>
      <AuthLoading>
        <AppShellLoadingView />
      </AuthLoading>

      <Unauthenticated>
        <AuthFallbackView
          redirectTo={redirectTo}
          signInHref={buildAuthHref("/sign-in", redirectTo)}
          signUpHref={buildAuthHref("/sign-up", redirectTo)}
        />
      </Unauthenticated>

      <Authenticated>{children}</Authenticated>
    </>
  )
}
