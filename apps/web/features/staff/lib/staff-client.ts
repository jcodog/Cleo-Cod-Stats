"use client"

import type { ConvexReactClient } from "convex/react"
import { useConvex, useConvexAuth } from "convex/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@workspace/backend/convex/_generated/api"
import type { Id } from "@workspace/backend/convex/_generated/dataModel"
import type {
  StaffBillingDashboard,
  StaffImpactPreview,
  StaffManagementDashboard,
  StaffMutationResponse,
  StaffWebhookEventDetail,
  StaffWebhookLedgerDashboard,
} from "@workspace/backend/convex/lib/staffTypes"

import type {
  BillingActionRequest,
  ManagementActionRequest,
} from "@/features/staff/lib/staff-schemas"
import {
  billingActionSchema,
  managementActionSchema,
} from "@/features/staff/lib/staff-schemas"

export class StaffClientError extends Error {
  data: unknown
  status: number

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.data = data
    this.status = status
  }
}

function toStaffClientError(error: unknown) {
  if (error instanceof StaffClientError) {
    return error
  }

  const message =
    error instanceof Error ? error.message : "Staff request failed."
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500

  return new StaffClientError(message, status, error)
}

export const staffQueryKeys = {
  billing: ["staff", "billing"] as const,
  management: ["staff", "management"] as const,
  webhookDetail: (eventId: string) =>
    ["staff", "webhooks", "detail", eventId] as const,
  webhooks: ["staff", "webhooks"] as const,
}

