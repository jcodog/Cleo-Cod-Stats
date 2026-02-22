import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type LandingCounters = {
  matchesIndexed: number;
  sessionsTracked: number;
  activeSessions: number;
  wins: number;
  losses: number;
};

export type LandingStatsDelta = Partial<LandingCounters>;

export const EMPTY_LANDING_COUNTERS: LandingCounters = {
  matchesIndexed: 0,
  sessionsTracked: 0,
  activeSessions: 0,
  wins: 0,
  losses: 0,
};

const GLOBAL_STATS_KEY = "global";

type LandingGlobalStatsDoc = Doc<"landingGlobalStats">;
type LandingUserStatsDoc = Doc<"landingUserStats">;
type LandingStatsDoc = LandingGlobalStatsDoc | LandingUserStatsDoc;

function hasAnyDelta(delta: LandingStatsDelta) {
  return Object.values(delta).some((value) => (value ?? 0) !== 0);
}

function clampCounter(value: number) {
  return value < 0 ? 0 : value;
}

function countersFromDoc(doc: LandingStatsDoc): LandingCounters {
  return {
    matchesIndexed: doc.matchesIndexed,
    sessionsTracked: doc.sessionsTracked,
    activeSessions: doc.activeSessions,
    wins: doc.wins,
    losses: doc.losses,
  };
}

function applyDelta(
  counters: LandingCounters,
  delta: LandingStatsDelta,
): LandingCounters {
  return {
    matchesIndexed: clampCounter(
      counters.matchesIndexed + (delta.matchesIndexed ?? 0),
    ),
    sessionsTracked: clampCounter(
      counters.sessionsTracked + (delta.sessionsTracked ?? 0),
    ),
    activeSessions: clampCounter(
      counters.activeSessions + (delta.activeSessions ?? 0),
    ),
    wins: clampCounter(counters.wins + (delta.wins ?? 0)),
    losses: clampCounter(counters.losses + (delta.losses ?? 0)),
  };
}

function sumCounters(counters: LandingCounters[]): LandingCounters {
  return counters.reduce<LandingCounters>(
    (acc, current) => ({
      matchesIndexed: acc.matchesIndexed + current.matchesIndexed,
      sessionsTracked: acc.sessionsTracked + current.sessionsTracked,
      activeSessions: acc.activeSessions + current.activeSessions,
      wins: acc.wins + current.wins,
      losses: acc.losses + current.losses,
    }),
    EMPTY_LANDING_COUNTERS,
  );
}

function sumCounterDocs(docs: LandingStatsDoc[]) {
  return sumCounters(docs.map(countersFromDoc));
}

async function getOrCreateGlobalStatsDoc(
  ctx: MutationCtx,
): Promise<LandingGlobalStatsDoc> {
  const existing = await ctx.db
    .query("landingGlobalStats")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_STATS_KEY))
    .first();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const createdId = await ctx.db.insert("landingGlobalStats", {
    key: "global",
    ...EMPTY_LANDING_COUNTERS,
    updatedAt: now,
  });

  const created = await ctx.db.get(createdId);
  if (!created) {
    throw new Error("Failed to initialize global landing stats");
  }

  return created;
}

async function getOrCreateUserStatsDoc(
  ctx: MutationCtx,
  userId: string,
): Promise<LandingUserStatsDoc> {
  const existing = await ctx.db
    .query("landingUserStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();

  if (existing) {
    return existing;
  }

  const now = Date.now();
  const createdId = await ctx.db.insert("landingUserStats", {
    userId,
    ...EMPTY_LANDING_COUNTERS,
    updatedAt: now,
  });

  const created = await ctx.db.get(createdId);
  if (!created) {
    throw new Error("Failed to initialize user landing stats");
  }

  return created;
}

export async function applyGlobalLandingStatsDelta(
  ctx: MutationCtx,
  delta: LandingStatsDelta,
) {
  if (!hasAnyDelta(delta)) {
    return;
  }

  const globalStats = await getOrCreateGlobalStatsDoc(ctx);
  const nextCounters = applyDelta(countersFromDoc(globalStats), delta);
  await ctx.db.patch(globalStats._id, {
    ...nextCounters,
    updatedAt: Date.now(),
  });
}

export async function applyUserLandingStatsDelta(
  ctx: MutationCtx,
  userId: string,
  delta: LandingStatsDelta,
) {
  if (!hasAnyDelta(delta)) {
    return;
  }

  const userStats = await getOrCreateUserStatsDoc(ctx, userId);
  const nextCounters = applyDelta(countersFromDoc(userStats), delta);
  await ctx.db.patch(userStats._id, {
    ...nextCounters,
    updatedAt: Date.now(),
  });
}

export async function getGlobalLandingCounters(
  ctx: QueryCtx,
): Promise<LandingCounters> {
  const globalStatsDocs = await ctx.db
    .query("landingGlobalStats")
    .withIndex("by_key", (q) => q.eq("key", GLOBAL_STATS_KEY))
    .collect();

  if (globalStatsDocs.length === 0) {
    return EMPTY_LANDING_COUNTERS;
  }

  return sumCounterDocs(globalStatsDocs);
}

export async function getUserLandingCounters(
  ctx: QueryCtx,
  userIdCandidates: string[],
): Promise<LandingCounters | null> {
  if (userIdCandidates.length === 0) {
    return null;
  }

  const groupedStats = await Promise.all(
    Array.from(new Set(userIdCandidates)).map((candidate) =>
      ctx.db
        .query("landingUserStats")
        .withIndex("by_userId", (q) => q.eq("userId", candidate))
        .collect(),
    ),
  );

  const dedupedStats = new Map<string, LandingUserStatsDoc>();
  for (const statsGroup of groupedStats) {
    for (const statsDoc of statsGroup) {
      dedupedStats.set(statsDoc._id, statsDoc);
    }
  }

  if (dedupedStats.size === 0) {
    return null;
  }

  return sumCounterDocs(Array.from(dedupedStats.values()));
}

export function toWinRate(wins: number, losses: number) {
  const totalGames = wins + losses;
  if (totalGames === 0) {
    return 0;
  }

  return (wins / totalGames) * 100;
}
