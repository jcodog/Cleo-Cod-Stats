import { z } from "zod"

const catalogKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-_]*$/)

const textSchema = z.string().trim().min(1).max(120)

export const managementActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("updateUserRole"),
    input: z.object({
      nextRole: z.enum(["user", "staff", "admin"]),
      targetClerkUserId: z.string().min(1),
    }),
  }),
])

export const billingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("archiveFeature"),
    input: z.object({
      confirmationToken: z.string().min(1),
      featureKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("archivePlan"),
    input: z.object({
      cancelAtPeriodEnd: z.boolean(),
      confirmationToken: z.string().min(1),
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("previewFeatureArchive"),
    input: z.object({
      featureKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("previewFeatureAssignmentChange"),
    input: z.object({
      enabled: z.boolean(),
      featureKey: catalogKeySchema,
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("previewFeatureAssignmentSync"),
    input: z.object({
      featureKey: catalogKeySchema,
      planKeys: z.array(catalogKeySchema),
    }),
  }),
  z.object({
    action: z.literal("previewPlanArchive"),
    input: z.object({
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("previewPlanFeatureSync"),
    input: z.object({
      featureKeys: z.array(catalogKeySchema),
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("previewPriceReplacement"),
    input: z.object({
      interval: z.enum(["month", "year"]),
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("replacePlanPrice"),
    input: z.object({
      amount: z.number().int().nonnegative(),
      confirmationToken: z.string().min(1),
      interval: z.enum(["month", "year"]),
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("runCatalogSync"),
    input: z.object({}).optional().default({}),
  }),
  z.object({
    action: z.literal("syncFeatureAssignments"),
    input: z.object({
      featureKey: catalogKeySchema,
      planKeys: z.array(catalogKeySchema),
    }),
  }),
  z.object({
    action: z.literal("setFeatureAssignment"),
    input: z.object({
      enabled: z.boolean(),
      featureKey: catalogKeySchema,
      planKey: catalogKeySchema,
    }),
  }),
  z.object({
    action: z.literal("upsertFeature"),
    input: z.object({
      active: z.boolean(),
      appliesTo: z.enum(["entitlement", "marketing", "both"]),
      category: z.string().trim().max(80).optional(),
      description: z.string().trim().max(320),
      key: catalogKeySchema,
      name: textSchema,
      sortOrder: z.number().int(),
    }),
  }),
  z.object({
    action: z.literal("upsertPlan"),
    input: z.object({
      active: z.boolean(),
      currency: z.string().trim().length(3),
      description: z.string().trim().max(320),
      featureKeys: z.array(catalogKeySchema),
      key: catalogKeySchema,
      monthlyPriceAmount: z.number().int().nonnegative(),
      name: textSchema,
      planType: z.enum(["free", "paid"]),
      sortOrder: z.number().int(),
      yearlyPriceAmount: z.number().int().nonnegative(),
    }),
  }),
])

export type BillingActionRequest = z.infer<typeof billingActionSchema>
export type ManagementActionRequest = z.infer<typeof managementActionSchema>
