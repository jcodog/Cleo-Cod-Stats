"use node"

import Stripe from "stripe"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { resolveBillingFeatureApplyMode } from "../../lib/staffRoles"
import { STRIPE_CATALOG_APP, getStripe } from "../../lib/stripe"
import type {
  BillingCatalogPlan,
  BillingFeatureRecord,
  BillingPlanRecord,
} from "../../queries/billing/catalog"

const STRIPE_PAGE_SIZE = 100
const MAX_MARKETING_FEATURES = 15

type BillingInterval = "month" | "year"

type StripeFeatureMatchSource = "stored_id" | "lookup_key" | "metadata" | "name"
type StripeProductMatchSource = "stored_id" | "metadata" | "name"

type SyncWarningCode =
  | "inactive_feature_missing_in_stripe"
  | "inactive_plan_missing_in_stripe"
  | "invalid_marketing_feature_name"
  | "invalid_stored_feature_id"
  | "invalid_stored_price_id"
  | "invalid_stored_product_id"
  | "inactive_feature_mapping"
  | "missing_feature_mapping"
  | "plan_has_stripe_ids_but_is_free"
  | "price_lookup_key_conflict"
  | "price_not_created_for_inactive_plan"
  | "skipped_attachment_without_feature_id"
  | "stripe_attachment_not_managed"
  | "stripe_feature_lookup_key_mismatch"
  | "stripe_feature_name_fallback"
  | "stripe_product_name_fallback"
  | "stripe_product_missing_app_metadata"
  | "truncated_marketing_features"
  | "unsafe_stored_feature_match"
  | "unsafe_stored_price_match"
  | "unsafe_stored_product_match"

type SyncWarning = {
  code: SyncWarningCode
  message: string
  featureKey?: string
  planKey?: string
  stripeObjectId?: string
}

type FeatureSyncSummary = {
  featureKey: string
  stripeFeatureId: string
  changes?: string[]
  matchedBy?: StripeFeatureMatchSource
}

type ProductSyncSummary = {
  planKey: string
  stripeProductId: string
  changes?: string[]
  matchedBy?: StripeProductMatchSource
}

type PriceSyncSummary = {
  amount: number
  currency: string
  interval: BillingInterval
  planKey: string
  reactivated?: boolean
  stripePriceId: string
}

type AttachmentSyncSummary = {
  attachmentId: string
  featureKey?: string
  planKey: string
  stripeFeatureId: string
  stripeProductId: string
}

export type StripeCatalogSyncResult = {
  ok: true
  syncedAt: number
  featuresProcessed: number
  plansProcessed: number
  paidPlansProcessed: number
  freePlansSkipped: string[]
  featuresCreated: FeatureSyncSummary[]
  featuresUpdated: FeatureSyncSummary[]
  productsCreated: ProductSyncSummary[]
  productsUpdated: ProductSyncSummary[]
  pricesCreated: PriceSyncSummary[]
  pricesReused: PriceSyncSummary[]
  pricesArchived: PriceSyncSummary[]
  attachmentsCreated: AttachmentSyncSummary[]
  attachmentsRemoved: AttachmentSyncSummary[]
  warnings: SyncWarning[]
}

type FeatureUpsertResult = {
  created: boolean
  feature: Stripe.Entitlements.Feature | null
  matchedBy: StripeFeatureMatchSource | null
  updated: boolean
  changes: string[]
}

type ProductUpsertResult = {
  created: boolean
  product: Stripe.Product | null
  matchedBy: StripeProductMatchSource | null
  updated: boolean
  changes: string[]
}

type PriceEnsureResult = {
  archivedPrices: Stripe.Price[]
  created: boolean
  price: Stripe.Price | null
  reactivated: boolean
  reused: boolean
}

function addWarning(warnings: SyncWarning[], warning: SyncWarning) {
  warnings.push(warning)
}

function mergeChanges(existing: string[] | undefined, next: string[] | undefined) {
  return Array.from(new Set([...(existing ?? []), ...(next ?? [])]))
}

function recordSummaryEntry<T extends { changes?: string[] }>(
  map: Map<string, T>,
  key: string,
  entry: T
) {
  const existing = map.get(key)

  if (!existing) {
    map.set(key, entry)
    return
  }

  map.set(key, {
    ...existing,
    ...entry,
    changes: mergeChanges(existing.changes, entry.changes),
  })
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

function getRequiredPlanName(plan: BillingPlanRecord) {
  const name = plan.name.trim()

  if (!name) {
    throw new Error(`Billing plan ${plan.key} is missing a name`)
  }

  return name
}

function getPlanDescription(plan: BillingPlanRecord) {
  return plan.description.trim()
}

function getRequiredFeatureName(feature: BillingFeatureRecord) {
  const name = feature.name.trim()

  if (!name) {
    throw new Error(`Billing feature ${feature.key} is missing a name`)
  }

  return name
}

function normalizeCurrencyCode(currency: string) {
  const normalizedCurrency = currency.trim().toLowerCase()

  if (!/^[a-z]{3}$/.test(normalizedCurrency)) {
    throw new Error(`Invalid Stripe currency code: ${currency}`)
  }

  return normalizedCurrency
}

function assertValidPriceAmount(
  amount: number,
  planKey: string,
  interval: BillingInterval
) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(
      `Invalid ${interval} unit amount for billing plan ${planKey}: ${amount}`
    )
  }
}

function getMetadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string
) {
  const value = metadata?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function isManagedStripeObject(metadata: Stripe.Metadata | null | undefined) {
  return getMetadataValue(metadata, "app") === STRIPE_CATALOG_APP
}

function planMetadata(plan: BillingPlanRecord) {
  return {
    app: STRIPE_CATALOG_APP,
    planKey: plan.key,
    planType: plan.planType,
  }
}

function featureMetadata(feature: BillingFeatureRecord) {
  return {
    app: STRIPE_CATALOG_APP,
    featureKey: feature.key,
  }
}

function priceMetadata(planKey: string, interval: BillingInterval) {
  return {
    app: STRIPE_CATALOG_APP,
    billingInterval: interval,
    planKey,
  }
}

function getPriceLookupKey(planKey: string, interval: BillingInterval) {
  return `${STRIPE_CATALOG_APP}:${planKey}:${interval}`
}

function getPriceNickname(planKey: string, interval: BillingInterval) {
  return `${STRIPE_CATALOG_APP}:${planKey}:${interval}`
}

function metadataMatches(
  metadata: Stripe.Metadata,
  expected: Record<string, string>
) {
  return Object.entries(expected).every(([key, value]) => metadata[key] === value)
}

function marketingFeaturesMatch(
  existing: Array<{ name?: string | null }>,
  desired: Array<{ name: string }>
) {
  if (existing.length !== desired.length) {
    return false
  }

  return existing.every(
    (marketingFeature, index) => (marketingFeature.name ?? "") === desired[index]?.name
  )
}

function getDefaultPriceId(product: Stripe.Product) {
  if (!product.default_price) {
    return null
  }

  return typeof product.default_price === "string"
    ? product.default_price
    : product.default_price.id
}

function getPriceProductId(price: Stripe.Price) {
  return typeof price.product === "string" ? price.product : price.product.id
}

function productMatchesCatalogShape(
  product: Stripe.Product,
  plan: BillingPlanRecord
) {
  return (
    normalizeText(product.name) === normalizeText(getRequiredPlanName(plan)) &&
    normalizeText(product.description) === normalizeText(getPlanDescription(plan))
  )
}

function featureMatchesCatalogName(
  stripeFeature: Stripe.Entitlements.Feature,
  feature: BillingFeatureRecord
) {
  return (
    normalizeText(stripeFeature.name) === normalizeText(getRequiredFeatureName(feature))
  )
}

function featureAppliesToMarketing(feature: BillingFeatureRecord) {
  const appliesTo = resolveBillingFeatureApplyMode(feature.appliesTo)
  return appliesTo === "marketing" || appliesTo === "both"
}

function featureAppliesToEntitlement(feature: BillingFeatureRecord) {
  const appliesTo = resolveBillingFeatureApplyMode(feature.appliesTo)
  return appliesTo === "entitlement" || appliesTo === "both"
}

function isSafeProductCandidate(
  product: Stripe.Product,
  plan: BillingPlanRecord
) {
  if (product.type !== "service") {
    return false
  }

  const metadataApp = getMetadataValue(product.metadata, "app")
  const metadataPlanKey = getMetadataValue(product.metadata, "planKey")

  return (
    (metadataApp === null || metadataApp === STRIPE_CATALOG_APP) &&
    (metadataPlanKey === null || metadataPlanKey === plan.key)
  )
}

function isSafeFeatureCandidate(
  stripeFeature: Stripe.Entitlements.Feature,
  feature: BillingFeatureRecord
) {
  const metadataApp = getMetadataValue(stripeFeature.metadata, "app")
  const metadataFeatureKey = getMetadataValue(
    stripeFeature.metadata,
    "featureKey"
  )

  return (
    (metadataApp === null || metadataApp === STRIPE_CATALOG_APP) &&
    (metadataFeatureKey === null || metadataFeatureKey === feature.key)
  )
}

function priceMatches(
  price: Stripe.Price,
  args: {
    amount: number
    currency: string
    interval: BillingInterval
    productId: string
  }
) {
  return (
    getPriceProductId(price) === args.productId &&
    price.type === "recurring" &&
    price.recurring?.interval === args.interval &&
    price.unit_amount === args.amount &&
    price.currency === args.currency
  )
}

function isManagedPrice(
  price: Stripe.Price,
  planKey: string,
  interval: BillingInterval
) {
  return (
    getMetadataValue(price.metadata, "app") === STRIPE_CATALOG_APP &&
    getMetadataValue(price.metadata, "planKey") === planKey &&
    getMetadataValue(price.metadata, "billingInterval") === interval
  )
}

function shouldArchivePrice(
  price: Stripe.Price,
  args: {
    interval: BillingInterval
    lookupKey: string
    planKey: string
    productId: string
  }
) {
  return (
    getPriceProductId(price) === args.productId &&
    (isManagedPrice(price, args.planKey, args.interval) ||
      price.lookup_key === args.lookupKey)
  )
}

function sortPriceCandidates(
  left: Stripe.Price,
  right: Stripe.Price,
  lookupKey: string,
  planKey: string,
  interval: BillingInterval
) {
  const leftScore =
    (left.active ? 4 : 0) +
    (left.lookup_key === lookupKey ? 2 : 0) +
    (isManagedPrice(left, planKey, interval) ? 1 : 0)
  const rightScore =
    (right.active ? 4 : 0) +
    (right.lookup_key === lookupKey ? 2 : 0) +
    (isManagedPrice(right, planKey, interval) ? 1 : 0)

  if (leftScore !== rightScore) {
    return rightScore - leftScore
  }

  return right.created - left.created
}

function selectUniqueCandidate<T extends { id: string }>(
  candidates: T[],
  message: string
) {
  if (candidates.length === 0) {
    return null
  }

  if (candidates.length === 1) {
    return candidates[0]
  }

  throw new Error(`${message}: ${candidates.map((candidate) => candidate.id).join(", ")}`)
}

function buildMarketingFeatures(
  plan: BillingCatalogPlan,
  warnings: SyncWarning[]
) {
  const marketingFeatures: Stripe.ProductCreateParams.MarketingFeature[] = []
  const seenFeatureNames = new Set<string>()

  for (const feature of plan.features) {
    if (!featureAppliesToMarketing(feature)) {
      continue
    }

    const featureName = feature.name.trim()
    const normalizedFeatureName = normalizeText(featureName)

    if (!normalizedFeatureName) {
      addWarning(warnings, {
        code: "invalid_marketing_feature_name",
        message: `Skipping blank marketing feature name on plan ${plan.key}`,
        featureKey: feature.key,
        planKey: plan.key,
      })
      continue
    }

    if (seenFeatureNames.has(normalizedFeatureName)) {
      continue
    }

    seenFeatureNames.add(normalizedFeatureName)
    marketingFeatures.push({ name: featureName })
  }

  if (marketingFeatures.length > MAX_MARKETING_FEATURES) {
    addWarning(warnings, {
      code: "truncated_marketing_features",
      message: `Plan ${plan.key} has more than ${MAX_MARKETING_FEATURES} marketing features; Stripe marketing_features will be truncated`,
      planKey: plan.key,
    })

    return marketingFeatures.slice(0, MAX_MARKETING_FEATURES)
  }

  return marketingFeatures
}

function buildProductCreateParams(
  plan: BillingCatalogPlan,
  marketingFeatures: Stripe.ProductCreateParams.MarketingFeature[]
): Stripe.ProductCreateParams {
  const description = getPlanDescription(plan)

  return {
    active: plan.active,
    description: description || undefined,
    marketing_features: marketingFeatures.length > 0 ? marketingFeatures : undefined,
    metadata: planMetadata(plan),
    name: getRequiredPlanName(plan),
    type: "service",
  }
}

function buildProductUpdateParams(
  plan: BillingCatalogPlan,
  marketingFeatures: Stripe.ProductCreateParams.MarketingFeature[]
): Stripe.ProductUpdateParams {
  const description = getPlanDescription(plan)

  return {
    active: plan.active,
    description: description || "",
    marketing_features: marketingFeatures.length > 0 ? marketingFeatures : "",
    metadata: planMetadata(plan),
    name: getRequiredPlanName(plan),
  }
}

function getProductFieldChanges(
  product: Stripe.Product,
  plan: BillingCatalogPlan,
  marketingFeatures: Stripe.ProductCreateParams.MarketingFeature[]
) {
  const changes: string[] = []

  if (product.active !== plan.active) {
    changes.push("active")
  }

  if (product.name !== getRequiredPlanName(plan)) {
    changes.push("name")
  }

  if ((product.description ?? "") !== getPlanDescription(plan)) {
    changes.push("description")
  }

  if (!metadataMatches(product.metadata, planMetadata(plan))) {
    changes.push("metadata")
  }

  if (!marketingFeaturesMatch(product.marketing_features, marketingFeatures)) {
    changes.push("marketing_features")
  }

  return changes
}

function getFeatureFieldChanges(
  stripeFeature: Stripe.Entitlements.Feature,
  feature: BillingFeatureRecord
) {
  const changes: string[] = []

  if (stripeFeature.active !== feature.active) {
    changes.push("active")
  }

  if (stripeFeature.name !== getRequiredFeatureName(feature)) {
    changes.push("name")
  }

  if (!metadataMatches(stripeFeature.metadata, featureMetadata(feature))) {
    changes.push("metadata")
  }

  return changes
}

function getPriceFieldChanges(
  price: Stripe.Price,
  args: {
    desiredActive: boolean
    interval: BillingInterval
    planKey: string
  }
) {
  const desiredLookupKey = getPriceLookupKey(args.planKey, args.interval)
  const desiredNickname = getPriceNickname(args.planKey, args.interval)
  const desiredMetadata = priceMetadata(args.planKey, args.interval)
  const changes: string[] = []

  if (price.active !== args.desiredActive) {
    changes.push("active")
  }

  if (price.lookup_key !== desiredLookupKey) {
    changes.push("lookup_key")
  }

  if (price.nickname !== desiredNickname) {
    changes.push("nickname")
  }

  if (!metadataMatches(price.metadata, desiredMetadata)) {
    changes.push("metadata")
  }

  return changes
}

function buildPriceUpdateParams(args: {
  desiredActive: boolean
  interval: BillingInterval
  planKey: string
}): Stripe.PriceUpdateParams {
  return {
    active: args.desiredActive,
    lookup_key: getPriceLookupKey(args.planKey, args.interval),
    metadata: priceMetadata(args.planKey, args.interval),
    nickname: getPriceNickname(args.planKey, args.interval),
    transfer_lookup_key: true,
  }
}

async function collectList<T>(list: Stripe.ApiListPromise<T>) {
  const items: T[] = []

  for await (const item of list) {
    items.push(item)
  }

  return items
}

function upsertItemById<T extends { id: string }>(items: T[], nextItem: T) {
  const existingIndex = items.findIndex((item) => item.id === nextItem.id)

  if (existingIndex === -1) {
    items.push(nextItem)
    return
  }

  items[existingIndex] = nextItem
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values())
}

