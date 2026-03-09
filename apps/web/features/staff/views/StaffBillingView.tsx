"use client"

import { useState } from "react"
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

import {
  StaffClientError,
  runBillingAction,
  useStaffBillingDashboard,
  useStaffMutation,
} from "@/features/staff/lib/staff-client"
import { StaffDataTable } from "@/features/staff/components/StaffDataTable"
import type { BillingActionRequest } from "@/features/staff/lib/staff-schemas"

type PlanFormState = {
  active: boolean
  currency: string
  description: string
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

type AssignmentState = {
  enabled: boolean
  feature: StaffBillingFeatureRecord
  plan: StaffBillingPlanRecord
  preview: StaffImpactPreview | null
}

function formatCurrencyAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", {
    currency: currency.toUpperCase(),
    style: "currency",
  }).format(amount / 100)
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

export function StaffBillingView({
  initialData,
}: {
  initialData: StaffBillingDashboard
}) {
  const { data } = useStaffBillingDashboard(initialData)
  const [planForm, setPlanForm] = useState<PlanFormState | null>(null)
  const [featureForm, setFeatureForm] = useState<FeatureFormState | null>(null)
  const [archivePlanState, setArchivePlanState] = useState<ArchivePlanState | null>(null)
  const [replacePriceState, setReplacePriceState] = useState<ReplacePriceState | null>(null)
  const [archiveFeatureState, setArchiveFeatureState] = useState<ArchiveFeatureState | null>(null)
  const [assignmentState, setAssignmentState] = useState<AssignmentState | null>(null)
  const billingMutation = useStaffMutation<
    BillingActionRequest,
    StaffMutationResponse
  >({
    invalidate: ["billing"],
    mutationFn: (request) => runBillingAction<StaffMutationResponse>(request),
  })
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
          <span>{formatCurrencyAmount(row.original.monthlyPriceAmount, row.original.currency)} / month</span>
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
      cell: ({ getValue }) => {
        const featureKeys = getValue<string[]>()

        return (
          <span className="text-sm text-muted-foreground">
            {featureKeys.length > 0 ? featureKeys.join(", ") : "No features"}
          </span>
        )
      },
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
              <DropdownMenuItem onClick={() => setPlanForm(makePlanFormState("edit", row.original))}>
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
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {getValue<string[]>().length > 0 ? getValue<string[]>().join(", ") : "No plans"}
        </span>
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
              <DropdownMenuItem onClick={() => setFeatureForm(makeFeatureFormState("edit", row.original))}>
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
      const preview = await runBillingAction<StaffImpactPreview>({
        action: "previewPlanArchive",
        input: { planKey: plan.key },
      })
      setArchivePlanState((current) =>
        current ? { ...current, preview } : current
      )
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Preview failed."
      )
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
      const preview = await runBillingAction<StaffImpactPreview>({
        action: "previewPriceReplacement",
        input: { interval, planKey: plan.key },
      })
      setReplacePriceState((current) =>
        current ? { ...current, preview } : current
      )
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Preview failed."
      )
    }
  }

  async function openArchiveFeatureDialog(feature: StaffBillingFeatureRecord) {
    setArchiveFeatureState({
      confirmation: "",
      feature,
      preview: null,
    })

    try {
      const preview = await runBillingAction<StaffImpactPreview>({
        action: "previewFeatureArchive",
        input: { featureKey: feature.key },
      })
      setArchiveFeatureState((current) =>
        current ? { ...current, preview } : current
      )
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Preview failed."
      )
    }
  }

  async function openAssignmentDialog(
    plan: StaffBillingPlanRecord,
    feature: StaffBillingFeatureRecord,
    enabled: boolean
  ) {
    setAssignmentState({
      enabled,
      feature,
      plan,
      preview: null,
    })

    try {
      const preview = await runBillingAction<StaffImpactPreview>({
        action: "previewFeatureAssignmentChange",
        input: { enabled, featureKey: feature.key, planKey: plan.key },
      })
      setAssignmentState((current) =>
        current ? { ...current, preview } : current
      )
    } catch (error) {
      toast.error(
        error instanceof StaffClientError ? error.message : "Preview failed."
      )
    }
  }

  async function submitPlanForm() {
    if (!planForm) {
      return
    }

    try {
      const result = await billingMutation.mutateAsync({
        action: "upsertPlan",
        input: {
          active: planForm.active,
          currency: planForm.currency,
          description: planForm.description,
          key: planForm.key,
          monthlyPriceAmount: Number(planForm.monthlyPriceAmount),
          name: planForm.name,
          planType: planForm.planType,
          sortOrder: Number(planForm.sortOrder),
          yearlyPriceAmount: Number(planForm.yearlyPriceAmount),
        },
      })
      await handleMutationResult(result)
      setPlanForm(null)
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
      toast.error(
        error instanceof StaffClientError ? error.message : "Sync failed."
      )
    }
  }

  const assignmentLookup = new Map(
    data.assignments.map((assignment) => [
      `${assignment.planKey}:${assignment.featureKey}`,
      assignment.enabled,
    ])
  )

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
                      {data.plans.map((plan) => {
                        const enabled =
                          assignmentLookup.get(`${plan.key}:${feature.key}`) ?? false

                        return (
                          <TableCell key={`${plan.key}:${feature.key}`}>
                            <Button
                              onClick={() =>
                                void openAssignmentDialog(plan, feature, !enabled)
                              }
                              size="sm"
                              variant={enabled ? "secondary" : "outline"}
                            >
                              {enabled ? "Included" : "Attach"}
                            </Button>
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
      <AssignmentDialog
        billingMutationPending={billingMutation.isPending}
        onClose={() => setAssignmentState(null)}
        onConfirm={async () => {
          if (!assignmentState) {
            return
          }

          try {
            const result = await billingMutation.mutateAsync({
              action: "setFeatureAssignment",
              input: {
                enabled: assignmentState.enabled,
                featureKey: assignmentState.feature.key,
                planKey: assignmentState.plan.key,
              },
            })
            await handleMutationResult(result)
            setAssignmentState(null)
          } catch (error) {
            toast.error(
              error instanceof StaffClientError ? error.message : "Assignment update failed."
            )
          }
        }}
        state={assignmentState}
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
    </div>
  )
}

function PlanFormDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onSave: () => void
  planForm: PlanFormState | null
  setPlanForm: React.Dispatch<React.SetStateAction<PlanFormState | null>>
}) {
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
                  disabled={args.planForm.planType === "free"}
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
                  disabled={args.planForm.planType === "free"}
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
              </Field>
            </div>
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
  setFeatureForm: React.Dispatch<React.SetStateAction<FeatureFormState | null>>
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
  setState: React.Dispatch<React.SetStateAction<ArchivePlanState | null>>
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
  setState: React.Dispatch<React.SetStateAction<ReplacePriceState | null>>
  state: ReplacePriceState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace plan price</DialogTitle>
          <DialogDescription>
            This creates a new Stripe price and archives the superseded one.
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
  setState: React.Dispatch<React.SetStateAction<ArchiveFeatureState | null>>
  state: ArchiveFeatureState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive feature</DialogTitle>
          <DialogDescription>
            This removes the feature from future Stripe sync output.
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

function AssignmentDialog(args: {
  billingMutationPending: boolean
  onClose: () => void
  onConfirm: () => void
  state: AssignmentState | null
}) {
  return (
    <Dialog open={Boolean(args.state)} onOpenChange={(open) => !open && args.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {args.state?.enabled ? "Attach feature" : "Detach feature"}
          </DialogTitle>
          <DialogDescription>
            Confirm the entitlement and marketing impact before saving.
          </DialogDescription>
        </DialogHeader>
        <ImpactSummary preview={args.state?.preview ?? null} />
        <DialogFooter>
          <Button onClick={args.onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={args.billingMutationPending} onClick={args.onConfirm}>
            {args.state?.enabled ? "Attach feature" : "Detach feature"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
