type RankDivision = {
  rank: string;
  division: string | null;
  minSr: number;
  maxSr: number | null;
  index: number;
};

type RankProgressTier = {
  rank: string;
  division: string | null;
  displayName: string;
  minSr: number;
  maxSr: number | null;
};

type RankProgressTarget = RankProgressTier & {
  srNeeded: number;
};

export type RankLadder = {
  title: string;
  ruleset: string;
  divisions: readonly RankDivision[];
  updatedAt: number;
};

export type RankProgress = {
  title: string;
  ruleset: string;
  currentSr: number;
  current: RankProgressTier;
  next: RankProgressTier | null;
  srToNextTier: number | null;
  nextDivision: RankProgressTarget | null;
  nextRank: RankProgressTarget | null;
};

const LADDER_UPDATED_AT = Date.UTC(2026, 1, 1);

const CODSTATS_SR_LADDER: readonly RankDivision[] = [
  { rank: "Bronze", division: "I", minSr: 0, maxSr: 299, index: 0 },
  { rank: "Bronze", division: "II", minSr: 300, maxSr: 599, index: 1 },
  { rank: "Bronze", division: "III", minSr: 600, maxSr: 899, index: 2 },
  { rank: "Silver", division: "I", minSr: 900, maxSr: 1299, index: 3 },
  { rank: "Silver", division: "II", minSr: 1300, maxSr: 1699, index: 4 },
  { rank: "Silver", division: "III", minSr: 1700, maxSr: 2099, index: 5 },
  { rank: "Gold", division: "I", minSr: 2100, maxSr: 2599, index: 6 },
  { rank: "Gold", division: "II", minSr: 2600, maxSr: 3099, index: 7 },
  { rank: "Gold", division: "III", minSr: 3100, maxSr: 3599, index: 8 },
  { rank: "Platinum", division: "I", minSr: 3600, maxSr: 4199, index: 9 },
  { rank: "Platinum", division: "II", minSr: 4200, maxSr: 4799, index: 10 },
  { rank: "Platinum", division: "III", minSr: 4800, maxSr: 5399, index: 11 },
  { rank: "Diamond", division: "I", minSr: 5400, maxSr: 6099, index: 12 },
  { rank: "Diamond", division: "II", minSr: 6100, maxSr: 6799, index: 13 },
  { rank: "Diamond", division: "III", minSr: 6800, maxSr: 7499, index: 14 },
  { rank: "Crimson", division: "I", minSr: 7500, maxSr: 8299, index: 15 },
  { rank: "Crimson", division: "II", minSr: 8300, maxSr: 9099, index: 16 },
  { rank: "Crimson", division: "III", minSr: 9100, maxSr: 9999, index: 17 },
  { rank: "Iridescent", division: null, minSr: 10000, maxSr: null, index: 18 },
];

const RANK_LADDER_CONFIG: Omit<RankLadder, "updatedAt"> = {
  title: "COD Ranked Skill Divisions",
  ruleset: "sr-based-v1",
  divisions: CODSTATS_SR_LADDER,
};

function cloneDivision(division: RankDivision): RankDivision {
  return {
    rank: division.rank,
    division: division.division,
    minSr: division.minSr,
    maxSr: division.maxSr,
    index: division.index,
  };
}

function toDisplayName(division: RankDivision) {
  return division.division ? `${division.rank} ${division.division}` : division.rank;
}

function toProgressTier(division: RankDivision): RankProgressTier {
  return {
    rank: division.rank,
    division: division.division,
    displayName: toDisplayName(division),
    minSr: division.minSr,
    maxSr: division.maxSr,
  };
}

function getSrToNextTier(currentSr: number, nextDivision: RankDivision | null) {
  if (!nextDivision) {
    return null;
  }

  return Math.max(0, nextDivision.minSr - currentSr);
}

function findNextRankDivision(currentIndex: number, divisions: readonly RankDivision[]) {
  const currentRank = divisions[currentIndex].rank;

  for (let index = currentIndex + 1; index < divisions.length; index += 1) {
    if (divisions[index].rank !== currentRank) {
      return divisions[index];
    }
  }

  return null;
}

function isWithinDivision(currentSr: number, division: RankDivision) {
  if (currentSr < division.minSr) {
    return false;
  }

  if (division.maxSr === null) {
    return true;
  }

  return currentSr <= division.maxSr;
}

function getCurrentDivisionIndex(currentSr: number, divisions: readonly RankDivision[]) {
  if (currentSr < divisions[0].minSr) {
    return 0;
  }

  const inRangeIndex = divisions.findIndex((division) => isWithinDivision(currentSr, division));
  if (inRangeIndex !== -1) {
    return inRangeIndex;
  }

  return divisions.length - 1;
}

export function getCodstatsRankLadder(): RankLadder {
  return {
    title: RANK_LADDER_CONFIG.title,
    ruleset: RANK_LADDER_CONFIG.ruleset,
    divisions: RANK_LADDER_CONFIG.divisions.map(cloneDivision),
    updatedAt: LADDER_UPDATED_AT,
  };
}

export function getCodstatsRankProgress(currentSr: number, ladder: RankLadder): RankProgress {
  const divisions = ladder.divisions;

  if (divisions.length === 0) {
    throw new Error("rank_ladder_empty");
  }

  const currentIndex = getCurrentDivisionIndex(currentSr, divisions);
  const currentDivision = divisions[currentIndex];
  const nextDivisionConfig = currentIndex < divisions.length - 1 ? divisions[currentIndex + 1] : null;
  const nextRankConfig = findNextRankDivision(currentIndex, divisions);

  const next = nextDivisionConfig ? toProgressTier(nextDivisionConfig) : null;
  const nextDivision = nextDivisionConfig ? toProgressTier(nextDivisionConfig) : null;
  const nextRank = nextRankConfig ? toProgressTier(nextRankConfig) : null;

  const srToNextTier = getSrToNextTier(currentSr, nextDivisionConfig);
  const srToNextDivision = getSrToNextTier(currentSr, nextDivisionConfig);
  const srToNextRank = getSrToNextTier(currentSr, nextRankConfig);

  const nextDivisionTarget =
    nextDivision && srToNextDivision !== null
      ? {
          ...nextDivision,
          srNeeded: srToNextDivision,
        }
      : null;

  const nextRankTarget =
    nextRank && srToNextRank !== null
      ? {
          ...nextRank,
          srNeeded: srToNextRank,
        }
      : null;

  return {
    title: ladder.title,
    ruleset: ladder.ruleset,
    currentSr,
    current: toProgressTier(currentDivision),
    next,
    srToNextTier,
    nextDivision: nextDivisionTarget,
    nextRank: nextRankTarget,
  };
}