function isStripeNotFoundError(error: unknown) {
  return error instanceof Error && "statusCode" in error && error.statusCode === 404
}

async function retrieveProductIfExists(params: {
  planKey: string
  productId?: string
  stripe: Stripe
  warnings: SyncWarning[]
}) {
  if (!params.productId) {
    return null
  }

  try {
    const product = await params.stripe.products.retrieve(params.productId)

    if ("deleted" in product && product.deleted) {
      addWarning(params.warnings, {
        code: "invalid_stored_product_id",
        message: `Stored Stripe product ${params.productId} for plan ${params.planKey} was deleted`,
        planKey: params.planKey,
        stripeObjectId: params.productId,
      })
      return null
    }

    return product
  } catch (error) {
    if (isStripeNotFoundError(error)) {
      addWarning(params.warnings, {
        code: "invalid_stored_product_id",
        message: `Stored Stripe product ${params.productId} for plan ${params.planKey} no longer exists`,
        planKey: params.planKey,
        stripeObjectId: params.productId,
      })
      return null
    }

    throw error
  }
}

async function retrieveFeatureIfExists(params: {
  featureId?: string
  featureKey: string
  stripe: Stripe
  warnings: SyncWarning[]
}) {
  if (!params.featureId) {
    return null
  }

  try {
    return await params.stripe.entitlements.features.retrieve(params.featureId)
  } catch (error) {
    if (isStripeNotFoundError(error)) {
      addWarning(params.warnings, {
        code: "invalid_stored_feature_id",
        message: `Stored Stripe feature ${params.featureId} for feature ${params.featureKey} no longer exists`,
        featureKey: params.featureKey,
        stripeObjectId: params.featureId,
      })
      return null
    }

    throw error
  }
}

