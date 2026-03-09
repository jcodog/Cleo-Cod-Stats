"use client"

import {
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  IconDotsVertical,
  IconPlugConnected,
  IconSettings,
} from "@tabler/icons-react"
import type {
  StaffBillingDashboard,
  StaffBillingFeatureRecord,
  StaffBillingPlanRecord,
  StaffImpactPreview,
  StaffMutationResponse,
} from "@workspace/backend/convex/lib/staffTypes"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "sonner"

import { StaffDataTable } from "@/features/staff/components/StaffDataTable"
import type { BillingActionRequest } from "@/features/staff/lib/staff-schemas"
import {
  StaffClientError,
  useStaffBillingClient,
  useStaffBillingDashboard,
  useStaffMutation,
} from "@/features/staff/lib/staff-client"

type PlanFormState = {
  active: boolean
  currency: string
  description: string
  featureKeys: string[]
  key: string
  monthlyPriceAmount: string
  mode: "create" | "edit"
  name: string
  planType: "free" | "paid"
  sortOrder: string
  yearlyPriceAmount: string
}

type FeatureFormState = {
  active: boolean
  appliesTo: "both" | "entitlement" | "marketing"
  category: string
  description: string
  key: string
  mode: "create" | "edit"
  name: string
  sortOrder: string
}

type ArchivePlanState = {
  cancelAtPeriodEnd: boolean
  confirmation: string
  plan: StaffBillingPlanRecord
  preview: StaffImpactPreview | null
}

type ReplacePriceState = {
  amount: string
  confirmation: string
  interval: "month" | "year"
  plan: StaffBillingPlanRecord
  preview: StaffImpactPreview | null
}

type ArchiveFeatureState = {
  confirmation: string
  feature: StaffBillingFeatureRecord
  preview: StaffImpactPreview | null
}

type PlanFeatureSyncState = {
  addedFeatureKeys: string[]
  plan: StaffBillingPlanRecord
  planForm: PlanFormState
  preview: StaffImpactPreview
  removedFeatureKeys: string[]
}

type AssignmentEditorState = {
  featureKey: string
  planKeys: string[]
}

type FeatureAssignmentSyncState = {
  addedPlanKeys: string[]
  feature: StaffBillingFeatureRecord
  planKeys: string[]
  preview: StaffImpactPreview
  removedPlanKeys: string[]
}

type MultiSelectOption = {
  description?: string
  disabled?: boolean
  label: string
  value: string
}

function formatCurrencyAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(amount / 100)
}

