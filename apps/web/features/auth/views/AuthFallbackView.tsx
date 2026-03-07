"use client"

import Link from "next/link"
import { IconLockAccess } from "@tabler/icons-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

type AuthFallbackViewProps = {
  redirectTo: string | null
  signInHref: string
  signUpHref: string
}

export function AuthFallbackView({
  redirectTo,
  signInHref,
  signUpHref,
}: AuthFallbackViewProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-16 sm:px-6 lg:px-8">
      <Card className="w-full max-w-lg border-border/70 bg-card/95 shadow-sm">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11 rounded-xl bg-primary/10">
              <AvatarImage src="/logo.png" alt="CodStats logo" />
              <AvatarFallback className="rounded-xl font-semibold">
                CS
              </AvatarFallback>
            </Avatar>

            <div className="space-y-1">
              <Badge variant="secondary" className="gap-1 rounded-full">
                <IconLockAccess className="size-3.5" />
                Protected Area
              </Badge>
              <CardTitle className="text-xl">Sign in to continue</CardTitle>
            </div>
          </div>

          <CardDescription className="text-sm leading-relaxed">
            This page requires an active CodStats session. Clerk middleware
            normally redirects before protected UI renders, and this fallback
            keeps the route stable if that redirect is missed.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
            <p className="text-sm font-medium text-foreground">
              Requested destination
            </p>
            <p className="mt-1 text-sm break-all text-muted-foreground">
              {redirectTo}
            </p>
          </div>

          <p className="text-sm text-muted-foreground">
            Use the existing Clerk sign-in flow, then return to the protected
            area once your session is ready.
          </p>
        </CardContent>

        <CardFooter className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href={signInHref}>Continue to sign in</Link>
          </Button>

          <Button asChild variant="outline">
            <Link href={signUpHref}>Create account</Link>
          </Button>

          <Button asChild variant="ghost" className="ml-auto">
            <Link href="/">Back to landing page</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