async function retrievePriceIfExists(params: {
  interval: BillingInterval
  planKey: string
  priceId?: string
  stripe: Stripe
  warnings: SyncWarning[]
}) {
  if (!params.priceId) {
    return null
  }

  try {
    return await params.stripe.prices.retrieve(params.priceId)
  } catch (error) {
    if (isStripeNotFoundError(error)) {
      addWarning(params.warnings, {
        code: "invalid_stored_price_id",
        message: `Stored Stripe price ${params.priceId} for ${params.planKey}/${params.interval} no longer exists`,
        planKey: params.planKey,
        stripeObjectId: params.priceId,
      })
      return null
    }

    throw error
  }
}

async function resolveStripeFeature(params: {
  feature: BillingFeatureRecord
  stripe: Stripe
  stripeFeatures: Stripe.Entitlements.Feature[]
  warnings: SyncWarning[]
}) {
  const { feature, stripe, stripeFeatures, warnings } = params

  const storedFeature = await retrieveFeatureIfExists({
    featureId: feature.stripeFeatureId,
    featureKey: feature.key,
    stripe,
    warnings,
  })

  if (storedFeature) {
    const hasMatchingIdentity =
      storedFeature.lookup_key === feature.key ||
      getMetadataValue(storedFeature.metadata, "featureKey") === feature.key

    if (
      isSafeFeatureCandidate(storedFeature, feature) &&
      (hasMatchingIdentity || featureMatchesCatalogName(storedFeature, feature))
    ) {
      return {
        feature: storedFeature,
        matchedBy: "stored_id" as const,
      }
    }

    addWarning(warnings, {
      code: "unsafe_stored_feature_match",
      message: `Stored Stripe feature ${storedFeature.id} does not safely match billing feature ${feature.key}; ignoring saved Stripe ID`,
      featureKey: feature.key,
      stripeObjectId: storedFeature.id,
    })
  }

  const lookupKeyCandidates = stripeFeatures.filter(
    (stripeFeature) =>
      stripeFeature.lookup_key === feature.key &&
      isSafeFeatureCandidate(stripeFeature, feature)
  )
  const lookupKeyMatch = selectUniqueCandidate(
    lookupKeyCandidates,
    `Ambiguous Stripe feature lookup_key match for ${feature.key}`
  )

  if (lookupKeyMatch) {
    return {
      feature: lookupKeyMatch,
      matchedBy: "lookup_key" as const,
    }
  }

  const metadataCandidates = stripeFeatures.filter(
    (stripeFeature) =>
      getMetadataValue(stripeFeature.metadata, "featureKey") === feature.key &&
      isSafeFeatureCandidate(stripeFeature, feature)
  )
  const metadataMatch = selectUniqueCandidate(
    metadataCandidates,
    `Ambiguous Stripe feature metadata match for ${feature.key}`
  )

  if (metadataMatch) {
    return {
      feature: metadataMatch,
      matchedBy: "metadata" as const,
    }
  }

  const nameCandidates = stripeFeatures.filter(
    (stripeFeature) =>
      isSafeFeatureCandidate(stripeFeature, feature) &&
      featureMatchesCatalogName(stripeFeature, feature)
  )
  const nameMatch = selectUniqueCandidate(
    nameCandidates,
    `Ambiguous Stripe feature name match for ${feature.key}`
  )

  if (nameMatch) {
    addWarning(warnings, {
      code: "stripe_feature_name_fallback",
      message: `Recovered Stripe feature ${nameMatch.id} for ${feature.key} via exact name match fallback`,
      featureKey: feature.key,
      stripeObjectId: nameMatch.id,
    })

    if (nameMatch.lookup_key !== feature.key) {
      addWarning(warnings, {
        code: "stripe_feature_lookup_key_mismatch",
        message: `Stripe feature ${nameMatch.id} matched ${feature.key} by name, but its immutable lookup_key is ${nameMatch.lookup_key}`,
        featureKey: feature.key,
        stripeObjectId: nameMatch.id,
      })
    }

    return {
      feature: nameMatch,
      matchedBy: "name" as const,
    }
  }

  return {
    feature: null,
    matchedBy: null,
  }
}

async function syncStripeFeature(params: {
  feature: BillingFeatureRecord
  stripe: Stripe
  stripeFeatures: Stripe.Entitlements.Feature[]
  warnings: SyncWarning[]
}): Promise<FeatureUpsertResult> {
  const { feature, stripe, stripeFeatures, warnings } = params
  const resolution = await resolveStripeFeature(params)

  if (!resolution.feature) {
    if (!feature.active) {
      addWarning(warnings, {
        code: "inactive_feature_missing_in_stripe",
        message: `Billing feature ${feature.key} is inactive and has no Stripe feature to update; skipping Stripe creation`,
        featureKey: feature.key,
      })

      return {
        created: false,
        feature: null,
        matchedBy: null,
        updated: false,
        changes: [],
      }
    }

    const createdFeature = await stripe.entitlements.features.create({
      lookup_key: feature.key,
      metadata: featureMetadata(feature),
      name: getRequiredFeatureName(feature),
    })

    upsertItemById(stripeFeatures, createdFeature)

    return {
      created: true,
      feature: createdFeature,
      matchedBy: null,
      updated: false,
      changes: [],
    }
  }

  const changes = getFeatureFieldChanges(resolution.feature, feature)

  if (changes.length === 0) {
    return {
      created: false,
      feature: resolution.feature,
      matchedBy: resolution.matchedBy,
      updated: false,
      changes,
    }
  }

  const updatedFeature = await stripe.entitlements.features.update(
    resolution.feature.id,
    {
      active: feature.active,
      metadata: featureMetadata(feature),
      name: getRequiredFeatureName(feature),
    }
  )

  upsertItemById(stripeFeatures, updatedFeature)

  return {
    created: false,
    feature: updatedFeature,
    matchedBy: resolution.matchedBy,
    updated: true,
    changes,
  }
}

