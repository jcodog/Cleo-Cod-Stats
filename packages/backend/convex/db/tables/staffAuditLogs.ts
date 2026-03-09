import { defineTable } from "convex/server"
import { v } from "convex/values"

export const staffAuditLogs = defineTable({
  action: v.string(),
  actorClerkUserId: v.string(),
  actorName: v.string(),
  actorRole: v.union(
    v.literal("user"),
    v.literal("staff"),
    v.literal("admin"),
    v.literal("super_admin")
  ),
  createdAt: v.number(),
  details: v.optional(v.string()),
  entityId: v.string(),
  entityLabel: v.optional(v.string()),
  entityType: v.string(),
  result: v.union(v.literal("success"), v.literal("warning"), v.literal("error")),
  summary: v.string(),
})
  .index("by_actorClerkUserId", ["actorClerkUserId"])
  .index("by_createdAt", ["createdAt"])
  .index("by_entityType", ["entityType"])
  .index("by_entityType_createdAt", ["entityType", "createdAt"])
  .index("by_entityType_entityId", ["entityType", "entityId"])
