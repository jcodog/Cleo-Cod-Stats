import { v } from "convex/values";

import type { Id } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";

const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const MAX_RECENT_GAMES = 50;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function roundRatio(value: number | null) {
  if (value === null) {
    return null;
  }

  return Math.round(value * 10_000) / 10_000;
}

function parseIsoDateWindow(date: string) {
  if (!ISO_DATE_PATTERN.test(date)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = date.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }

  const windowStartMs = Date.UTC(year, month - 1, day);
  const normalized = new Date(windowStartMs);

  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() + 1 !== month ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    windowStartMs,
    windowEndMs: windowStartMs + DAY_IN_MS,
  };
}

async function getUserBySub(ctx: QueryCtx, sub: string) {
  const userByClerkUserId = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", sub))
    .unique();

  if (userByClerkUserId) {
    return userByClerkUserId;
  }

  try {
    return await ctx.db.get(sub as Id<"users">);
  } catch {
    return null;
  }
}

function aggregateGames(
  games: Array<{
    outcome: "win" | "loss";
    kills: number;
    deaths: number;
    srChange: number;
  }>,
) {
  const totalMatches = games.length;
  const wins = games.filter((game) => game.outcome === "win").length;
  const losses = totalMatches - wins;
  const kills = games.reduce((total, game) => total + game.kills, 0);
  const deaths = games.reduce((total, game) => total + game.deaths, 0);
  const totalSrChange = games.reduce((total, game) => total + game.srChange, 0);

  return {
    totalMatches,
    wins,
    losses,
    kills,
    deaths,
    totalSrChange,
    winRate: roundRatio(totalMatches > 0 ? wins / totalMatches : null),
    kdRatio: roundRatio(deaths > 0 ? kills / deaths : null),
  };
}

export const getUserByOAuthSubject = query({
  args: {
    sub: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedSub = args.sub.trim();
    if (normalizedSub.length === 0) {
      return null;
    }

    const user = await getUserBySub(ctx, normalizedSub);
    if (!user) {
      return null;
    }

    const connection = await ctx.db
      .query("chatgptAppConnections")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();

    return {
      _id: user._id,
      clerkUserId: user.clerkUserId,
      discordId: user.discordId,
      name: user.name,
      plan: user.plan,
      status: user.status,
      chatgptLinked: user.chatgptLinked,
      chatgptLinkedAt: user.chatgptLinkedAt,
      chatgptRevokedAt: user.chatgptRevokedAt,
      connectionStatus: connection?.status ?? null,
      connectionScopes: connection?.scopes ?? [],
      connectionLinkedAt: connection?.linkedAt ?? null,
      connectionRevokedAt: connection?.revokedAt ?? null,
      connectionLastUsedAt: connection?.lastUsedAt ?? null,
    };
  },
});

export const getStatsSummaryByDiscordId = query({
  args: {
    discordId: v.string(),
  },
  handler: async (ctx, args) => {
    const discordId = args.discordId.trim();
    if (discordId.length === 0) {
      throw new Error("invalid_discord_id");
    }

    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", discordId))
      .collect();

    const latestSession = sessions.reduce<
      (typeof sessions)[number] | null
    >((currentLatest, session) => {
      if (!currentLatest) {
        return session;
      }

      return session.startedAt > currentLatest.startedAt ? session : currentLatest;
    }, null);

    const latestGame = await ctx.db
      .query("games")
      .withIndex("by_user_createdat", (q) => q.eq("userId", discordId))
      .order("desc")
      .first();

    const sessionsTracked = sessions.length;
    const activeSessions = sessions.filter((session) => session.endedAt === null).length;
    const wins = sessions.reduce((total, session) => total + session.wins, 0);
    const losses = sessions.reduce((total, session) => total + session.losses, 0);
    const totalMatches = wins + losses;
    const kills = sessions.reduce((total, session) => total + session.kills, 0);
    const deaths = sessions.reduce((total, session) => total + session.deaths, 0);
    const totalSrChange = sessions.reduce(
      (total, session) => total + (session.currentSr - session.startSr),
      0,
    );
    const bestStreak = sessions.reduce(
      (currentBest, session) => Math.max(currentBest, session.bestStreak),
      0,
    );

    return {
      discordId,
      sessionsTracked,
      activeSessions,
      totalMatches,
      wins,
      losses,
      kills,
      deaths,
      totalSrChange,
      winRate: roundRatio(totalMatches > 0 ? wins / totalMatches : null),
      kdRatio: roundRatio(deaths > 0 ? kills / deaths : null),
      bestStreak,
      currentSr: latestSession?.currentSr ?? null,
      lastSessionStartedAt: latestSession?.startedAt ?? null,
      lastSessionEndedAt: latestSession?.endedAt ?? null,
      lastSessionUuid: latestSession?.uuid ?? null,
      lastMatchAt: latestGame?.createdAt ?? null,
    };
  },
});

export const getDailyStatsByDiscordId = query({
  args: {
    discordId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const discordId = args.discordId.trim();
    if (discordId.length === 0) {
      throw new Error("invalid_discord_id");
    }

    const window = parseIsoDateWindow(args.date);
    if (!window) {
      throw new Error("invalid_date");
    }

    const games = await ctx.db
      .query("games")
      .withIndex("by_user_createdat", (q) =>
        q
          .eq("userId", discordId)
          .gte("createdAt", window.windowStartMs)
          .lte("createdAt", window.windowEndMs - 1),
      )
      .collect();

    games.sort((left, right) => left.createdAt - right.createdAt);

    return {
      discordId,
      date: args.date,
      windowStartMs: window.windowStartMs,
      windowEndMs: window.windowEndMs,
      ...aggregateGames(games),
      games: games.map((game) => ({
        sessionId: game.sessionId,
        createdAt: game.createdAt,
        mode: game.mode,
        outcome: game.outcome,
        srChange: game.srChange,
        kills: game.kills,
        deaths: game.deaths,
        lossProtected: game.lossProtected,
        teamScore: game.teamScore ?? null,
        enemyScore: game.enemyScore ?? null,
        hillTimeSeconds: game.hillTimeSeconds ?? null,
        plants: game.plants ?? null,
        defuses: game.defuses ?? null,
        overloads: game.overloads ?? null,
      })),
    };
  },
});

export const getRecentStatsByDiscordId = query({
  args: {
    discordId: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const discordId = args.discordId.trim();
    if (discordId.length === 0) {
      throw new Error("invalid_discord_id");
    }

    const appliedLimit = Math.max(1, Math.min(args.limit, MAX_RECENT_GAMES));

    const games = await ctx.db
      .query("games")
      .withIndex("by_user_createdat", (q) => q.eq("userId", discordId))
      .order("desc")
      .take(appliedLimit);

    return {
      discordId,
      limit: appliedLimit,
      ...aggregateGames(games),
      games: games.map((game) => ({
        sessionId: game.sessionId,
        createdAt: game.createdAt,
        mode: game.mode,
        outcome: game.outcome,
        srChange: game.srChange,
        kills: game.kills,
        deaths: game.deaths,
        lossProtected: game.lossProtected,
        teamScore: game.teamScore ?? null,
        enemyScore: game.enemyScore ?? null,
        hillTimeSeconds: game.hillTimeSeconds ?? null,
        plants: game.plants ?? null,
        defuses: game.defuses ?? null,
        overloads: game.overloads ?? null,
      })),
    };
  },
});
