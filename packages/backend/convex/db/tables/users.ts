import { defineTable } from "convex/server"
import { v } from "convex/values"

export const users = defineTable({
  discordId: v.string(),
  clerkUserId: v.string(),

  name: v.string(),
  plan: v.union(v.literal("free"), v.literal("premium"), v.literal("creator")),
  status: v.union(v.literal("active"), v.literal("disabled")),

  role: v.optional(
    v.union(v.literal("user"), v.literal("admin"), v.literal("staff"))
  ),

  cleoDashLinked: v.boolean(),

  chatgptLinked: v.boolean(),
  chatgptLinkedAt: v.optional(v.number()),
  chatgptRevokedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_discordId", ["discordId"])
  .index("by_clerkUserId", ["clerkUserId"])