async function resolveStripeProduct(params: {
  plan: BillingCatalogPlan
  stripe: Stripe
  stripeProducts: Stripe.Product[]
  warnings: SyncWarning[]
}) {
  const { plan, stripe, stripeProducts, warnings } = params

  const storedProduct = await retrieveProductIfExists({
    planKey: plan.key,
    productId: plan.stripeProductId,
    stripe,
    warnings,
  })

  if (storedProduct) {
    if (isSafeProductCandidate(storedProduct, plan)) {
      return {
        matchedBy: "stored_id" as const,
        product: storedProduct,
      }
    }

    addWarning(warnings, {
      code: "unsafe_stored_product_match",
      message: `Stored Stripe product ${storedProduct.id} does not safely match billing plan ${plan.key}; ignoring saved Stripe ID`,
      planKey: plan.key,
      stripeObjectId: storedProduct.id,
    })
  }

  const managedMetadataCandidates = stripeProducts.filter(
    (product) =>
      product.type === "service" &&
      getMetadataValue(product.metadata, "app") === STRIPE_CATALOG_APP &&
      getMetadataValue(product.metadata, "planKey") === plan.key
  )
  const managedMetadataMatch = selectUniqueCandidate(
    managedMetadataCandidates,
    `Ambiguous Stripe product metadata match for ${plan.key}`
  )

  if (managedMetadataMatch) {
    return {
      matchedBy: "metadata" as const,
      product: managedMetadataMatch,
    }
  }

  const legacyMetadataCandidates = stripeProducts.filter(
    (product) =>
      product.type === "service" &&
      getMetadataValue(product.metadata, "app") === null &&
      getMetadataValue(product.metadata, "planKey") === plan.key &&
      productMatchesCatalogShape(product, plan)
  )
  const legacyMetadataMatch = selectUniqueCandidate(
    legacyMetadataCandidates,
    `Ambiguous legacy Stripe product metadata match for ${plan.key}`
  )

  if (legacyMetadataMatch) {
    addWarning(warnings, {
      code: "stripe_product_missing_app_metadata",
      message: `Recovered Stripe product ${legacyMetadataMatch.id} for ${plan.key} via legacy metadata without app tag`,
      planKey: plan.key,
      stripeObjectId: legacyMetadataMatch.id,
    })

    return {
      matchedBy: "metadata" as const,
      product: legacyMetadataMatch,
    }
  }

  const nameCandidates = stripeProducts.filter(
    (product) =>
      isSafeProductCandidate(product, plan) && productMatchesCatalogShape(product, plan)
  )
  const nameMatch = selectUniqueCandidate(
    nameCandidates,
    `Ambiguous Stripe product name match for ${plan.key}`
  )

  if (nameMatch) {
    addWarning(warnings, {
      code: "stripe_product_name_fallback",
      message: `Recovered Stripe product ${nameMatch.id} for ${plan.key} via exact name/description fallback`,
      planKey: plan.key,
      stripeObjectId: nameMatch.id,
    })

    return {
      matchedBy: "name" as const,
      product: nameMatch,
    }
  }

  return {
    matchedBy: null,
    product: null,
  }
}

async function syncStripeProduct(params: {
  plan: BillingCatalogPlan
  stripe: Stripe
  stripeProducts: Stripe.Product[]
  warnings: SyncWarning[]
}): Promise<ProductUpsertResult> {
  const { plan, stripe, stripeProducts, warnings } = params
  const marketingFeatures = buildMarketingFeatures(plan, warnings)
  const resolution = await resolveStripeProduct({
    plan,
    stripe,
    stripeProducts,
    warnings,
  })

  if (!resolution.product) {
    if (!plan.active) {
      addWarning(warnings, {
        code: "inactive_plan_missing_in_stripe",
        message: `Billing plan ${plan.key} is inactive and has no Stripe product to update; skipping Stripe product creation`,
        planKey: plan.key,
      })

      return {
        created: false,
        product: null,
        matchedBy: null,
        updated: false,
        changes: [],
      }
    }

    const createdProduct = await stripe.products.create(
      buildProductCreateParams(plan, marketingFeatures)
    )

    upsertItemById(stripeProducts, createdProduct)

    return {
      created: true,
      product: createdProduct,
      matchedBy: null,
      updated: false,
      changes: [],
    }
  }

  const changes = getProductFieldChanges(
    resolution.product,
    plan,
    marketingFeatures
  )

  if (changes.length === 0) {
    return {
      created: false,
      product: resolution.product,
      matchedBy: resolution.matchedBy,
      updated: false,
      changes,
    }
  }

  const updatedProduct = await stripe.products.update(
    resolution.product.id,
    buildProductUpdateParams(plan, marketingFeatures)
  )

  upsertItemById(stripeProducts, updatedProduct)

  return {
    created: false,
    product: updatedProduct,
    matchedBy: resolution.matchedBy,
    updated: true,
    changes,
  }
}

async function archivePrices(params: {
  interval: BillingInterval
  keepPriceId: string
  planKey: string
  prices: Stripe.Price[]
  productId: string
  stripe: Stripe
  warnings: SyncWarning[]
}) {
  const archivedPrices: Stripe.Price[] = []
  const lookupKey = getPriceLookupKey(params.planKey, params.interval)

  for (const price of dedupeById(params.prices)) {
    if (price.id === params.keepPriceId || !price.active) {
      continue
    }

    if (
      !shouldArchivePrice(price, {
        interval: params.interval,
        lookupKey,
        planKey: params.planKey,
        productId: params.productId,
      })
    ) {
      addWarning(params.warnings, {
        code: "unsafe_stored_price_match",
        message: `Skipping archival for Stripe price ${price.id} because it is not clearly managed by ${params.planKey}/${params.interval}`,
        planKey: params.planKey,
        stripeObjectId: price.id,
      })
      continue
    }

    const archivedPrice = await params.stripe.prices.update(price.id, {
      active: false,
    })

    archivedPrices.push(archivedPrice)
  }

  return archivedPrices
}

