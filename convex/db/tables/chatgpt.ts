import { defineTable } from "convex/server";
import { v } from "convex/values";

export const chatgptAppConnections = defineTable({
  userId: v.id("users"),

  status: v.union(v.literal("active"), v.literal("revoked")),

  scopes: v.array(v.string()),

  linkedAt: v.number(),

  revokedAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_userId", ["userId"]);
