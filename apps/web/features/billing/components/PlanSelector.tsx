"use client"

import {
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import { RadioGroup } from "@workspace/ui/components/radio-group"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { PricingPlanCard } from "@/features/billing/components/PricingPlanCard"
import type {
  BillingInterval,
  PricingCatalogPlan,
} from "@/features/billing/lib/billing-types"

export function PlanSelector(args: {
  interval: BillingInterval
  onIntervalChange: (interval: BillingInterval) => void
  onSelectPlan: (planKey: string) => void
  plans: PricingCatalogPlan[]
  selectedPlanKey: string
}) {
  const featureSlotCount = args.plans.reduce(
    (max, plan) => Math.max(max, plan.features.length),
    0
  )

  return (
    <FieldSet className="gap-5">
      <FieldLegend className="sr-only">Choose a billing plan</FieldLegend>
      <Tabs
        className="gap-5"
        onValueChange={(value) => {
          if (value === "month" || value === "year") {
            args.onIntervalChange(value)
          }
        }}
        value={args.interval}
      >
        <TabsList className="w-fit">
          <TabsTrigger value="month">Monthly</TabsTrigger>
          <TabsTrigger value="year">Yearly</TabsTrigger>
        </TabsList>
      </Tabs>
      <RadioGroup
        className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3"
        onValueChange={args.onSelectPlan}
        value={args.selectedPlanKey}
      >
        {args.plans.map((plan) => (
          <PricingPlanCard
            featureSlotCount={featureSlotCount}
            inputId={`billing-plan-${args.interval}-${plan.planKey}`}
            interval={args.interval}
            key={`${args.interval}-${plan.planKey}`}
            plan={plan}
            selected={args.selectedPlanKey === plan.planKey}
          />
        ))}
      </RadioGroup>
    </FieldSet>
  )
}