async function callManagementDashboard(
  convex: ConvexReactClient
): Promise<StaffManagementDashboard> {
  try {
    return await convex.action(api.actions.staff.management.getDashboard, {})
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callBillingDashboard(
  convex: ConvexReactClient
): Promise<StaffBillingDashboard> {
  try {
    return await convex.action(api.actions.staff.billing.getDashboard, {})
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callWebhookDashboard(
  convex: ConvexReactClient
): Promise<StaffWebhookLedgerDashboard> {
  try {
    return await convex.action(api.actions.staff.billing.getWebhookDashboard, {})
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callWebhookEventDetail(
  convex: ConvexReactClient,
  eventId: Id<"billingWebhookEvents">
): Promise<StaffWebhookEventDetail> {
  try {
    return await convex.action(api.actions.staff.billing.getWebhookEventDetail, {
      eventId,
    })
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callRefreshWebhookLedger(
  convex: ConvexReactClient
): Promise<StaffMutationResponse> {
  try {
    return await convex.action(api.actions.staff.billing.refreshWebhookLedger, {})
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callManagementAction<T>(
  convex: ConvexReactClient,
  request: ManagementActionRequest
) {
  const action = managementActionSchema.parse(request)

  try {
    switch (action.action) {
      case "updateUserRole":
        return (await convex.action(
          api.actions.staff.management.updateUserRole,
          action.input
        )) as T
    }
  } catch (error) {
    throw toStaffClientError(error)
  }
}

async function callBillingAction<T>(
  convex: ConvexReactClient,
  request: BillingActionRequest
) {
  const action = billingActionSchema.parse(request)

  try {
    switch (action.action) {
      case "archiveFeature":
        return (await convex.action(
          api.actions.staff.billing.archiveFeature,
          action.input
        )) as T
      case "archivePlan":
        return (await convex.action(
          api.actions.staff.billing.archivePlan,
          action.input
        )) as T
      case "grantCreatorAccess":
        return (await convex.action(
          api.actions.staff.billing.grantCreatorAccess,
          {
            ...action.input,
            targetUserId: action.input.targetUserId as Id<"users">,
          }
        )) as T
      case "previewFeatureArchive":
        return (await convex.action(
          api.actions.staff.billing.previewFeatureArchive,
          action.input
        )) as T
      case "previewFeatureAssignmentChange":
        return (await convex.action(
          api.actions.staff.billing.previewFeatureAssignmentChange,
          action.input
        )) as T
      case "previewFeatureAssignmentSync":
        return (await convex.action(
          api.actions.staff.billing.previewFeatureAssignmentSync,
          action.input
        )) as T
      case "previewPlanArchive":
        return (await convex.action(
          api.actions.staff.billing.previewPlanArchive,
          action.input
        )) as T
      case "previewPlanFeatureSync":
        return (await convex.action(
          api.actions.staff.billing.previewPlanFeatureSync,
          action.input
        )) as T
      case "previewPriceReplacement":
        return (await convex.action(
          api.actions.staff.billing.previewPriceReplacement,
          action.input
        )) as T
      case "replacePlanPrice":
        return (await convex.action(
          api.actions.staff.billing.replacePlanPrice,
          action.input
        )) as T
      case "revokeCreatorAccess":
        return (await convex.action(
          api.actions.staff.billing.revokeCreatorAccess,
          {
            ...action.input,
            targetUserId: action.input.targetUserId as Id<"users">,
          }
        )) as T
      case "runCatalogSync":
        return (await convex.action(
          api.actions.staff.billing.runCatalogSync,
          {}
        )) as T
      case "syncFeatureAssignments":
        return (await convex.action(
          api.actions.staff.billing.syncFeatureAssignments,
          action.input
        )) as T
      case "setFeatureAssignment":
        return (await convex.action(
          api.actions.staff.billing.setFeatureAssignment,
          action.input
        )) as T
      case "upsertFeature":
        return (await convex.action(
          api.actions.staff.billing.upsertFeature,
          action.input
        )) as T
      case "upsertPlan":
        return (await convex.action(
          api.actions.staff.billing.upsertPlan,
          action.input
        )) as T
    }
  } catch (error) {
    throw toStaffClientError(error)
  }
}

export function useStaffManagementDashboard(initialData: StaffManagementDashboard) {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    initialData,
    queryFn: () => callManagementDashboard(convex),
    queryKey: staffQueryKeys.management,
  })
}

export function useStaffBillingDashboard(initialData: StaffBillingDashboard) {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    initialData,
    queryFn: () => callBillingDashboard(convex),
    queryKey: staffQueryKeys.billing,
  })
}

export function useStaffWebhookLedgerDashboard(
  initialData: StaffWebhookLedgerDashboard
) {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    initialData,
    queryFn: () => callWebhookDashboard(convex),
    queryKey: staffQueryKeys.webhooks,
  })
}

export function useStaffWebhookEventDetail(
  eventId: Id<"billingWebhookEvents"> | null
) {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated && eventId !== null,
    queryFn: () => {
      if (!eventId) {
        throw new Error("Webhook event id is required.")
      }

      return callWebhookEventDetail(convex, eventId)
    },
    queryKey: staffQueryKeys.webhookDetail(eventId ?? "idle"),
  })
}

export function useStaffManagementClient() {
  const convex = useConvex()

  return {
    runAction: <T = StaffMutationResponse>(request: ManagementActionRequest) =>
      callManagementAction<T>(convex, request),
  }
}

export function useStaffBillingClient() {
  const convex = useConvex()

  return {
    runAction: <T = StaffMutationResponse>(request: BillingActionRequest) =>
      callBillingAction<T>(convex, request),
  }
}

export function useStaffWebhookClient() {
  const convex = useConvex()

  return {
    refreshLedger: () => callRefreshWebhookLedger(convex),
  }
}

export function useInvalidateStaffQueries() {
  const queryClient = useQueryClient()

  return {
    invalidateBilling: () =>
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.billing }),
    invalidateManagement: () =>
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.management }),
    invalidateWebhooks: () =>
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.webhooks }),
  }
}

export function useStaffMutation<TVariables, TResult>(args: {
  invalidate: Array<"billing" | "management" | "webhooks">
  mutationFn: (variables: TVariables) => Promise<TResult>
}) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: args.mutationFn,
    onSuccess: async () => {
      await Promise.all(
        args.invalidate.map((scope) =>
          queryClient.invalidateQueries({
            queryKey:
              scope === "billing"
                ? staffQueryKeys.billing
                : scope === "management"
                  ? staffQueryKeys.management
                  : staffQueryKeys.webhooks,
          })
        )
      )
    },
  })
}

export type StaffPreviewResponse = StaffImpactPreview
