"use client"

import { useConvex, useConvexAuth } from "convex/react"
import type { ConvexReactClient } from "convex/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { api } from "@workspace/backend/convex/_generated/api"

import type {
  BillingCenterData,
  BillingCenterSyncResult,
  BillingChangePreview,
  BillingChangeResult,
  BillingProfileUpdateResult,
  BillingResolvedState,
  CancellationResult,
  CheckoutIntentResult,
  PaymentMethodMutationResult,
  PaymentMethodSetupIntentResult,
  PricingCatalogResponse,
  ReactivationResult,
} from "@/features/billing/lib/billing-types"
import { billingQueryKeys } from "@/features/billing/lib/billing-query-keys"
import type {
  CreateSubscriptionIntentInput,
  PaymentMethodActionInput,
  SubscriptionChangeInput,
  SubscriptionTargetInput,
  UpdateBillingProfileInput,
} from "@/features/billing/lib/billing-schemas"
import {
  createSubscriptionIntentSchema,
  paymentMethodActionSchema,
  subscriptionChangeSchema,
  subscriptionTargetSchema,
  updateBillingProfileSchema,
} from "@/features/billing/lib/billing-schemas"

export class BillingClientError extends Error {
  data: unknown
  status: number

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.data = data
    this.status = status
  }
}

function toBillingClientError(error: unknown) {
  if (error instanceof BillingClientError) {
    return error
  }

  const message =
    error instanceof Error ? error.message : "Billing request failed."
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500

  return new BillingClientError(message, status, error)
}

async function queryPricingCatalog(convex: ConvexReactClient) {
  try {
    return (await convex.query(
      api.queries.billing.catalog.getCustomerPricingCatalog,
      {}
    )) as PricingCatalogResponse
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function queryBillingState(convex: ConvexReactClient) {
  try {
    return (await convex.query(
      api.queries.billing.state.getCurrentUserBillingState,
      {}
    )) as BillingResolvedState | null
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function queryBillingCenter(convex: ConvexReactClient) {
  try {
    return (await convex.query(
      api.queries.billing.center.getCurrentUserBillingCenter,
      {}
    )) as BillingCenterData | null
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callSyncBillingCenter(convex: ConvexReactClient) {
  try {
    return (await convex.action(
      api.actions.billing.customer.syncBillingCenter,
      {}
    )) as BillingCenterSyncResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callCreateSubscriptionIntent(
  convex: ConvexReactClient,
  input: CreateSubscriptionIntentInput
) {
  const payload = createSubscriptionIntentSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.createSubscriptionIntent,
      payload
    )) as CheckoutIntentResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callAbandonPendingCheckout(convex: ConvexReactClient) {
  try {
    return (await convex.action(
      api.actions.billing.customer.abandonPendingCheckout,
      {}
    )) as {
      abandoned: boolean
      invoiceWasCleared?: boolean
      status?: string
    }
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callPreviewSubscriptionChange(
  convex: ConvexReactClient,
  input: SubscriptionChangeInput
) {
  const payload = subscriptionChangeSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.previewSubscriptionChange,
      payload
    )) as BillingChangePreview
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callChangeSubscription(
  convex: ConvexReactClient,
  input: SubscriptionChangeInput
) {
  const payload = subscriptionChangeSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.changeSubscriptionPlan,
      payload
    )) as BillingChangeResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callCancelSubscription(
  convex: ConvexReactClient,
  input: SubscriptionTargetInput
) {
  const payload = subscriptionTargetSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.cancelCurrentSubscription,
      payload
    )) as CancellationResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callReactivateSubscription(
  convex: ConvexReactClient,
  input: SubscriptionTargetInput
) {
  const payload = subscriptionTargetSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.reactivateCurrentSubscription,
      payload
    )) as ReactivationResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callUpdateBillingProfile(
  convex: ConvexReactClient,
  input: UpdateBillingProfileInput
) {
  const payload = updateBillingProfileSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.updateBillingProfile,
      payload
    )) as BillingProfileUpdateResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callCreatePaymentMethodSetupIntent(convex: ConvexReactClient) {
  try {
    return (await convex.action(
      api.actions.billing.customer.createPaymentMethodSetupIntent,
      {}
    )) as PaymentMethodSetupIntentResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callSetDefaultPaymentMethod(
  convex: ConvexReactClient,
  input: PaymentMethodActionInput
) {
  const payload = paymentMethodActionSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.setDefaultPaymentMethod,
      payload
    )) as PaymentMethodMutationResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

async function callRemovePaymentMethod(
  convex: ConvexReactClient,
  input: PaymentMethodActionInput
) {
  const payload = paymentMethodActionSchema.parse(input)

  try {
    return (await convex.action(
      api.actions.billing.customer.removePaymentMethod,
      payload
    )) as PaymentMethodMutationResult
  } catch (error) {
    throw toBillingClientError(error)
  }
}

export function usePricingCatalog() {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    queryFn: () => queryPricingCatalog(convex),
    queryKey: billingQueryKeys.catalog,
    staleTime: 30_000,
  })
}

export function useBillingState() {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    queryFn: () => queryBillingState(convex),
    queryKey: billingQueryKeys.state,
    staleTime: 15_000,
  })
}

export function useBillingCenter() {
  const convex = useConvex()
  const { isAuthenticated, isLoading } = useConvexAuth()

  return useQuery({
    enabled: !isLoading && isAuthenticated,
    queryFn: () => queryBillingCenter(convex),
    queryKey: billingQueryKeys.center,
    staleTime: 15_000,
  })
}

export function useInvalidateBillingQueries() {
  const queryClient = useQueryClient()

  return {
    invalidateAll: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: billingQueryKeys.catalog }),
        queryClient.invalidateQueries({ queryKey: billingQueryKeys.center }),
        queryClient.invalidateQueries({ queryKey: billingQueryKeys.state }),
      ])
    },
  }
}

export function useSyncBillingCenter() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: () => callSyncBillingCenter(convex),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useCreateSubscriptionIntent() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: CreateSubscriptionIntentInput) =>
      callCreateSubscriptionIntent(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useAbandonPendingCheckout() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: () => callAbandonPendingCheckout(convex),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function usePreviewSubscriptionChange() {
  const convex = useConvex()

  return useMutation({
    mutationFn: (input: SubscriptionChangeInput) =>
      callPreviewSubscriptionChange(convex, input),
  })
}

export function useUpdateSubscriptionPlan() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: SubscriptionChangeInput) =>
      callChangeSubscription(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useCancelSubscription() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: SubscriptionTargetInput) =>
      callCancelSubscription(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useReactivateSubscription() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: SubscriptionTargetInput) =>
      callReactivateSubscription(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useUpdateBillingProfile() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: UpdateBillingProfileInput) =>
      callUpdateBillingProfile(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useCreatePaymentMethodSetupIntent() {
  const convex = useConvex()

  return useMutation({
    mutationFn: () => callCreatePaymentMethodSetupIntent(convex),
  })
}

export function useSetDefaultPaymentMethod() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: PaymentMethodActionInput) =>
      callSetDefaultPaymentMethod(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}

export function useRemovePaymentMethod() {
  const convex = useConvex()
  const invalidateBilling = useInvalidateBillingQueries()

  return useMutation({
    mutationFn: (input: PaymentMethodActionInput) =>
      callRemovePaymentMethod(convex, input),
    onSuccess: async () => {
      await invalidateBilling.invalidateAll()
    },
  })
}
