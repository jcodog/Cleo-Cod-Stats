import { query } from "../../_generated/server";
import { v } from "convex/values";

export const getGamesForSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, { sessionId }) => {
    return await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();
  },
});

export const getSessionGamesWindow = query({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    limit: v.number(),
    filter: v.union(
      v.literal("all"),
      v.literal("wins"),
      v.literal("losses"),
      v.literal("no_loss_protection"),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  },
  handler: async (ctx, { sessionId, userId, limit, filter, from, to }) => {
    const maxLimit = 500;
    const appliedLimit = Math.max(1, Math.min(limit, maxLimit));
    const fromMs = from ?? 0;
    const toMs = to ?? Number.MAX_SAFE_INTEGER;

    const games = await ctx.db
      .query("games")
      .withIndex("by_session_createdat", (q) =>
        q.eq("sessionId", sessionId).gte("createdAt", fromMs).lte("createdAt", toMs),
      )
      .order("desc")
      .take(appliedLimit);

    return games
      .filter((game) => game.userId === userId)
      .filter((game) => {
        if (filter === "wins") return game.outcome === "win";
        if (filter === "losses") return game.outcome === "loss";
        if (filter === "no_loss_protection") return game.lossProtected !== true;
        return true;
      })
      .map((game) => ({
        sessionId: game.sessionId,
        createdAt: game.createdAt,
        mode: game.mode,
        outcome: game.outcome,
        srChange: game.srChange,
        lossProtected: game.lossProtected,
        kills: game.kills,
        deaths: game.deaths,
        teamScore: game.teamScore,
        enemyScore: game.enemyScore,
        hillTimeSeconds: game.hillTimeSeconds,
        plants: game.plants,
        defuses: game.defuses,
        overloads: game.overloads,
      }));
  },
});
