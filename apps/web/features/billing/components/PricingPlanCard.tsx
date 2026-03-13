"use client"

import { IconCheck } from "@tabler/icons-react"
import { Badge } from "@workspace/ui/components/badge"
import { RadioGroupItem } from "@workspace/ui/components/radio-group"
import { cn } from "@workspace/ui/lib/utils"

import type {
  BillingInterval,
  PricingCatalogPlan,
} from "@/features/billing/lib/billing-types"
import { formatCurrencyAmount } from "@/features/billing/lib/format"

function getRelationshipLabel(plan: PricingCatalogPlan) {
  switch (plan.relationship) {
    case "current":
      return "Current"
    case "upgrade":
      return "Upgrade"
    case "downgrade":
      return "Downgrade"
    case "switch":
      return "Update"
    default:
      return "Available"
  }
}

export function PricingPlanCard(args: {
  featureSlotCount?: number
  inputId: string
  interval: BillingInterval
  plan: PricingCatalogPlan
  selected?: boolean
}) {
  const price =
    args.interval === "year" ? args.plan.pricing.year : args.plan.pricing.month
  const isFreePlan = args.plan.planType === "free" || !price
  const featureSlotCount = Math.max(
    args.featureSlotCount ?? args.plan.features.length,
    args.plan.features.length
  )
  const featureSlots = Array.from(
    { length: featureSlotCount },
    (_, index) => args.plan.features[index] ?? null
  )

  function handleSelectPlan() {
    const control = document.getElementById(args.inputId)

    if (control instanceof HTMLElement) {
      control.click()
    }
  }

  return (
    <div
      className={cn(
        "relative block h-full rounded-[15px] border border-border/70 bg-muted/20 p-px text-left shadow-[0_1px_0_rgba(255,255,255,0.03),0_10px_24px_-18px_rgba(0,0,0,0.65)] transition-colors outline-none",
        args.selected && "border-primary/35"
      )}
      onClick={handleSelectPlan}
    >
      <RadioGroupItem
        aria-label={`Select ${args.plan.name}`}
        className="absolute right-4 top-4 z-10 border-border/60 bg-background/55 shadow-none after:hidden focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-primary/15 dark:bg-background/55 data-checked:border-border/60 data-checked:bg-primary/[0.08] dark:data-checked:bg-primary/[0.08]"
        id={args.inputId}
        value={args.plan.planKey}
      />

      <div
        className={cn(
          "flex h-full flex-col rounded-[14px] bg-background/80 transition-colors",
          args.selected && "bg-primary/[0.08]"
        )}
      >
        <div className="rounded-t-[14px] rounded-b-[11px] bg-card/95 px-5 py-5 shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_24px_-18px_rgba(0,0,0,0.72)]">
          <div className="grid min-h-[11.5rem] gap-5">
            <div className="space-y-2 pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-base font-semibold">{args.plan.name}</div>
                <Badge variant={args.selected ? "secondary" : "outline"}>
                  {getRelationshipLabel(args.plan)}
                </Badge>
              </div>
              <div className="line-clamp-3 leading-5 text-muted-foreground">
                {args.plan.description}
              </div>
            </div>

            <div className="flex items-end justify-between gap-4">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-semibold tracking-tight">
                  {isFreePlan
                    ? "Free"
                    : formatCurrencyAmount(price.amount, price.currency)}
                </span>
                {!isFreePlan ? (
                  <span className="pb-1 text-sm text-muted-foreground">
                    / {args.interval}
                  </span>
                ) : null}
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {isFreePlan
                  ? "No renewal charge"
                  : args.interval === "year"
                  ? "Billed once yearly"
                  : "Renews monthly"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 px-5 pt-4">
          <div className="grid content-start gap-y-1.5">
            {featureSlots.map((feature, index) =>
              feature ? (
                <div
                  className="flex min-h-8 items-start gap-2 text-sm text-foreground/90"
                  key={feature.featureKey}
                >
                  <IconCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-emerald-500"
                  />
                  <span className="leading-5">{feature.name}</span>
                </div>
              ) : (
                <div
                  aria-hidden="true"
                  className="invisible flex min-h-8 items-start gap-2 text-sm"
                  key={`feature-slot-${index}`}
                >
                  <IconCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span className="leading-5">Placeholder</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