async function ensureRecurringPrice(params: {
  allowCreate: boolean
  amount: number
  currency: string
  desiredActive: boolean
  existingPriceId?: string
  interval: BillingInterval
  planKey: string
  productId: string
  stripe: Stripe
  warnings: SyncWarning[]
}): Promise<PriceEnsureResult> {
  const normalizedCurrency = normalizeCurrencyCode(params.currency)
  assertValidPriceAmount(params.amount, params.planKey, params.interval)

  const lookupKey = getPriceLookupKey(params.planKey, params.interval)
  const storedPrice = await retrievePriceIfExists({
    interval: params.interval,
    planKey: params.planKey,
    priceId: params.existingPriceId,
    stripe: params.stripe,
    warnings: params.warnings,
  })
  const pricesToArchive: Stripe.Price[] = []

  if (storedPrice) {
    if (
      priceMatches(storedPrice, {
        amount: params.amount,
        currency: normalizedCurrency,
        interval: params.interval,
        productId: params.productId,
      })
    ) {
      const changes = getPriceFieldChanges(storedPrice, {
        desiredActive: params.desiredActive,
        interval: params.interval,
        planKey: params.planKey,
      })

      if (changes.length === 0) {
        return {
          archivedPrices: [],
          created: false,
          price: storedPrice,
          reactivated: false,
          reused: true,
        }
      }

      const lookupKeyPrices = await collectList(
        params.stripe.prices.list({
          limit: STRIPE_PAGE_SIZE,
          lookup_keys: [lookupKey],
          type: "recurring",
        })
      )
      const updatedPrice = await params.stripe.prices.update(
        storedPrice.id,
        buildPriceUpdateParams({
          desiredActive: params.desiredActive,
          interval: params.interval,
          planKey: params.planKey,
        })
      )
      const archivedPrices = await archivePrices({
        interval: params.interval,
        keepPriceId: updatedPrice.id,
        planKey: params.planKey,
        prices: lookupKeyPrices,
        productId: params.productId,
        stripe: params.stripe,
        warnings: params.warnings,
      })

      return {
        archivedPrices,
        created: false,
        price: updatedPrice,
        reactivated: !storedPrice.active && updatedPrice.active,
        reused: true,
      }
    }

    pricesToArchive.push(storedPrice)

    addWarning(params.warnings, {
      code: "unsafe_stored_price_match",
      message: `Stored Stripe price ${storedPrice.id} for ${params.planKey}/${params.interval} does not match the current catalog values; a new or reusable exact match will be selected`,
      planKey: params.planKey,
      stripeObjectId: storedPrice.id,
    })
  }

  const [lookupKeyPrices, productPrices] = await Promise.all([
    collectList(
      params.stripe.prices.list({
        limit: STRIPE_PAGE_SIZE,
        lookup_keys: [lookupKey],
        type: "recurring",
      })
    ),
    collectList(
      params.stripe.prices.list({
        limit: STRIPE_PAGE_SIZE,
        product: params.productId,
        recurring: {
          interval: params.interval,
        },
        type: "recurring",
      })
    ),
  ])

  const exactMatches = dedupeById(
    [...lookupKeyPrices, ...productPrices].filter((price) =>
      priceMatches(price, {
        amount: params.amount,
        currency: normalizedCurrency,
        interval: params.interval,
        productId: params.productId,
      })
    )
  ).sort((left, right) =>
    sortPriceCandidates(left, right, lookupKey, params.planKey, params.interval)
  )

  const exactMatch = exactMatches[0] ?? null

  if (exactMatch) {
    const changes = getPriceFieldChanges(exactMatch, {
      desiredActive: params.desiredActive,
      interval: params.interval,
      planKey: params.planKey,
    })

    const finalPrice =
      changes.length === 0
        ? exactMatch
        : await params.stripe.prices.update(
            exactMatch.id,
            buildPriceUpdateParams({
              desiredActive: params.desiredActive,
              interval: params.interval,
              planKey: params.planKey,
            })
          )

    const archivedPrices = await archivePrices({
      interval: params.interval,
      keepPriceId: finalPrice.id,
      planKey: params.planKey,
      prices: [...pricesToArchive, ...lookupKeyPrices],
      productId: params.productId,
      stripe: params.stripe,
      warnings: params.warnings,
    })

    return {
      archivedPrices,
      created: false,
      price: finalPrice,
      reactivated: !exactMatch.active && finalPrice.active,
      reused: true,
    }
  }

  if (!params.allowCreate) {
    addWarning(params.warnings, {
      code: "price_not_created_for_inactive_plan",
      message: `Did not create a new Stripe price for inactive plan ${params.planKey}/${params.interval}`,
      planKey: params.planKey,
    })

    return {
      archivedPrices: [],
      created: false,
      price: null,
      reactivated: false,
      reused: false,
    }
  }

  if (lookupKeyPrices.some((price) => price.active)) {
    addWarning(params.warnings, {
      code: "price_lookup_key_conflict",
      message: `Stripe lookup key ${lookupKey} is currently attached to a mismatched price and will be transferred to the new exact match`,
      planKey: params.planKey,
      stripeObjectId: lookupKeyPrices[0]?.id,
    })
  }

  const createdPrice = await params.stripe.prices.create({
    currency: normalizedCurrency,
    lookup_key: lookupKey,
    metadata: priceMetadata(params.planKey, params.interval),
    nickname: getPriceNickname(params.planKey, params.interval),
    product: params.productId,
    recurring: {
      interval: params.interval,
    },
    transfer_lookup_key: true,
    unit_amount: params.amount,
  })

  const archivedPrices = await archivePrices({
    interval: params.interval,
    keepPriceId: createdPrice.id,
    planKey: params.planKey,
    prices: [...pricesToArchive, ...lookupKeyPrices],
    productId: params.productId,
    stripe: params.stripe,
    warnings: params.warnings,
  })

  return {
    archivedPrices,
    created: true,
    price: createdPrice,
    reactivated: false,
    reused: false,
  }
}

