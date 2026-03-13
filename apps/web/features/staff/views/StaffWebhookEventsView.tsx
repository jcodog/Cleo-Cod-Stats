"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { ColumnDef } from "@tanstack/react-table"
import { IconCopy, IconReload } from "@tabler/icons-react"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import type {
  StaffWebhookEventDetail,
  StaffWebhookLedgerDashboard,
  StaffWebhookLedgerRecord,
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
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { toast } from "sonner"

import { StaffDataTable } from "@/features/staff/components/StaffDataTable"
import {
  StaffMultiFilterCombobox,
  type StaffFilterGroup,
  type StaffFilterSelection,
} from "@/features/staff/components/StaffMultiFilterCombobox"
import {
  StaffClientError,
  staffQueryKeys,
  useStaffWebhookEventDetail,
  useStaffWebhookClient,
  useStaffWebhookLedgerDashboard,
  useStaffMutation,
} from "@/features/staff/lib/staff-client"

function formatDateTime(value: number) {
  if (!Number.isFinite(value)) {
    return "Not set"
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value)
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

function WebhookStatusBadge({
  status,
}: {
  status: StaffWebhookLedgerRecord["processingStatus"]
}) {
  if (status === "processed") {
    return <Badge variant="secondary">processed</Badge>
  }

  if (status === "failed") {
    return <Badge variant="destructive">failed</Badge>
  }

  return <Badge variant="outline">{status}</Badge>
}

function PayloadStateBadge({
  state,
}: {
  state: StaffWebhookLedgerRecord["payloadState"]
}) {
  if (state === "available") {
    return <Badge variant="secondary">stored</Badge>
  }

  if (state === "unavailable") {
    return <Badge variant="destructive">unavailable</Badge>
  }

  return <Badge variant="outline">pending backfill</Badge>
}

function formatProcessingStatusLabel(
  status: StaffWebhookLedgerRecord["processingStatus"]
) {
  switch (status) {
    case "failed":
      return "Failed"
    case "ignored":
      return "Ignored"
    case "processed":
      return "Processed"
    case "processing":
      return "Processing"
    case "received":
      return "Received"
  }
}

function formatPayloadStateLabel(
  state: StaffWebhookLedgerRecord["payloadState"]
) {
  switch (state) {
    case "available":
      return "Stored"
    case "missing":
      return "Pending backfill"
    case "unavailable":
      return "Unavailable"
  }
}

function prettifyPayloadJson(payloadJson: string | undefined) {
  if (!payloadJson) {
    return null
  }

  try {
    return JSON.stringify(JSON.parse(payloadJson), null, 2)
  } catch {
    return payloadJson
  }
}

function WebhookReferenceList({ event }: { event: StaffWebhookLedgerRecord }) {
  const rows = [
    ["Customer", event.customerId],
    ["Subscription", event.subscriptionId],
    ["Invoice", event.invoiceId],
    ["Payment intent", event.paymentIntentId],
  ].filter(([, value]) => value)

  if (rows.length === 0) {
    return <span className="text-sm text-muted-foreground">No linked ids</span>
  }

  return (
    <div className="grid gap-1 text-sm">
      {rows.map(([label, value]) => (
        <div className="flex flex-col gap-1" key={label}>
          <span className="text-xs text-muted-foreground">{label}</span>
          <code className="rounded bg-muted/30 px-2 py-1 font-mono text-[11px] break-all">
            {value}
          </code>
        </div>
      ))}
    </div>
  )
}

function WebhookMetadataCard({ detail }: { detail: StaffWebhookEventDetail }) {
  const rows = [
    ["Received", formatDateTime(detail.receivedAt)],
    [
      "Processed",
      detail.processedAt ? formatDateTime(detail.processedAt) : "Not processed",
    ],
    ["Stripe event", detail.stripeEventId],
    ["Customer", detail.customerId ?? "Not linked"],
    ["Subscription", detail.subscriptionId ?? "Not linked"],
    ["Invoice", detail.invoiceId ?? "Not linked"],
    ["Payment intent", detail.paymentIntentId ?? "Not linked"],
  ]

  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div className="flex flex-col gap-1" key={label}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="font-mono text-sm break-all">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StaffWebhookEventsView({
  initialData,
}: {
  initialData: StaffWebhookLedgerDashboard
}) {
  const { data, refetch } = useStaffWebhookLedgerDashboard(initialData)
  const queryClient = useQueryClient()
  const webhookClient = useStaffWebhookClient()
  const [selectedEventId, setSelectedEventId] =
    useState<Id<"billingWebhookEvents"> | null>(null)
  const [filters, setFilters] = useState<StaffFilterSelection>({
    eventType: [],
    payload: [],
    status: [],
  })
  const detailQuery = useStaffWebhookEventDetail(selectedEventId)
  const selectedEvent =
    data.events.find((event) => event.id === selectedEventId) ?? null
  const payloadGapCount =
    data.metrics.missingPayloadCount + data.metrics.unavailablePayloadCount
  const pendingDeliveryCount =
    data.metrics.processingCount + data.metrics.receivedCount
  const refreshLedgerMutation = useStaffMutation<void, StaffMutationResponse>({
    invalidate: ["webhooks"],
    mutationFn: () => webhookClient.refreshLedger(),
  })
  const eventTypeCounts = new Map<string, number>()
  const processingStatusCounts = new Map<
    StaffWebhookLedgerRecord["processingStatus"],
    number
  >()
  const payloadStateCounts = new Map<
    StaffWebhookLedgerRecord["payloadState"],
    number
  >()

  for (const event of data.events) {
    eventTypeCounts.set(
      event.eventType,
      (eventTypeCounts.get(event.eventType) ?? 0) + 1
    )
    processingStatusCounts.set(
      event.processingStatus,
      (processingStatusCounts.get(event.processingStatus) ?? 0) + 1
    )
    payloadStateCounts.set(
      event.payloadState,
      (payloadStateCounts.get(event.payloadState) ?? 0) + 1
    )
  }

  const eventTypeOptions = Array.from(eventTypeCounts.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([eventType, count]) => ({
      description: `${count} logged event${count === 1 ? "" : "s"}`,
      label: eventType,
      value: eventType,
    }))
  const processingStatusOrder: StaffWebhookLedgerRecord["processingStatus"][] =
    ["failed", "processing", "received", "processed", "ignored"]
  const processingStatusOptions = processingStatusOrder
    .filter((status) => processingStatusCounts.has(status))
    .map((status) => ({
      description: `${processingStatusCounts.get(status)} event${
        processingStatusCounts.get(status) === 1 ? "" : "s"
      }`,
      label: formatProcessingStatusLabel(status),
      value: status,
    }))
  const payloadStateOrder: StaffWebhookLedgerRecord["payloadState"][] = [
    "available",
    "missing",
    "unavailable",
  ]
  const payloadStateOptions = payloadStateOrder
    .filter((state) => payloadStateCounts.has(state))
    .map((state) => ({
      description: `${payloadStateCounts.get(state)} event${
        payloadStateCounts.get(state) === 1 ? "" : "s"
      }`,
      label: formatPayloadStateLabel(state),
      value: state,
    }))
  const filterGroups: StaffFilterGroup[] = [
    {
      id: "eventType",
      label: "Event type",
      options: eventTypeOptions,
    },
    {
      id: "status",
      label: "Status",
      options: processingStatusOptions,
    },
    {
      id: "payload",
      label: "Payload",
      options: payloadStateOptions,
    },
  ]
  const filteredEvents = data.events.filter((event) => {
    if (
      filters.eventType.length > 0 &&
      !filters.eventType.includes(event.eventType)
    ) {
      return false
    }

    if (
      filters.status.length > 0 &&
      !filters.status.includes(event.processingStatus)
    ) {
      return false
    }

    if (
      filters.payload.length > 0 &&
      !filters.payload.includes(event.payloadState)
    ) {
      return false
    }

    return true
  })

  useEffect(() => {
    if (!detailQuery.data) {
      return
    }

    void queryClient.invalidateQueries({ queryKey: staffQueryKeys.webhooks })
  }, [detailQuery.data?.id, detailQuery.data?.payloadState, queryClient])

  const columns: Array<ColumnDef<StaffWebhookLedgerRecord>> = [
    {
      accessorKey: "receivedAt",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {formatDateTime(row.original.receivedAt)}
          </span>
          <span className="text-xs text-muted-foreground">
            {row.original.processedAt
              ? `Processed ${formatDateTime(row.original.processedAt)}`
              : "Awaiting processing update"}
          </span>
        </div>
      ),
      header: "Received",
    },
    {
      accessorKey: "eventType",
      cell: ({ row }) => (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.original.eventType}</span>
            <WebhookStatusBadge status={row.original.processingStatus} />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {row.original.safeSummary}
          </p>
          {row.original.errorMessage ? (
            <p className="text-sm leading-6 text-destructive">
              {row.original.errorMessage}
            </p>
          ) : null}
        </div>
      ),
      header: "Event",
    },
    {
      accessorKey: "stripeEventId",
      cell: ({ row }) => (
        <code className="rounded bg-muted/30 px-2 py-1 font-mono text-[11px] break-all">
          {row.original.stripeEventId}
        </code>
      ),
      header: "Stripe event",
    },
    {
      accessorKey: "id",
      cell: ({ row }) => <WebhookReferenceList event={row.original} />,
      enableSorting: false,
      header: "Linked records",
    },
    {
      accessorKey: "payloadState",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-2">
          <PayloadStateBadge state={row.original.payloadState} />
          <Button
            onClick={() =>
              setSelectedEventId(row.original.id as Id<"billingWebhookEvents">)
            }
            size="sm"
            type="button"
            variant="outline"
          >
            View payload
          </Button>
        </div>
      ),
      header: "Payload",
    },
  ]

  async function handleCopyPayload() {
    const payload = prettifyPayloadJson(detailQuery.data?.payloadJson)

    if (!payload) {
      toast.error("No payload is available for this webhook event.")
      return
    }

    try {
      await navigator.clipboard.writeText(payload)
      toast.success("Webhook payload copied.")
    } catch {
      toast.error("Could not copy the webhook payload.")
    }
  }

  async function handleRefreshLedger() {
    try {
      const result = await refreshLedgerMutation.mutateAsync()
      toast.success(result.summary)
      await refetch()
    } catch (error) {
      toast.error(
        error instanceof StaffClientError
          ? error.message
          : "Webhook refresh failed."
      )
    }
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-8">
      <div className="space-y-2">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Subscription audit log
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Review Stripe webhook deliveries tied to subscription billing,
            payload retention, and the raw event bodies captured for
            reconciliation.
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Last refreshed {formatDateTime(data.generatedAt)}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Recorded deliveries"
          value={data.metrics.totalCount}
        />
        <MetricCard
          label="Failed deliveries"
          value={data.metrics.failedCount}
        />
        <MetricCard label="Pending processing" value={pendingDeliveryCount} />
        <MetricCard label="Payload gaps" value={payloadGapCount} />
      </div>

      {payloadGapCount > 0 ? (
        <Card className="border-border/70">
          <CardContent className="flex flex-col gap-2 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="font-medium">
                Historical payload coverage is incomplete.
              </div>
              <div className="text-muted-foreground">
                Missing payloads are backfilled when an event is opened. Some
                older Stripe events can no longer be retrieved once they fall
                outside Stripe&apos;s retention window.
              </div>
            </div>
            <Button
              disabled={refreshLedgerMutation.isPending}
              onClick={() => void handleRefreshLedger()}
              type="button"
              variant="outline"
            >
              <IconReload data-icon="inline-start" />
              {refreshLedgerMutation.isPending
                ? "Refreshing ledger..."
                : "Refresh ledger"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Ledger posture</CardTitle>
            <CardDescription>
              Operational status across recorded events and payload retention.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Last received</span>
                  <span className="font-medium">
                    {data.metrics.lastReceivedAt
                      ? formatDateTime(data.metrics.lastReceivedAt)
                      : "Not yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Last processed</span>
                  <span className="font-medium">
                    {data.metrics.lastProcessedAt
                      ? formatDateTime(data.metrics.lastProcessedAt)
                      : "Not yet"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Received rows</span>
                  <span className="font-medium">
                    {data.metrics.receivedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Processing rows</span>
                  <span className="font-medium">
                    {data.metrics.processingCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Ignored rows</span>
                  <span className="font-medium">
                    {data.metrics.ignoredCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Unavailable payloads
                  </span>
                  <span className="font-medium">
                    {data.metrics.unavailablePayloadCount}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Processing posture</CardTitle>
            <CardDescription>
              Current reconciliation state across processed, failed, and
              retriable payload rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
              <div className="grid gap-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Processed rows</span>
                  <span className="font-medium">
                    {data.metrics.processedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Failed rows</span>
                  <span className="font-medium">
                    {data.metrics.failedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Missing payloads
                  </span>
                  <span className="font-medium">
                    {data.metrics.missingPayloadCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Total events</span>
                  <span className="font-medium">{data.metrics.totalCount}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Stripe webhook ledger</CardTitle>
          <CardDescription>
            Every recorded Stripe webhook delivery. Open a row to inspect the
            raw event body retained by Convex.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StaffDataTable
            columns={columns}
            data={filteredEvents}
            emptyDescription={
              data.events.length > 0
                ? "Try adjusting the search or filters."
                : "Webhook deliveries will appear here after Stripe starts posting to the endpoint."
            }
            emptyTitle={
              data.events.length > 0
                ? "No webhook events match"
                : "No webhook events yet"
            }
            getRowId={(row) => row.id}
            searchPlaceholder="Search events, ids, summaries"
            toolbar={
              <div className="w-full xl:w-[42rem]">
                <StaffMultiFilterCombobox
                  emptyLabel="No filters match this search."
                  groups={filterGroups}
                  onChange={setFilters}
                  placeholder="Filter select"
                  value={filters}
                />
              </div>
            }
          />
        </CardContent>
      </Card>

      <Dialog
        open={selectedEventId !== null}
        onOpenChange={(open) => !open && setSelectedEventId(null)}
      >
        <DialogContent className="flex h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden sm:w-[min(90vw,84rem)] sm:max-w-[min(90vw,84rem)]">
          <DialogHeader>
            <DialogTitle>
              {selectedEvent?.eventType ??
                detailQuery.data?.eventType ??
                "Webhook payload"}
            </DialogTitle>
            <DialogDescription>
              Inspect the stored Stripe event metadata and raw payload for this
              delivery.
            </DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading && selectedEventId ? (
            <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-10 text-sm text-muted-foreground">
              Loading webhook payload...
            </div>
          ) : null}

          {detailQuery.error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-4 text-sm text-destructive">
              {detailQuery.error instanceof StaffClientError
                ? detailQuery.error.message
                : "Could not load that webhook payload."}
            </div>
          ) : null}

          {detailQuery.data ? (
            <div className="grid min-h-0 gap-4 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2">
                <WebhookStatusBadge
                  status={detailQuery.data.processingStatus}
                />
                <PayloadStateBadge state={detailQuery.data.payloadState} />
                {detailQuery.data.payloadState !== "available" ? (
                  <Button
                    onClick={() => void detailQuery.refetch()}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <IconReload data-icon="inline-start" />
                    Retry payload fetch
                  </Button>
                ) : null}
                <Button
                  disabled={!detailQuery.data.payloadJson}
                  onClick={() => void handleCopyPayload()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconCopy data-icon="inline-start" />
                  Copy JSON
                </Button>
              </div>

              <WebhookMetadataCard detail={detailQuery.data} />

              <div className="rounded-lg border border-border/70 bg-muted/20 px-4 py-4">
                <div className="text-sm font-medium">Ledger summary</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {detailQuery.data.safeSummary}
                </p>
                {detailQuery.data.errorMessage ? (
                  <p className="mt-3 text-sm leading-6 text-destructive">
                    {detailQuery.data.errorMessage}
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-col rounded-lg border border-border/70 bg-muted/20">
                <div className="border-b border-border/70 px-4 py-3">
                  <div className="text-sm font-medium">Raw Stripe payload</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {detailQuery.data.payloadState === "available"
                      ? "Full event JSON captured from Stripe."
                      : detailQuery.data.payloadState === "unavailable"
                        ? (detailQuery.data.payloadUnavailableReason ??
                          "Stripe no longer exposes this historical event payload.")
                        : "The payload could not be retrieved yet. Retry if this event should still be available in Stripe."}
                  </div>
                </div>
                <ScrollArea className="h-[min(60vh,40rem)]">
                  <pre className="px-4 py-4 font-mono text-xs leading-5 break-all whitespace-pre-wrap text-foreground">
                    {prettifyPayloadJson(detailQuery.data.payloadJson) ??
                      "No payload is currently stored for this event."}
                  </pre>
                </ScrollArea>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
