import { query } from "../../_generated/server";
import { v } from "convex/values";

export const getSessionForUser = query({
  args: {
    userId: v.string(),
    codTitle: v.string(),
    codSeason: v.number(),
  },
  handler: async (ctx, { userId, codTitle, codSeason }) => {
    const activeSession = await ctx.db
      .query("sessions")
      .withIndex("by_user_cod_season", (q) =>
        q.eq("userId", userId).eq("codTitle", codTitle).eq("season", codSeason),
      )
      .order("desc")
      .filter((q) => q.eq(q.field("endedAt"), null))
      .first();

    return activeSession ?? null;
  },
});

export const getSessionsForUser = query({
  args: {
    userId: v.string(),
    codTitle: v.string(),
    codSeason: v.number(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, codTitle, codSeason, limit }) => {
    const maxLimit = 200;
    const appliedLimit = Math.max(1, Math.min(limit ?? 20, maxLimit));

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user_cod_season", (q) =>
        q.eq("userId", userId).eq("codTitle", codTitle).eq("season", codSeason),
      )
      .order("desc")
      .take(appliedLimit);

    return sessions
      .map((session) => ({
        uuid: session.uuid,
        codTitle: session.codTitle,
        season: session.season,
        wins: session.wins,
        losses: session.losses,
        kills: session.kills,
        deaths: session.deaths,
        startSr: session.startSr,
        currentSr: session.currentSr,
        streak: session.streak,
        bestStreak: session.bestStreak,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      }));
  },
});

export const getSessionAggregatedStats = query({
  args: {
    sessionId: v.string(),
    includeLossProtected: v.boolean(),
  },
  handler: async (ctx, { sessionId, includeLossProtected }) => {
    console.log("[Session View] Aggregating session stats.");
    const games = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    games.sort((a, b) => (a.createdAt as number) - (b.createdAt as number));

    const filteredGames = includeLossProtected
      ? games
      : games.filter((g) => g.lossProtected !== true);

    const sum = (nums: number[]) => nums.reduce((acc, n) => acc + n, 0);

    const srChangesAll = filteredGames.map((g) => g.srChange as number);

    const buildAgg = (subset: typeof filteredGames) => {
      const srChanges = subset.map((g) => g.srChange as number);
      const wins = subset.filter((g) => g.outcome === "win").length;
      const losses = subset.filter((g) => g.outcome === "loss").length;
      const kills = sum(subset.map((g) => g.kills as number));
      const deaths = sum(subset.map((g) => g.deaths as number));

      const hillTimes = subset.map((g) => g.hillTimeSeconds ?? 0);
      const plants = subset.map((g) => g.plants ?? 0);
      const defuses = subset.map((g) => g.defuses ?? 0);
      const overloads = subset.map((g) => g.overloads ?? 0);

      return {
        games: subset.length,
        wins,
        losses,
        kills,
        deaths,
        srChanges,

        hillTimeTotalSeconds: sum(hillTimes),
        hillTimeMaxSeconds: hillTimes.length ? Math.max(...hillTimes) : 0,

        plantsTotal: sum(plants),
        plantsMax: plants.length ? Math.max(...plants) : 0,

        defusesTotal: sum(defuses),
        defusesMax: defuses.length ? Math.max(...defuses) : 0,

        overloadsTotal: sum(overloads),
        overloadsMax: overloads.length ? Math.max(...overloads) : 0,
      };
    };

    const totals = buildAgg(filteredGames);
    const modeKeys = ["hardpoint", "snd", "overload"] as const;
    type ModeAggregate = ReturnType<typeof buildAgg>;

    const modes: Partial<Record<(typeof modeKeys)[number], ModeAggregate>> = {};
    for (const mode of modeKeys) {
      const modeGames = filteredGames.filter((g) => g.mode === mode);
      modes[mode] = buildAgg(modeGames);
    }

    console.log("[Session View] Aggregated session stats, sent to user.");

    return {
      totalSrChanges: srChangesAll,
      totals,
      modes: modes as Record<(typeof modeKeys)[number], ModeAggregate>,
    };
  },
});
