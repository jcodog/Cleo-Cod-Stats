import { defineTable } from "convex/server";
import { v } from "convex/values";

export const sessions = defineTable({
  uuid: v.string(),
  userId: v.string(),
  codTitle: v.string(),
  season: v.number(),
  wins: v.number(),
  losses: v.number(),
  kills: v.number(),
  deaths: v.number(),
  startSr: v.number(),
  currentSr: v.number(),
  streak: v.number(),
  bestStreak: v.number(),
  startedAt: v.number(),
  endedAt: v.union(v.null(), v.number()), // null if session is active
})
  .index("by_user", ["userId"])
  .index("by_user_cod_season", ["userId", "codTitle", "season"]) // group sessions by user & game title & season
  .index("by_uuid", ["uuid"]);
