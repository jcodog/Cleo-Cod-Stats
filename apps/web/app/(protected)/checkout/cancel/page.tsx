import Link from "next/link"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

export default function CheckoutCancelPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center">
      <Card className="w-full border-border/70 bg-card/95 shadow-sm">
        <CardHeader>
          <CardTitle>Checkout cancelled</CardTitle>
          <CardDescription>
            No billing change was finalized. You can return to checkout or
            review the current billing state from billing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/checkout">Back to checkout</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/settings/billing">Open billing</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
