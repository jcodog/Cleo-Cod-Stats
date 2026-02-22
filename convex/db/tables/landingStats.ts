import { defineTable } from "convex/server";
import { v } from "convex/values";

const landingStatsFields = {
  sessionsTracked: v.number(),
  activeSessions: v.number(),
  wins: v.number(),
  losses: v.number(),
  matchesIndexed: v.number(),
  updatedAt: v.number(),
};

export const landingGlobalStats = defineTable({
  key: v.literal("global"),
  ...landingStatsFields,
}).index("by_key", ["key"]);

export const landingUserStats = defineTable({
  userId: v.string(),
  ...landingStatsFields,
}).index("by_userId", ["userId"]);
