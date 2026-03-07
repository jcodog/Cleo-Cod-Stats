import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export function DashboardView() {
  return (
    <section className="flex flex-1 items-center justify-center">
      <Card className="w-full max-w-2xl border-border/70 bg-card/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">This is the dashboard home</CardTitle>
          <CardDescription>
            This is currently a work in progress for your stats. Please have
            patience as we add new features.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild variant="outline">
            <Link href="/account">Manage account settings</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