function normalizeKeys(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function sameKeySet(left: string[], right: string[]) {
  const normalizedLeft = normalizeKeys(left)
  const normalizedRight = normalizeKeys(right)

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

function diffKeys(args: { next: string[]; previous: string[] }) {
  const previousValues = new Set(args.previous)
  const nextValues = new Set(args.next)

  return {
    added: args.next.filter((value) => !previousValues.has(value)),
    removed: args.previous.filter((value) => !nextValues.has(value)),
  }
}

function SyncStatusBadge({ status }: { status: StaffBillingPlanRecord["syncStatus"] }) {
  if (status === "ready") {
    return <Badge variant="secondary">Ready</Badge>
  }

  if (status === "attention") {
    return <Badge variant="destructive">Attention</Badge>
  }

  if (status === "archived") {
    return <Badge variant="outline">Archived</Badge>
  }

  return <Badge variant="outline">App only</Badge>
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

function ImpactSummary({
  preview,
}: {
  preview: StaffImpactPreview | null
}) {
  if (!preview) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        Loading operational impact preview...
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm">
      <p className="font-medium">{preview.summary}</p>
      <p className="mt-2 text-muted-foreground">
        {preview.counts.activeSubscriptions} active subscription(s) across{" "}
        {preview.counts.affectedUsers} user(s) are in scope.
      </p>
      {preview.warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-amber-700 dark:text-amber-300">
          {preview.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ChangeSummary(args: {
  addedLabel: string
  addedValues: string[]
  labelByKey: Map<string, string>
  removedLabel: string
  removedValues: string[]
}) {
  if (args.addedValues.length === 0 && args.removedValues.length === 0) {
    return (
      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
        No assignment changes are queued.
      </div>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <div className="text-sm font-medium">{args.addedLabel}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {args.addedValues.length > 0 ? (
            args.addedValues.map((value) => (
              <Badge key={value} variant="secondary">
                {args.labelByKey.get(value) ?? value}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </div>
      </div>
      <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3">
        <div className="text-sm font-medium">{args.removedLabel}</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {args.removedValues.length > 0 ? (
            args.removedValues.map((value) => (
              <Badge key={value} variant="outline">
                {args.labelByKey.get(value) ?? value}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">None</span>
          )}
        </div>
      </div>
    </div>
  )
}

function MultiSelectCombobox(args: {
  emptyLabel: string
  onChange: (values: string[]) => void
  options: MultiSelectOption[]
  placeholder: string
  portalContainer?: RefObject<HTMLElement | null>
  value: string[]
}) {
  const anchorRef = useComboboxAnchor()
  const [query, setQuery] = useState("")
  const selectedOptions = args.options.filter((option) =>
    args.value.includes(option.value)
  )
  const availableOptions = args.options.filter((option) => {
    if (!query.trim()) {
      return true
    }

    const normalizedQuery = query.trim().toLowerCase()

    return (
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery)
    )
  })

  return (
    <Combobox
      items={availableOptions}
      itemToStringLabel={(item: MultiSelectOption) => item.label}
      itemToStringValue={(item: MultiSelectOption) => item.value}
      isItemEqualToValue={(item: MultiSelectOption, value: MultiSelectOption) =>
        item.value === value.value
      }
      multiple
      onInputValueChange={setQuery}
      onValueChange={(values) =>
        args.onChange(
          normalizeKeys(
            Array.isArray(values) ? values.map((value) => value.value) : []
          )
        )
      }
      value={selectedOptions}
    >
      <ComboboxChips className="min-h-11" ref={anchorRef}>
        {selectedOptions.map((option) => (
          <ComboboxChip key={option.value}>
            {option.label}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput className="min-w-24" placeholder={args.placeholder} />
      </ComboboxChips>
      <ComboboxContent anchor={anchorRef} container={args.portalContainer}>
        <ComboboxList>
          <ComboboxEmpty>{args.emptyLabel}</ComboboxEmpty>
          <ComboboxCollection>
            {(item: MultiSelectOption, index: number) => (
              <ComboboxItem
                disabled={item.disabled}
                index={index}
                key={item.value}
                value={item}
              >
                <div className="flex flex-col">
                  <span>{item.label}</span>
                  {item.description ? (
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  ) : null}
                </div>
              </ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export function StaffBillingView({
  initialData,
}: {
  initialData: StaffBillingDashboard
}) {
  const { data } = useStaffBillingDashboard(initialData)
  const billingClient = useStaffBillingClient()
  const [planForm, setPlanForm] = useState<PlanFormState | null>(null)
  const [featureForm, setFeatureForm] = useState<FeatureFormState | null>(null)
  const [archivePlanState, setArchivePlanState] = useState<ArchivePlanState | null>(null)
  const [replacePriceState, setReplacePriceState] = useState<ReplacePriceState | null>(null)
  const [archiveFeatureState, setArchiveFeatureState] =
    useState<ArchiveFeatureState | null>(null)
  const [planFeatureSyncState, setPlanFeatureSyncState] =
    useState<PlanFeatureSyncState | null>(null)
  const [assignmentEditor, setAssignmentEditor] = useState<AssignmentEditorState>(() => {
    const initialFeature =
      initialData.features.find((feature) => feature.active) ?? initialData.features[0]

    return {
      featureKey: initialFeature?.key ?? "",
      planKeys: initialFeature?.linkedPlanKeys ?? [],
    }
  })
  const [featureAssignmentSyncState, setFeatureAssignmentSyncState] =
    useState<FeatureAssignmentSyncState | null>(null)
  const billingMutation = useStaffMutation<BillingActionRequest, StaffMutationResponse>({
    invalidate: ["billing"],
    mutationFn: (request) => billingClient.runAction<StaffMutationResponse>(request),
  })
  const featureLabelByKey = new Map<string, string>(
    data.features.map((feature) => [feature.key, feature.name])
  )
  const planLabelByKey = new Map<string, string>(
    data.plans.map((plan) => [plan.key, plan.name])
  )
  const featureOptions: MultiSelectOption[] = data.features
    .filter((feature) => feature.active)
    .map((feature) => ({
      description:
        feature.appliesTo === "both"
          ? "Entitlement and marketing"
          : feature.appliesTo,
      label: feature.name,
      value: feature.key,
    }))
  const planOptions: MultiSelectOption[] = data.plans.map((plan) => ({
    description: `${plan.activeSubscriptionCount} active subscription(s)`,
    label: plan.name,
    value: plan.key,
  }))
  const defaultAssignmentFeature =
    data.features.find((feature) => feature.active) ?? data.features[0] ?? null
  const selectedAssignmentFeature =
    data.features.find((feature) => feature.key === assignmentEditor.featureKey) ??
    defaultAssignmentFeature
  const assignmentPlanKeys =
    selectedAssignmentFeature?.key === assignmentEditor.featureKey
      ? assignmentEditor.planKeys
      : selectedAssignmentFeature?.linkedPlanKeys ?? []
  const assignmentChanged = selectedAssignmentFeature
    ? !sameKeySet(selectedAssignmentFeature.linkedPlanKeys, assignmentPlanKeys)
    : false

  const planColumns: Array<ColumnDef<StaffBillingPlanRecord>> = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.key}</span>
        </div>
      ),
      header: "Plan",
    },
    {
      accessorKey: "planType",
      cell: ({ getValue }) => (
        <Badge variant={getValue<"free" | "paid">() === "paid" ? "secondary" : "outline"}>
          {getValue<string>()}
        </Badge>
      ),
      header: "Type",
    },
    {
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>
            {formatCurrencyAmount(row.original.monthlyPriceAmount, row.original.currency)} / month
          </span>
          <span className="text-xs text-muted-foreground">
            {formatCurrencyAmount(row.original.yearlyPriceAmount, row.original.currency)} / year
          </span>
        </div>
      ),
      header: "Current prices",
      id: "pricing",
    },
    {
      accessorKey: "includedFeatureKeys",
      cell: ({ getValue }) =>
        getValue<string[]>().length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {getValue<string[]>().map((featureKey) => (
              <Badge key={featureKey} variant="outline">
                {featureLabelByKey.get(featureKey) ?? featureKey}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No features</span>
        ),
      header: "Included features",
    },
    {
      cell: ({ row }) => (
        <div className="flex max-w-[20rem] flex-col gap-1 text-xs text-muted-foreground">
          <span>{row.original.stripeProductId ?? "No Stripe product"}</span>
          {row.original.planType === "paid" ? (
            <>
              <span>{row.original.monthlyPriceId ?? "No monthly price"}</span>
              <span>{row.original.yearlyPriceId ?? "No yearly price"}</span>
            </>
          ) : null}
        </div>
      ),
      header: "Stripe refs",
      id: "stripeRefs",
    },
    {
      accessorKey: "activeSubscriptionCount",
      header: "Active subscriptions",
    },
    {
      accessorKey: "syncStatus",
      cell: ({ getValue }) => (
        <SyncStatusBadge status={getValue<StaffBillingPlanRecord["syncStatus"]>()} />
      ),
      header: "Sync",
    },
    {
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <IconDotsVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => setPlanForm(makePlanFormState("edit", row.original))}
              >
                Edit plan
              </DropdownMenuItem>
              {row.original.planType === "paid" ? (
                <>
                  <DropdownMenuItem
                    onClick={() => void openReplacePriceDialog(row.original, "month")}
                  >
                    Replace monthly price
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => void openReplacePriceDialog(row.original, "year")}
                  >
                    Replace yearly price
                  </DropdownMenuItem>
                </>
              ) : null}
              {row.original.active ? (
                <DropdownMenuItem
                  onClick={() => void openArchivePlanDialog(row.original)}
                  variant="destructive"
                >
                  Archive plan
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void restorePlan(row.original)}>
                  Restore plan
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableGlobalFilter: false,
      header: "",
      id: "actions",
    },
  ]

  const featureColumns: Array<ColumnDef<StaffBillingFeatureRecord>> = [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">{row.original.key}</span>
        </div>
      ),
      header: "Feature",
    },
    {
      accessorKey: "appliesTo",
      cell: ({ getValue }) => (
        <Badge variant="outline">{getValue<StaffBillingFeatureRecord["appliesTo"]>()}</Badge>
      ),
      header: "Applies to",
    },
    {
      accessorKey: "active",
      cell: ({ getValue }) => (
        <Badge variant={getValue<boolean>() ? "secondary" : "outline"}>
          {getValue<boolean>() ? "Active" : "Archived"}
        </Badge>
      ),
      header: "Status",
    },
    {
      accessorKey: "linkedPlanKeys",
      cell: ({ getValue }) =>
        getValue<string[]>().length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {getValue<string[]>().map((planKey) => (
              <Badge key={planKey} variant="outline">
                {planLabelByKey.get(planKey) ?? planKey}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">No plans</span>
        ),
      header: "Linked plans",
    },
    {
      accessorKey: "stripeFeatureId",
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">
          {getValue<string | undefined>() ?? "Not synced"}
        </span>
      ),
      header: "Stripe feature",
    },
    {
      accessorKey: "activeSubscriptionCount",
      header: "Subscription reach",
    },
    {
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost">
              <IconDotsVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => setFeatureForm(makeFeatureFormState("edit", row.original))}
              >
                Edit feature
              </DropdownMenuItem>
              {row.original.active ? (
                <DropdownMenuItem
                  onClick={() => void openArchiveFeatureDialog(row.original)}
                  variant="destructive"
                >
                  Archive feature
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => void restoreFeature(row.original)}>
                  Restore feature
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableGlobalFilter: false,
      header: "",
      id: "actions",
    },
  ]

  async function handleMutationResult(result: StaffMutationResponse) {
    toast.success(result.summary)

    if (result.syncSummary?.result === "warning") {
      toast.warning(result.syncSummary.summary)
    }

    if (result.syncSummary?.result === "error") {
      toast.error(result.syncSummary.summary)
    }
  }

  async function openArchivePlanDialog(plan: StaffBillingPlanRecord) {
    setArchivePlanState({
      cancelAtPeriodEnd: false,
      confirmation: "",
      plan,
      preview: null,
    })

    try {
      const preview = await billingClient.runAction<StaffImpactPreview>({
        action: "previewPlanArchive",
        input: { planKey: plan.key },
      })
      setArchivePlanState((current) => (current ? { ...current, preview } : current))
    } catch (error) {
      toast.error(error instanceof StaffClientError ? error.message : "Preview failed.")
    }
  }

  async function openReplacePriceDialog(
    plan: StaffBillingPlanRecord,
    interval: "month" | "year"
  ) {
    setReplacePriceState({
      amount: String(
        interval === "month" ? plan.monthlyPriceAmount : plan.yearlyPriceAmount
      ),
      confirmation: "",
      interval,
      plan,
      preview: null,
    })

    try {
      const preview = await billingClient.runAction<StaffImpactPreview>({
        action: "previewPriceReplacement",
        input: { interval, planKey: plan.key },
      })
      setReplacePriceState((current) => (current ? { ...current, preview } : current))
    } catch (error) {
      toast.error(error instanceof StaffClientError ? error.message : "Preview failed.")
    }
  }

  async function openArchiveFeatureDialog(feature: StaffBillingFeatureRecord) {
    setArchiveFeatureState({
      confirmation: "",
      feature,
      preview: null,
    })

    try {
      const preview = await billingClient.runAction<StaffImpactPreview>({
        action: "previewFeatureArchive",
        input: { featureKey: feature.key },
      })
      setArchiveFeatureState((current) => (current ? { ...current, preview } : current))
    } catch (error) {
      toast.error(error instanceof StaffClientError ? error.message : "Preview failed.")
    }
  }

  async function persistPlan(planToSave: PlanFormState) {
    const result = await billingMutation.mutateAsync({
      action: "upsertPlan",
      input: {
        active: planToSave.active,
        currency: planToSave.currency,
        description: planToSave.description,
        featureKeys: normalizeKeys(planToSave.featureKeys),
        key: planToSave.key,
        monthlyPriceAmount: Number(planToSave.monthlyPriceAmount),
        name: planToSave.name,
        planType: planToSave.planType,
        sortOrder: Number(planToSave.sortOrder),
        yearlyPriceAmount: Number(planToSave.yearlyPriceAmount),
      },
    })
    await handleMutationResult(result)
    setPlanForm(null)
  }

  async function submitPlanForm() {
    if (!planForm) {
      return
    }

    const existingPlan = data.plans.find((plan) => plan.key === planForm.key)
    const nextFeatureKeys = normalizeKeys(planForm.featureKeys)

    if (existingPlan && !sameKeySet(existingPlan.includedFeatureKeys, nextFeatureKeys)) {
      try {
        const preview = await billingClient.runAction<StaffImpactPreview>({
          action: "previewPlanFeatureSync",
          input: {
            featureKeys: nextFeatureKeys,
            planKey: existingPlan.key,
          },
        })
        const { added, removed } = diffKeys({
          next: nextFeatureKeys,
          previous: existingPlan.includedFeatureKeys,
        })

        setPlanFeatureSyncState({
          addedFeatureKeys: added,
          plan: existingPlan,
          planForm: { ...planForm, featureKeys: nextFeatureKeys },
          preview,
          removedFeatureKeys: removed,
        })
        return
      } catch (error) {
        toast.error(
          error instanceof StaffClientError ? error.message : "Preview failed."
        )
        return
      }
    }

    try {
      await persistPlan({ ...planForm, featureKeys: nextFeatureKeys })
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Plan update failed."
      )
    }
  }

  async function submitFeatureForm() {
    if (!featureForm) {
      return
    }

    try {
      const result = await billingMutation.mutateAsync({
        action: "upsertFeature",
        input: {
          active: featureForm.active,
          appliesTo: featureForm.appliesTo,
          category: featureForm.category || undefined,
          description: featureForm.description,
          key: featureForm.key,
          name: featureForm.name,
          sortOrder: Number(featureForm.sortOrder),
        },
      })
      await handleMutationResult(result)
      setFeatureForm(null)
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Feature update failed."
      )
    }
  }

  async function restorePlan(plan: StaffBillingPlanRecord) {
    try {
      const result = await billingMutation.mutateAsync({
        action: "upsertPlan",
        input: {
          active: true,
          currency: plan.currency,
          description: plan.description,
          featureKeys: plan.includedFeatureKeys,
          key: plan.key,
          monthlyPriceAmount: plan.monthlyPriceAmount,
          name: plan.name,
          planType: plan.planType,
          sortOrder: plan.sortOrder,
          yearlyPriceAmount: plan.yearlyPriceAmount,
        },
      })
      await handleMutationResult(result)
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Plan restore failed."
      )
    }
  }

  async function restoreFeature(feature: StaffBillingFeatureRecord) {
    try {
      const result = await billingMutation.mutateAsync({
        action: "upsertFeature",
        input: {
          active: true,
          appliesTo: feature.appliesTo,
          category: feature.category,
          description: feature.description,
          key: feature.key,
          name: feature.name,
          sortOrder: feature.sortOrder,
        },
      })
      await handleMutationResult(result)
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Feature restore failed."
      )
    }
  }

  async function runManualSync() {
    try {
      const result = await billingMutation.mutateAsync({
        action: "runCatalogSync",
        input: {},
      })
      await handleMutationResult(result)
    } catch (error) {
      toast.error(error instanceof StaffClientError ? error.message : "Sync failed.")
    }
  }

  async function reviewFeatureAssignments() {
    if (!selectedAssignmentFeature) {
      return
    }

    const nextPlanKeys = normalizeKeys(assignmentPlanKeys)

    try {
      const preview = await billingClient.runAction<StaffImpactPreview>({
        action: "previewFeatureAssignmentSync",
        input: {
          featureKey: selectedAssignmentFeature.key,
          planKeys: nextPlanKeys,
        },
      })
      const { added, removed } = diffKeys({
        next: nextPlanKeys,
        previous: selectedAssignmentFeature.linkedPlanKeys,
      })

      setFeatureAssignmentSyncState({
        addedPlanKeys: added,
        feature: selectedAssignmentFeature,
        planKeys: nextPlanKeys,
        preview,
        removedPlanKeys: removed,
      })
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Preview failed."
      )
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconSettings />
          Staff and admin billing controls
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing operations</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Edit the Convex billing catalog, preview operational impact, and keep
          Stripe synchronized without hidden destructive changes.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Plans" value={data.plans.length} />
        <MetricCard label="Features" value={data.features.length} />
        <MetricCard label="Active subscriptions" value={data.activeSubscriptionCount} />
        <MetricCard
          label="Last sync"
          value={data.lastSync ? data.lastSync.result : "never"}
        />
      </div>

      <Tabs className="gap-6" defaultValue="plans">
        <TabsList variant="line">
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="operations">Operations</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="plans">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Plans</CardTitle>
              <CardDescription>
                Create, edit, archive, and replace managed billing plans and prices.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StaffDataTable
                columns={planColumns}
                data={data.plans}
                emptyDescription="Create the first billing plan to start syncing catalog data."
                emptyTitle="No plans yet"
                getRowId={(row) => row.key}
                searchPlaceholder="Search plans"
                toolbar={
                  <Button onClick={() => setPlanForm(makePlanFormState("create"))}>
                    New plan
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Features</CardTitle>
              <CardDescription>
                Distinguish entitlement features from marketing-only copy and keep assignments explicit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StaffDataTable
                columns={featureColumns}
                data={data.features}
                emptyDescription="Create the first feature to start mapping plans to entitlements."
                emptyTitle="No features yet"
                getRowId={(row) => row.key}
                searchPlaceholder="Search features"
                toolbar={
                  <Button onClick={() => setFeatureForm(makeFeatureFormState("create"))}>
                    New feature
                  </Button>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments">
          <div className="grid gap-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Assignment editor</CardTitle>
                <CardDescription>
                  Pick a feature, choose every plan it should belong to, and review the impact before syncing.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                {selectedAssignmentFeature ? (
                  <>
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                      <Field>
                        <FieldLabel>Feature</FieldLabel>
                        <NativeSelect
                          onChange={(event) => {
                            const nextFeature = data.features.find(
                              (feature) => feature.key === event.target.value
                            )

                            setAssignmentEditor({
                              featureKey: event.target.value,
                              planKeys: nextFeature?.linkedPlanKeys ?? [],
                            })
                          }}
                          value={selectedAssignmentFeature.key}
                        >
                          {data.features
                            .filter((feature) => feature.active)
                            .map((feature) => (
                              <NativeSelectOption key={feature.key} value={feature.key}>
                                {feature.name}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                        <FieldDescription>
                          Archived features cannot be assigned to plans.
                        </FieldDescription>
                      </Field>

                      <Field>
                        <FieldLabel>Assigned plans</FieldLabel>
                        <MultiSelectCombobox
                          emptyLabel="No plans match this search."
                          onChange={(values) =>
                            setAssignmentEditor((current) => ({
                              ...current,
                              featureKey: selectedAssignmentFeature.key,
                              planKeys: values,
                            }))
                          }
                          options={planOptions}
                          placeholder="Search plans"
                          value={assignmentPlanKeys}
                        />
                        <FieldDescription>
                          Removing a plan here detaches the feature on the next sync. Saving uses the exact set shown above.
                        </FieldDescription>
                      </Field>
                    </div>

                    <div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-muted/20 px-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="space-y-1 text-sm">
                        <div className="font-medium">
                          {selectedAssignmentFeature.name} is currently linked to{" "}
                          {selectedAssignmentFeature.linkedPlanKeys.length} plan(s).
                        </div>
                        <div className="text-muted-foreground">
                          Review the impact before changing entitlement or marketing coverage.
                        </div>
                      </div>
                      <Button
                        disabled={!assignmentChanged || billingMutation.isPending}
                        onClick={() => void reviewFeatureAssignments()}
                      >
                        Review assignment impact
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                    Create an active feature before configuring assignments.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Plan-feature matrix</CardTitle>
                <CardDescription>
                  Review what each plan includes before changing entitlements or marketing copy.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature</TableHead>
                      {data.plans.map((plan) => (
                        <TableHead key={plan.key}>{plan.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.features.map((feature) => (
                      <TableRow key={feature.key}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{feature.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {feature.appliesTo}
                            </span>
                          </div>
                        </TableCell>
                        {data.plans.map((plan) => (
                          <TableCell key={`${plan.key}:${feature.key}`}>
                            <Badge
                              variant={
                                plan.includedFeatureKeys.includes(feature.key)
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {plan.includedFeatureKeys.includes(feature.key)
                                ? "Included"
                                : "Not included"}
                            </Badge>
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Catalog sync</CardTitle>
                <CardDescription>
                  Convex is the editable source of truth. Sync pushes the current managed catalog to Stripe.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-3 text-sm">
                  {data.lastSync ? data.lastSync.summary : "No sync has completed yet."}
                </div>
                <Button
                  disabled={billingMutation.isPending}
                  onClick={() => void runManualSync()}
                >
                  <IconPlugConnected data-icon="inline-start" />
                  Run manual sync
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle>Active subscriptions</CardTitle>
                <CardDescription>
                  The rows below are the subscriptions most likely to be impacted by plan and price operations.
                </CardDescription>
              </CardHeader>
              <CardContent className="rounded-lg border border-border/70 p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.subscriptions.map((subscription) => (
                      <TableRow key={subscription.stripeSubscriptionId}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{subscription.userName}</span>
                            <span className="text-xs text-muted-foreground">
                              {subscription.email ?? subscription.clerkUserId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{subscription.planKey}</TableCell>
                        <TableCell>{subscription.status}</TableCell>
                        <TableCell className="max-w-[16rem] break-all text-xs text-muted-foreground">
                          {subscription.stripePriceId}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-border/70">
            <CardHeader>
              <CardTitle>Billing audit log</CardTitle>
              <CardDescription>
                Catalog changes, sync runs, assignment updates, and destructive operations are captured here.
              </CardDescription>
            </CardHeader>
            <CardContent className="rounded-lg border border-border/70 p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(log.createdAt)}
                      </TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell className="max-w-xl whitespace-normal">
                        {log.summary}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.result === "success" ? "secondary" : "destructive"}
                        >
                          {log.result}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PlanFormDialog
        billingMutationPending={billingMutation.isPending}
        featureOptions={featureOptions}
        onClose={() => setPlanForm(null)}
        onSave={() => void submitPlanForm()}
        planForm={planForm}
        setPlanForm={setPlanForm}
      />
      <FeatureFormDialog
        billingMutationPending={billingMutation.isPending}
        featureForm={featureForm}
        onClose={() => setFeatureForm(null)}
        onSave={() => void submitFeatureForm()}
        setFeatureForm={setFeatureForm}
      />
      <ArchivePlanDialog
        billingMutationPending={billingMutation.isPending}
        onClose={() => setArchivePlanState(null)}
        onConfirm={async () => {
          if (!archivePlanState) {
            return
          }

          try {
            const result = await billingMutation.mutateAsync({
              action: "archivePlan",
              input: {
                cancelAtPeriodEnd: archivePlanState.cancelAtPeriodEnd,
                confirmationToken: archivePlanState.confirmation,
                planKey: archivePlanState.plan.key,
              },
            })
            await handleMutationResult(result)
            setArchivePlanState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError ? error.message : "Archive failed."
            )
          }
        }}
        setState={setArchivePlanState}
        state={archivePlanState}
      />
      <ReplacePriceDialog
        billingMutationPending={billingMutation.isPending}
        onClose={() => setReplacePriceState(null)}
        onConfirm={async () => {
          if (!replacePriceState) {
            return
          }

          try {
            const result = await billingMutation.mutateAsync({
              action: "replacePlanPrice",
              input: {
                amount: Number(replacePriceState.amount),
                confirmationToken: replacePriceState.confirmation,
                interval: replacePriceState.interval,
                planKey: replacePriceState.plan.key,
              },
            })
            await handleMutationResult(result)
            setReplacePriceState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError ? error.message : "Price replacement failed."
            )
          }
        }}
        setState={setReplacePriceState}
        state={replacePriceState}
      />
      <ArchiveFeatureDialog
        billingMutationPending={billingMutation.isPending}
        onClose={() => setArchiveFeatureState(null)}
        onConfirm={async () => {
          if (!archiveFeatureState) {
            return
          }

          try {
            const result = await billingMutation.mutateAsync({
              action: "archiveFeature",
              input: {
                confirmationToken: archiveFeatureState.confirmation,
                featureKey: archiveFeatureState.feature.key,
              },
            })
            await handleMutationResult(result)
            setArchiveFeatureState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError ? error.message : "Feature archive failed."
            )
          }
        }}
        setState={setArchiveFeatureState}
        state={archiveFeatureState}
      />
      <PlanFeatureSyncDialog
        billingMutationPending={billingMutation.isPending}
        featureLabelByKey={featureLabelByKey}
        onClose={() => setPlanFeatureSyncState(null)}
        onConfirm={async () => {
          if (!planFeatureSyncState) {
            return
          }

          try {
            await persistPlan(planFeatureSyncState.planForm)
            setPlanFeatureSyncState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError ? error.message : "Plan update failed."
            )
          }
        }}
        state={planFeatureSyncState}
      />
      <FeatureAssignmentSyncDialog
        billingMutationPending={billingMutation.isPending}
        onClose={() => setFeatureAssignmentSyncState(null)}
        onConfirm={async () => {
          if (!featureAssignmentSyncState) {
            return
          }

          try {
            const result = await billingMutation.mutateAsync({
              action: "syncFeatureAssignments",
              input: {
                featureKey: featureAssignmentSyncState.feature.key,
                planKeys: featureAssignmentSyncState.planKeys,
              },
            })
            await handleMutationResult(result)
            setAssignmentEditor({
              featureKey: featureAssignmentSyncState.feature.key,
              planKeys: featureAssignmentSyncState.planKeys,
            })
            setFeatureAssignmentSyncState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError
                ? error.message
                : "Assignment update failed."
            )
          }
        }}
        planLabelByKey={planLabelByKey}
        state={featureAssignmentSyncState}
      />
    </div>
  )
}

function makePlanFormState(
  mode: "create" | "edit",
  plan?: StaffBillingPlanRecord
): PlanFormState {
  return {
    active: plan?.active ?? true,
    currency: plan?.currency ?? "gbp",
    description: plan?.description ?? "",
    featureKeys: plan?.includedFeatureKeys ?? [],
    key: plan?.key ?? "",
    mode,
    monthlyPriceAmount: String(plan?.monthlyPriceAmount ?? 0),
    name: plan?.name ?? "",
    planType: plan?.planType ?? "paid",
    sortOrder: String(plan?.sortOrder ?? 0),
    yearlyPriceAmount: String(plan?.yearlyPriceAmount ?? 0),
  }
}

function makeFeatureFormState(
  mode: "create" | "edit",
  feature?: StaffBillingFeatureRecord
): FeatureFormState {
  return {
    active: feature?.active ?? true,
    appliesTo: feature?.appliesTo ?? "both",
    category: feature?.category ?? "",
    description: feature?.description ?? "",
    key: feature?.key ?? "",
    mode,
    name: feature?.name ?? "",
    sortOrder: String(feature?.sortOrder ?? 0),
  }
}

function PlanFormDialog(args: {
  billingMutationPending: boolean
  featureOptions: MultiSelectOption[]
  onClose: () => void
  onSave: () => void
  planForm: PlanFormState | null
  setPlanForm: Dispatch<SetStateAction<PlanFormState | null>>
}) {
  const pricesLocked =
    args.planForm?.mode === "edit" && args.planForm.planType === "paid"
  const featurePickerContainerRef = useRef<HTMLDivElement | null>(null)

  return (
    <Dialog open={Boolean(args.planForm)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {args.planForm?.mode === "edit" ? "Edit plan" : "Create plan"}
          </DialogTitle>
          <DialogDescription>
            Saving updates the Convex catalog first and then reruns Stripe sync.
          </DialogDescription>
        </DialogHeader>

        {args.planForm ? (
          <FieldGroup>
            <Field>
              <FieldLabel>Plan key</FieldLabel>
              <Input
                disabled={args.planForm.mode === "edit"}
                onChange={(event) =>
                  args.setPlanForm((current) =>
                    current ? { ...current, key: event.target.value } : current
                  )
                }
                value={args.planForm.key}
              />
            </Field>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setPlanForm((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
                value={args.planForm.name}
              />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                onChange={(event) =>
                  args.setPlanForm((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current
                  )
                }
                value={args.planForm.description}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>Plan type</FieldLabel>
                <NativeSelect
                  onChange={(event) =>
                    args.setPlanForm((current) =>
                      current
                        ? {
                            ...current,
                            planType: event.target.value as "free" | "paid",
                          }
                        : current
                    )
                  }
                  value={args.planForm.planType}
                >
                  <NativeSelectOption value="paid">Paid</NativeSelectOption>
                  <NativeSelectOption value="free">Free</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Currency</FieldLabel>
                <Input
                  onChange={(event) =>
                    args.setPlanForm((current) =>
                      current
                        ? { ...current, currency: event.target.value.toLowerCase() }
                        : current
                    )
                  }
                  value={args.planForm.currency}
                />
              </Field>
              <Field>
                <FieldLabel>Sort order</FieldLabel>
                <Input
                  onChange={(event) =>
                    args.setPlanForm((current) =>
                      current ? { ...current, sortOrder: event.target.value } : current
                    )
                  }
                  type="number"
                  value={args.planForm.sortOrder}
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel>Monthly amount (minor units)</FieldLabel>
                <Input
                  disabled={args.planForm.planType === "free" || pricesLocked}
                  onChange={(event) =>
                    args.setPlanForm((current) =>
                      current
                        ? { ...current, monthlyPriceAmount: event.target.value }
                        : current
                    )
                  }
                  type="number"
                  value={args.planForm.monthlyPriceAmount}
                />
              </Field>
              <Field>
                <FieldLabel>Yearly amount (minor units)</FieldLabel>
                <Input
                  disabled={args.planForm.planType === "free" || pricesLocked}
                  onChange={(event) =>
                    args.setPlanForm((current) =>
                      current
                        ? { ...current, yearlyPriceAmount: event.target.value }
                        : current
                    )
                  }
                  type="number"
                  value={args.planForm.yearlyPriceAmount}
                />
                {pricesLocked ? (
                  <FieldDescription>
                    Replace existing paid prices from the plan row actions so the new monthly price becomes the Stripe default before the old one is archived.
                  </FieldDescription>
                ) : null}
              </Field>
            </div>
            <Field>
              <FieldLabel>Included features</FieldLabel>
              <div ref={featurePickerContainerRef}>
                <MultiSelectCombobox
                  emptyLabel="No active features match this search."
                  onChange={(values) =>
                    args.setPlanForm((current) =>
                      current ? { ...current, featureKeys: values } : current
                    )
                  }
                  options={args.featureOptions}
                  placeholder="Search features"
                  portalContainer={featurePickerContainerRef}
                  value={args.planForm.featureKeys}
                />
              </div>
              <FieldDescription>
                Removing a feature here detaches it from the plan. Existing plan edits show impact before saving.
              </FieldDescription>
            </Field>
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.billingMutationPending} onClick={args.onSave}>
            Save plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FeatureFormDialog(args: {
  billingMutationPending: boolean
  featureForm: FeatureFormState | null
  onClose: () => void
  onSave: () => void
  setFeatureForm: Dispatch<SetStateAction<FeatureFormState | null>>
}) {
  return (
    <Dialog open={Boolean(args.featureForm)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {args.featureForm?.mode === "edit" ? "Edit feature" : "Create feature"}
          </DialogTitle>
          <DialogDescription>
            Features can drive entitlements, marketing copy, or both.
          </DialogDescription>
        </DialogHeader>

        {args.featureForm ? (
          <FieldGroup>
            <Field>
              <FieldLabel>Feature key</FieldLabel>
              <Input
                disabled={args.featureForm.mode === "edit"}
                onChange={(event) =>
                  args.setFeatureForm((current) =>
                    current ? { ...current, key: event.target.value } : current
                  )
                }
                value={args.featureForm.key}
              />
            </Field>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setFeatureForm((current) =>
                    current ? { ...current, name: event.target.value } : current
                  )
                }
                value={args.featureForm.name}
              />
            </Field>
            <Field>
              <FieldLabel>Description</FieldLabel>
              <Textarea
                onChange={(event) =>
                  args.setFeatureForm((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current
                  )
                }
                value={args.featureForm.description}
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel>Applies to</FieldLabel>
                <NativeSelect
                  onChange={(event) =>
                    args.setFeatureForm((current) =>
                      current
                        ? {
                            ...current,
                            appliesTo: event.target.value as FeatureFormState["appliesTo"],
                          }
                        : current
                    )
                  }
                  value={args.featureForm.appliesTo}
                >
                  <NativeSelectOption value="both">Both</NativeSelectOption>
                  <NativeSelectOption value="entitlement">Entitlement</NativeSelectOption>
                  <NativeSelectOption value="marketing">Marketing</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel>Category</FieldLabel>
                <Input
                  onChange={(event) =>
                    args.setFeatureForm((current) =>
                      current ? { ...current, category: event.target.value } : current
                    )
                  }
                  value={args.featureForm.category}
                />
              </Field>
              <Field>
                <FieldLabel>Sort order</FieldLabel>
                <Input
                  onChange={(event) =>
                    args.setFeatureForm((current) =>
                      current ? { ...current, sortOrder: event.target.value } : current
                    )
                  }
                  type="number"
                  value={args.featureForm.sortOrder}
                />
              </Field>
            </div>
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.billingMutationPending} onClick={args.onSave}>
            Save feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ArchivePlanDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onConfirm: () => void
  setState: Dispatch<SetStateAction<ArchivePlanState | null>>
  state: ArchivePlanState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive plan</DialogTitle>
          <DialogDescription>
            Type the plan key before this product and its prices are archived in Stripe.
          </DialogDescription>
        </DialogHeader>

        {args.state ? (
          <FieldGroup>
            <ImpactSummary preview={args.state.preview} />
            <Field>
              <FieldLabel>Cancellation handling</FieldLabel>
              <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
                <input
                  checked={args.state.cancelAtPeriodEnd}
                  className="size-4"
                  onChange={(event) =>
                    args.setState((current) =>
                      current
                        ? { ...current, cancelAtPeriodEnd: event.target.checked }
                        : current
                    )
                  }
                  type="checkbox"
                />
                Mark impacted subscriptions to cancel at period end
              </label>
              <FieldDescription>
                Leave this unchecked to keep existing subscribers on their current Stripe subscriptions.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Type {args.state.preview?.confirmationToken}</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setState((current) =>
                    current ? { ...current, confirmation: event.target.value } : current
                  )
                }
                value={args.state.confirmation}
              />
            </Field>
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={
              args.billingMutationPending ||
              args.state?.confirmation !== args.state?.preview?.confirmationToken
            }
            onClick={args.onConfirm}
          >
            Archive plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReplacePriceDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onConfirm: () => void
  setState: Dispatch<SetStateAction<ReplacePriceState | null>>
  state: ReplacePriceState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace plan price</DialogTitle>
          <DialogDescription>
            This creates a new Stripe price, promotes the new monthly price to the product default when applicable, and archives the superseded price.
          </DialogDescription>
        </DialogHeader>

        {args.state ? (
          <FieldGroup>
            <ImpactSummary preview={args.state.preview} />
            <Field>
              <FieldLabel>New amount (minor units)</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setState((current) =>
                    current ? { ...current, amount: event.target.value } : current
                  )
                }
                type="number"
                value={args.state.amount}
              />
            </Field>
            <Field>
              <FieldLabel>Type {args.state.preview?.confirmationToken}</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setState((current) =>
                    current
                      ? { ...current, confirmation: event.target.value }
                      : current
                  )
                }
                value={args.state.confirmation}
              />
            </Field>
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={
              args.billingMutationPending ||
              args.state?.confirmation !== args.state?.preview?.confirmationToken
            }
            onClick={args.onConfirm}
          >
            Replace price
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ArchiveFeatureDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onConfirm: () => void
  setState: Dispatch<SetStateAction<ArchiveFeatureState | null>>
  state: ArchiveFeatureState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive feature</DialogTitle>
          <DialogDescription>
            This removes the feature from plan assignments and from future Stripe sync output.
          </DialogDescription>
        </DialogHeader>
        {args.state ? (
          <FieldGroup>
            <ImpactSummary preview={args.state.preview} />
            <Field>
              <FieldLabel>Type {args.state.preview?.confirmationToken}</FieldLabel>
              <Input
                onChange={(event) =>
                  args.setState((current) =>
                    current
                      ? { ...current, confirmation: event.target.value }
                      : current
                  )
                }
                value={args.state.confirmation}
              />
            </Field>
          </FieldGroup>
        ) : null}
        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={
              args.billingMutationPending ||
              args.state?.confirmation !== args.state?.preview?.confirmationToken
            }
            onClick={args.onConfirm}
          >
            Archive feature
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PlanFeatureSyncDialog(args: {
  billingMutationPending: boolean
  featureLabelByKey: Map<string, string>
  onClose: () => void
  onConfirm: () => void
  state: PlanFeatureSyncState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review feature changes</DialogTitle>
          <DialogDescription>
            Confirm the subscription impact before saving this plan&apos;s included features.
          </DialogDescription>
        </DialogHeader>

        {args.state ? (
          <FieldGroup>
            <ImpactSummary preview={args.state.preview} />
            <ChangeSummary
              addedLabel="Features being attached"
              addedValues={args.state.addedFeatureKeys}
              labelByKey={args.featureLabelByKey}
              removedLabel="Features being removed"
              removedValues={args.state.removedFeatureKeys}
            />
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.billingMutationPending} onClick={args.onConfirm}>
            Save feature changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FeatureAssignmentSyncDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onConfirm: () => void
  planLabelByKey: Map<string, string>
  state: FeatureAssignmentSyncState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Review assignment changes</DialogTitle>
          <DialogDescription>
            Confirm the entitlement and marketing impact before updating this feature&apos;s plan coverage.
          </DialogDescription>
        </DialogHeader>

        {args.state ? (
          <FieldGroup>
            <ImpactSummary preview={args.state.preview} />
            <ChangeSummary
              addedLabel="Plans being attached"
              addedValues={args.state.addedPlanKeys}
              labelByKey={args.planLabelByKey}
              removedLabel="Plans being detached"
              removedValues={args.state.removedPlanKeys}
            />
          </FieldGroup>
        ) : null}

        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.billingMutationPending} onClick={args.onConfirm}>
            Save assignments
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
