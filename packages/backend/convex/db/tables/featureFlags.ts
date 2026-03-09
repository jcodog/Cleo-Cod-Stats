import { defineTable } from "convex/server"
import { v } from "convex/values"

export const featureFlags = defineTable({
  key: v.string(),
  enabled: v.boolean(),
  rolloutPercent: v.number(),
  premiumBypass: v.boolean(),
  creatorBypass: v.boolean(),
  adminBypass: v.boolean(),
  staffBypass: v.boolean(),
  allowlistUserIds: v.array(v.string()),
  syncedFrom: v.string(),
  syncedAt: v.number(),
}).index("by_key", ["key"])