async function syncProductFeatures(params: {
  featureIdByKey: Map<string, string>
  managedFeatureKeys: Set<string>
  plan: BillingCatalogPlan
  productId: string
  stripe: Stripe
  warnings: SyncWarning[]
}) {
  const existingAttachments = await collectList(
    params.stripe.products.listFeatures(params.productId, {
      limit: STRIPE_PAGE_SIZE,
    })
  )
  const createdAttachments: AttachmentSyncSummary[] = []
  const removedAttachments: AttachmentSyncSummary[] = []
  const expectedFeatureIds = new Set<string>()

  for (const feature of params.plan.features) {
    if (!featureAppliesToEntitlement(feature)) {
      continue
    }

    const stripeFeatureId = params.featureIdByKey.get(feature.key)

    if (!stripeFeatureId) {
      addWarning(params.warnings, {
        code: "skipped_attachment_without_feature_id",
        message: `Skipping Stripe product feature attachment for ${params.plan.key}/${feature.key} because no Stripe feature ID was resolved`,
        featureKey: feature.key,
        planKey: params.plan.key,
      })
      continue
    }

    expectedFeatureIds.add(stripeFeatureId)

    const existingAttachment = existingAttachments.find(
      (attachment) => attachment.entitlement_feature.id === stripeFeatureId
    )

    if (existingAttachment) {
      continue
    }

    const createdAttachment = await params.stripe.products.createFeature(
      params.productId,
      {
        entitlement_feature: stripeFeatureId,
      }
    )

    createdAttachments.push({
      attachmentId: createdAttachment.id,
      featureKey: feature.key,
      planKey: params.plan.key,
      stripeFeatureId,
      stripeProductId: params.productId,
    })
  }

  for (const attachment of existingAttachments) {
    const attachedFeature = attachment.entitlement_feature

    if (expectedFeatureIds.has(attachedFeature.id)) {
      continue
    }

    const attachedFeatureKey =
      attachedFeature.lookup_key ||
      getMetadataValue(attachedFeature.metadata, "featureKey") ||
      undefined
    const isManagedAttachment =
      isManagedStripeObject(attachedFeature.metadata) ||
      (attachedFeatureKey !== undefined &&
        params.managedFeatureKeys.has(attachedFeatureKey))

    if (!isManagedAttachment) {
      addWarning(params.warnings, {
        code: "stripe_attachment_not_managed",
        message: `Skipping removal of unmanaged Stripe product feature attachment ${attachment.id} on product ${params.productId}`,
        planKey: params.plan.key,
        stripeObjectId: attachment.id,
      })
      continue
    }

    await params.stripe.products.deleteFeature(params.productId, attachment.id)

    removedAttachments.push({
      attachmentId: attachment.id,
      featureKey: attachedFeatureKey,
      planKey: params.plan.key,
      stripeFeatureId: attachedFeature.id,
      stripeProductId: params.productId,
    })
  }

  return {
    createdAttachments,
    removedAttachments,
  }
}

