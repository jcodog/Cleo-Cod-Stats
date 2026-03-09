"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type {
  StaffBillingDashboard,
  StaffImpactPreview,
  StaffManagementDashboard,
  StaffMutationResponse,
} from "@workspace/backend/convex/lib/staffTypes"

import type {
  BillingActionRequest,
  ManagementActionRequest,
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

async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  })
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new StaffClientError(
      (data as { supportMessage?: string; message?: string } | null)
        ?.supportMessage ??
        (data as { message?: string } | null)?.message ??
        "Staff request failed.",
      response.status,
      data
    )
  }

  return data as T
}

export const staffQueryKeys = {
  billing: ["staff", "billing"] as const,
  management: ["staff", "management"] as const,
}

export async function fetchStaffManagementDashboard() {
  return readJson<StaffManagementDashboard>("/api/staff/management")
}

export async function fetchStaffBillingDashboard() {
  return readJson<StaffBillingDashboard>("/api/staff/billing")
}

export async function runManagementAction<T = StaffMutationResponse>(
  request: ManagementActionRequest
) {
  return readJson<T>("/api/staff/management/actions", {
    body: JSON.stringify(request),
    method: "POST",
  })
}

export async function runBillingAction<T = StaffMutationResponse>(
  request: BillingActionRequest
) {
  return readJson<T>("/api/staff/billing/actions", {
    body: JSON.stringify(request),
    method: "POST",
  })
}

export function useStaffManagementDashboard(initialData: StaffManagementDashboard) {
  return useQuery({
    initialData,
    queryFn: fetchStaffManagementDashboard,
    queryKey: staffQueryKeys.management,
  })
}

export function useStaffBillingDashboard(initialData: StaffBillingDashboard) {
  return useQuery({
    initialData,
    queryFn: fetchStaffBillingDashboard,
    queryKey: staffQueryKeys.billing,
  })
}

export function useInvalidateStaffQueries() {
  const queryClient = useQueryClient()

  return {
    invalidateBilling: () =>
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.billing }),
    invalidateManagement: () =>
      queryClient.invalidateQueries({ queryKey: staffQueryKeys.management }),
  }
}

export function useStaffMutation<TVariables, TResult>(args: {
  invalidate: Array<"billing" | "management">
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
                : staffQueryKeys.management,
          })
        )
      )
    },
  })
}

export type StaffPreviewResponse = StaffImpactPreview

