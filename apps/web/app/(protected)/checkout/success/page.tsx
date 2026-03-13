import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function CheckoutSuccessPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center">
      <Card className="w-full border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Billing confirmation received</CardTitle>
          <CardDescription>
            Stripe confirmation completed. Billing access and final lifecycle
            state will reconcile through webhooks and then appear in billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/settings/billing">Open billing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Return to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
