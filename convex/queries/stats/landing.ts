import type { UserIdentity } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../../_generated/dataModel";
import { query, type QueryCtx } from "../../_generated/server";

type AggregatedSessionStats = {
  matchesIndexed: number;
  sessionsTracked: number;
  activeSessions: number;
  wins: number;
  losses: number;
};

type SessionDoc = Doc<"sessions">;

function aggregateSessionStats(
  sessions: Array<{
    wins: number;
    losses: number;
    endedAt: number | null;
  }>,
): AggregatedSessionStats {
  return sessions.reduce<AggregatedSessionStats>(
    (acc, session) => {
      const matches = session.wins + session.losses;
      return {
        matchesIndexed: acc.matchesIndexed + matches,
        sessionsTracked: acc.sessionsTracked + 1,
        activeSessions: acc.activeSessions + (session.endedAt === null ? 1 : 0),
        wins: acc.wins + session.wins,
        losses: acc.losses + session.losses,
      };
    },
    {
      matchesIndexed: 0,
      sessionsTracked: 0,
      activeSessions: 0,
      wins: 0,
      losses: 0,
    },
  );
}

function toWinRate(wins: number, losses: number) {
  const totalGames = wins + losses;
  if (totalGames === 0) return 0;
  return (wins / totalGames) * 100;
}

function addCandidate(candidates: Set<string>, value: string | null | undefined) {
  if (!value) {
    return;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length > 0) {
    candidates.add(trimmedValue);
  }
}

function getUserIdCandidates(
  userId: string | undefined,
  identity: UserIdentity | null,
) {
  const candidates = new Set<string>();

  addCandidate(candidates, userId);
  addCandidate(candidates, identity?.subject);
  addCandidate(candidates, identity?.tokenIdentifier);

  if (identity?.tokenIdentifier.includes("|")) {
    const tokenParts = identity.tokenIdentifier.split("|");
    addCandidate(candidates, tokenParts[tokenParts.length - 1]);
  }

  return Array.from(candidates);
}

async function getSessionsForCandidates(
  ctx: QueryCtx,
  userIdCandidates: string[],
) {
  if (userIdCandidates.length === 0) {
    return [] as SessionDoc[];
  }

  const groupedSessions = await Promise.all(
    userIdCandidates.map((candidate) =>
      ctx.db
        .query("sessions")
        .withIndex("by_user", (q) => q.eq("userId", candidate))
        .collect(),
    ),
  );

  const dedupedById = new Map<string, SessionDoc>();
  for (const sessions of groupedSessions) {
    for (const session of sessions) {
      dedupedById.set(session._id, session);
    }
  }

  return Array.from(dedupedById.values());
}

export const getLandingMetrics = query({
  args: {
    userId: v.optional(v.string()),
  },
  handler: async (ctx, { userId }) => {
    const identity = await ctx.auth.getUserIdentity();
    const userIdCandidates = getUserIdCandidates(userId, identity);

    const globalSessionsPromise = ctx.db.query("sessions").collect();
    const latestGlobalGamePromise = ctx.db
      .query("games")
      .withIndex("by_createdat")
      .order("desc")
      .first();

    const userSessionsPromise = getSessionsForCandidates(ctx, userIdCandidates);

    const [globalSessions, latestGlobalGame, userSessions] =
      await Promise.all([
        globalSessionsPromise,
        latestGlobalGamePromise,
        userSessionsPromise,
      ]);

    const global = aggregateSessionStats(globalSessions);

    let globalMatchesIndexed = global.matchesIndexed;
    if (globalMatchesIndexed === 0 && global.sessionsTracked > 0) {
      const globalGames = await ctx.db.query("games").collect();
      globalMatchesIndexed = globalGames.length;
    }

    const personalAggregated =
      userSessions.length > 0 ? aggregateSessionStats(userSessions) : null;

    const latestUserGames = personalAggregated
      ? await Promise.all(
          userSessions.map((session) =>
            ctx.db
              .query("games")
              .withIndex("by_session_createdat", (q) => q.eq("sessionId", session.uuid))
              .order("desc")
              .first(),
          ),
        )
      : [];

    const latestUserGame = latestUserGames.reduce<Doc<"games"> | null>(
      (latest, game) => {
        if (!game) {
          return latest;
        }

        if (!latest || game.createdAt > latest.createdAt) {
          return game;
        }

        return latest;
      },
      null,
    );

    let personalMatchesIndexed = personalAggregated?.matchesIndexed ?? 0;
    if (
      personalAggregated &&
      personalMatchesIndexed === 0 &&
      personalAggregated.sessionsTracked > 0
    ) {
      const gamesBySession = await Promise.all(
        userSessions.map((session) =>
          ctx.db
            .query("games")
            .withIndex("by_session", (q) => q.eq("sessionId", session.uuid))
            .collect(),
        ),
      );

      personalMatchesIndexed = gamesBySession.reduce(
        (total, games) => total + games.length,
        0,
      );
    }

    const personal = personalAggregated
      ? {
          ...personalAggregated,
          matchesIndexed: personalMatchesIndexed,
          latestIngestedAt: latestUserGame?.createdAt ?? null,
          winRate: toWinRate(personalAggregated.wins, personalAggregated.losses),
        }
      : null;

    return {
      global: {
        matchesIndexed: globalMatchesIndexed,
        sessionsTracked: global.sessionsTracked,
        activeSessions: global.activeSessions,
        latestIngestedAt: latestGlobalGame?.createdAt ?? null,
        winRate: toWinRate(global.wins, global.losses),
      },
      personal,
    };
  },
});
