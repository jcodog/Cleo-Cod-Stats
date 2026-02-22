import { defineTable } from "convex/server";
import { v } from "convex/values";

export const games = defineTable({
  sessionId: v.string(), // session uuid reference
  userId: v.string(),
  mode: v.union(
    v.literal("hardpoint"),
    v.literal("snd"),
    v.literal("overload"),
  ),
  outcome: v.union(v.literal("win"), v.literal("loss")),
  kills: v.number(),
  deaths: v.number(),
  srChange: v.number(),
  lossProtected: v.boolean(),
  teamScore: v.optional(v.union(v.null(), v.number())),
  enemyScore: v.optional(v.union(v.null(), v.number())),
  hillTimeSeconds: v.optional(v.union(v.null(), v.number())),
  plants: v.optional(v.union(v.null(), v.number())),
  defuses: v.optional(v.union(v.null(), v.number())),
  overloads: v.optional(v.union(v.null(), v.number())),
  createdAt: v.number(),
})
  .index("by_session", ["sessionId"])
  .index("by_session_createdat", ["sessionId", "createdAt"])
  .index("by_user_createdat", ["userId", "createdAt"])
  .index("by_createdat", ["createdAt"]);