export const syncCatalogToStripe = internalAction({
  args: {},
  handler: async (ctx): Promise<StripeCatalogSyncResult> => {
    const stripe = getStripe()

    const [features, pricingCatalog]: [BillingFeatureRecord[], BillingCatalogPlan[]] =
      await Promise.all([
        ctx.runQuery(internal.queries.billing.catalog.getBillingFeatures, {}),
        ctx.runQuery(internal.queries.billing.catalog.getPricingCatalog, {}),
      ])

    const [stripeProducts, activeStripeFeatures, archivedStripeFeatures] =
      await Promise.all([
        collectList(
          stripe.products.list({
            limit: STRIPE_PAGE_SIZE,
          })
        ),
        collectList(
          stripe.entitlements.features.list({
            limit: STRIPE_PAGE_SIZE,
          })
        ),
        collectList(
          stripe.entitlements.features.list({
            archived: true,
            limit: STRIPE_PAGE_SIZE,
          })
        ),
      ])

    const stripeFeatureCatalog = dedupeById([
      ...activeStripeFeatures,
      ...archivedStripeFeatures,
    ])
    const featureIdByKey = new Map<string, string>()
    const productIdByPlanKey = new Map<string, string>()
    const freePlansSkipped: string[] = []
    const warnings: SyncWarning[] = []

    const featuresCreated = new Map<string, FeatureSyncSummary>()
    const featuresUpdated = new Map<string, FeatureSyncSummary>()
    const productsCreated = new Map<string, ProductSyncSummary>()
    const productsUpdated = new Map<string, ProductSyncSummary>()
    const pricesCreated = new Map<string, PriceSyncSummary>()
    const pricesReused = new Map<string, PriceSyncSummary>()
    const pricesArchived = new Map<string, PriceSyncSummary>()
    const attachmentsCreated = new Map<string, AttachmentSyncSummary>()
    const attachmentsRemoved = new Map<string, AttachmentSyncSummary>()

    for (const plan of pricingCatalog) {
      for (const missingFeatureKey of plan.missingFeatureKeys) {
        addWarning(warnings, {
          code: "missing_feature_mapping",
          message: `Billing plan ${plan.key} references missing billing feature ${missingFeatureKey}`,
          featureKey: missingFeatureKey,
          planKey: plan.key,
        })
      }

      for (const inactiveFeatureKey of plan.inactiveFeatureKeys) {
        addWarning(warnings, {
          code: "inactive_feature_mapping",
          message: `Billing plan ${plan.key} references inactive billing feature ${inactiveFeatureKey}; it will be omitted from Stripe product marketing_features and entitlements`,
          featureKey: inactiveFeatureKey,
          planKey: plan.key,
        })
      }
    }

    for (const feature of features) {
      const featureResult = await syncStripeFeature({
        feature,
        stripe,
        stripeFeatures: stripeFeatureCatalog,
        warnings,
      })

      if (!featureResult.feature) {
        continue
      }

      featureIdByKey.set(feature.key, featureResult.feature.id)

      await ctx.runMutation(internal.mutations.billing.catalog.updateFeatureStripeId, {
        featureKey: feature.key,
        stripeFeatureId: featureResult.feature.id,
      })

      if (featureResult.created) {
        featuresCreated.set(feature.key, {
          featureKey: feature.key,
          stripeFeatureId: featureResult.feature.id,
        })
        continue
      }

      if (featureResult.updated) {
        recordSummaryEntry(featuresUpdated, feature.key, {
          changes: featureResult.changes,
          featureKey: feature.key,
          matchedBy: featureResult.matchedBy ?? undefined,
          stripeFeatureId: featureResult.feature.id,
        })
      }
    }

    const managedFeatureKeys = new Set(featureIdByKey.keys())

    for (const plan of pricingCatalog) {
      if (plan.planType === "free") {
        freePlansSkipped.push(plan.key)

        if (
          plan.stripeProductId ||
          plan.monthlyPriceId ||
          plan.yearlyPriceId
        ) {
          addWarning(warnings, {
            code: "plan_has_stripe_ids_but_is_free",
            message: `Free billing plan ${plan.key} still has stored Stripe IDs; the sync leaves free plans app-only and will not mutate those Stripe objects`,
            planKey: plan.key,
          })
        }

        continue
      }

      const productResult = await syncStripeProduct({
        plan,
        stripe,
        stripeProducts,
        warnings,
      })

      if (!productResult.product) {
        continue
      }

      productIdByPlanKey.set(plan.key, productResult.product.id)

      if (productResult.created) {
        productsCreated.set(plan.key, {
          planKey: plan.key,
          stripeProductId: productResult.product.id,
        })
      } else if (productResult.updated) {
        recordSummaryEntry(productsUpdated, plan.key, {
          changes: productResult.changes,
          matchedBy: productResult.matchedBy ?? undefined,
          planKey: plan.key,
          stripeProductId: productResult.product.id,
        })
      }

      const monthlyPrice = await ensureRecurringPrice({
        allowCreate: plan.active,
        amount: plan.monthlyPriceAmount,
        currency: plan.currency,
        desiredActive: plan.active,
        existingPriceId: plan.monthlyPriceId,
        interval: "month",
        planKey: plan.key,
        productId: productResult.product.id,
        stripe,
        warnings,
      })

      const yearlyPrice = await ensureRecurringPrice({
        allowCreate: plan.active,
        amount: plan.yearlyPriceAmount,
        currency: plan.currency,
        desiredActive: plan.active,
        existingPriceId: plan.yearlyPriceId,
        interval: "year",
        planKey: plan.key,
        productId: productResult.product.id,
        stripe,
        warnings,
      })

      const normalizedCurrency = normalizeCurrencyCode(plan.currency)

      if (monthlyPrice.price) {
        const monthlySummaryKey = `${plan.key}:month`

        if (monthlyPrice.created) {
          pricesCreated.set(monthlySummaryKey, {
            amount: plan.monthlyPriceAmount,
            currency: normalizedCurrency,
            interval: "month",
            planKey: plan.key,
            stripePriceId: monthlyPrice.price.id,
          })
        } else if (monthlyPrice.reused) {
          pricesReused.set(monthlySummaryKey, {
            amount: plan.monthlyPriceAmount,
            currency: normalizedCurrency,
            interval: "month",
            planKey: plan.key,
            reactivated: monthlyPrice.reactivated || undefined,
            stripePriceId: monthlyPrice.price.id,
          })
        }
      }

      if (yearlyPrice.price) {
        const yearlySummaryKey = `${plan.key}:year`

        if (yearlyPrice.created) {
          pricesCreated.set(yearlySummaryKey, {
            amount: plan.yearlyPriceAmount,
            currency: normalizedCurrency,
            interval: "year",
            planKey: plan.key,
            stripePriceId: yearlyPrice.price.id,
          })
        } else if (yearlyPrice.reused) {
          pricesReused.set(yearlySummaryKey, {
            amount: plan.yearlyPriceAmount,
            currency: normalizedCurrency,
            interval: "year",
            planKey: plan.key,
            reactivated: yearlyPrice.reactivated || undefined,
            stripePriceId: yearlyPrice.price.id,
          })
        }
      }

      for (const archivedPrice of [
        ...monthlyPrice.archivedPrices,
        ...yearlyPrice.archivedPrices,
      ]) {
        const archivedInterval =
          archivedPrice.recurring?.interval === "year" ? "year" : "month"

        pricesArchived.set(`${plan.key}:${archivedPrice.id}`, {
          amount: archivedPrice.unit_amount ?? 0,
          currency: archivedPrice.currency,
          interval: archivedInterval,
          planKey: plan.key,
          stripePriceId: archivedPrice.id,
        })
      }

      if (plan.active && monthlyPrice.price) {
        const currentDefaultPriceId = getDefaultPriceId(productResult.product)

        if (currentDefaultPriceId !== monthlyPrice.price.id) {
          const updatedProduct = await stripe.products.update(productResult.product.id, {
            default_price: monthlyPrice.price.id,
          })

          upsertItemById(stripeProducts, updatedProduct)

          if (!productsCreated.has(plan.key)) {
            recordSummaryEntry(productsUpdated, plan.key, {
              changes: ["default_price"],
              matchedBy: productResult.matchedBy ?? undefined,
              planKey: plan.key,
              stripeProductId: updatedProduct.id,
            })
          }
        }
      }

      await ctx.runMutation(internal.mutations.billing.catalog.updatePlanStripeIds, {
        monthlyPriceId: monthlyPrice.price?.id,
        planKey: plan.key,
        stripeProductId: productResult.product.id,
        yearlyPriceId: yearlyPrice.price?.id,
      })
    }

    for (const plan of pricingCatalog) {
      if (plan.planType === "free") {
        continue
      }

      const productId = productIdByPlanKey.get(plan.key)

      if (!productId) {
        continue
      }

      const attachmentResult = await syncProductFeatures({
        featureIdByKey,
        managedFeatureKeys,
        plan,
        productId,
        stripe,
        warnings,
      })

      for (const createdAttachment of attachmentResult.createdAttachments) {
        attachmentsCreated.set(
          `${createdAttachment.planKey}:${createdAttachment.attachmentId}`,
          createdAttachment
        )
      }

      for (const removedAttachment of attachmentResult.removedAttachments) {
        attachmentsRemoved.set(
          `${removedAttachment.planKey}:${removedAttachment.attachmentId}`,
          removedAttachment
        )
      }
    }

    return {
      ok: true,
      syncedAt: Date.now(),
      featuresProcessed: features.length,
      plansProcessed: pricingCatalog.length,
      paidPlansProcessed: pricingCatalog.filter((plan) => plan.planType === "paid")
        .length,
      freePlansSkipped,
      featuresCreated: Array.from(featuresCreated.values()),
      featuresUpdated: Array.from(featuresUpdated.values()),
      productsCreated: Array.from(productsCreated.values()),
      productsUpdated: Array.from(productsUpdated.values()),
      pricesCreated: Array.from(pricesCreated.values()),
      pricesReused: Array.from(pricesReused.values()),
      pricesArchived: Array.from(pricesArchived.values()),
      attachmentsCreated: Array.from(attachmentsCreated.values()),
      attachmentsRemoved: Array.from(attachmentsRemoved.values()),
      warnings,
    }
  },
})
