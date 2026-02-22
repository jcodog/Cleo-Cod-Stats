import { defineTable } from "convex/server";
import { v } from "convex/values";

export const chatgptAppConnections = defineTable({
  userId: v.string(),

  scopes: v.array(v.string()),

  accessTokenEnc: v.optional(v.string()),
  refreshTokenEnc: v.optional(v.string()),
  expiresAt: v.optional(v.number()),

  revokedAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_userId", ["userId"]);
