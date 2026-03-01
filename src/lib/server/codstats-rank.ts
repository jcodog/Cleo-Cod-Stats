type RankDivision = {
  rank: string;
  division?: string;
  minSr: number;
  maxSr: number;
};

export type RankLadder = {
  title: string;
  ruleset: string;
  divisions: RankDivision[];
  updatedAt: number;
};

export type RankProgress = {
  title: string;
  ruleset: string;
  currentSr: number;
  current: RankDivision;
  nextDivision?: RankDivision & {
    srNeeded: number;
  };
  nextRank?: RankDivision & {
    srNeeded: number;
  };
  prevDivision?: RankDivision & {
    srBack: number;
  };
  prevRank?: RankDivision & {
    srBack: number;
  };
};

const LADDER_UPDATED_AT = Date.UTC(2026, 1, 1);
const OPEN_ENDED_MAX_SR = Number.MAX_SAFE_INTEGER;

type DivisionTierInfo = {
  minSr: number;
  rank: string;
  division?: string;
};

const DIVISION_TIER_MIN_SR_CONFIG: readonly DivisionTierInfo[] = [
  { minSr: 0, rank: "Bronze", division: "I" },
  { minSr: 300, rank: "Bronze", division: "II" },
  { minSr: 600, rank: "Bronze", division: "III" },
  { minSr: 900, rank: "Silver", division: "I" },
  { minSr: 1300, rank: "Silver", division: "II" },
  { minSr: 1700, rank: "Silver", division: "III" },
  { minSr: 2100, rank: "Gold", division: "I" },
  { minSr: 2600, rank: "Gold", division: "II" },
  { minSr: 3100, rank: "Gold", division: "III" },
  { minSr: 3600, rank: "Platinum", division: "I" },
  { minSr: 4200, rank: "Platinum", division: "II" },
  { minSr: 4800, rank: "Platinum", division: "III" },
  { minSr: 5400, rank: "Diamond", division: "I" },
  { minSr: 6100, rank: "Diamond", division: "II" },
  { minSr: 6800, rank: "Diamond", division: "III" },
  { minSr: 7500, rank: "Crimson", division: "I" },
  { minSr: 8300, rank: "Crimson", division: "II" },
  { minSr: 9100, rank: "Crimson", division: "III" },
  { minSr: 10000, rank: "Iridescent" },
];

function buildRankDivisionsFromMinSr(config: readonly DivisionTierInfo[]): RankDivision[] {
  return config.map((entry, index) => {
    const nextEntry = config[index + 1];
    const maxSr = nextEntry ? nextEntry.minSr - 1 : OPEN_ENDED_MAX_SR;

    return {
      rank: entry.rank,
      division: entry.division,
      minSr: entry.minSr,
      maxSr,
    };
  });
}

const RANK_LADDER_CONFIG: Omit<RankLadder, "updatedAt"> = {
  title: "COD Ranked Skill Divisions",
  ruleset: "sr-based-v1",
  divisions: buildRankDivisionsFromMinSr(DIVISION_TIER_MIN_SR_CONFIG),
};

function cloneDivision(division: RankDivision): RankDivision {
  return {
    rank: division.rank,
    division: division.division,
    minSr: division.minSr,
    maxSr: division.maxSr,
  };
}

function getCurrentDivisionIndex(currentSr: number, divisions: RankDivision[]) {
  const inRangeIndex = divisions.findIndex(
    (division) => currentSr >= division.minSr && currentSr <= division.maxSr,
  );

  if (inRangeIndex !== -1) {
    return inRangeIndex;
  }

  if (currentSr < divisions[0].minSr) {
    return 0;
  }

  return divisions.length - 1;
}

function findNextRankIndex(currentIndex: number, divisions: RankDivision[]) {
  const currentRank = divisions[currentIndex].rank;

  for (let index = currentIndex + 1; index < divisions.length; index += 1) {
    if (divisions[index].rank !== currentRank) {
      return index;
    }
  }

  return null;
}

function findPrevRankIndex(currentIndex: number, divisions: RankDivision[]) {
  const currentRank = divisions[currentIndex].rank;

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (divisions[index].rank !== currentRank) {
      return index;
    }
  }

  return null;
}

function getSrNeeded(currentSr: number, minSr: number) {
  return Math.max(0, minSr - currentSr);
}

function getSrBack(currentSr: number, maxSr: number) {
  return Math.max(0, currentSr - maxSr);
}

export function getCodstatsRankLadder(): RankLadder {
  return {
    title: RANK_LADDER_CONFIG.title,
    ruleset: RANK_LADDER_CONFIG.ruleset,
    divisions: RANK_LADDER_CONFIG.divisions.map(cloneDivision),
    updatedAt: LADDER_UPDATED_AT,
  };
}

export function getCodstatsRankProgress(
  currentSr: number,
  ladder: RankLadder,
): RankProgress {
  const divisions = ladder.divisions;

  if (divisions.length === 0) {
    throw new Error("rank_ladder_empty");
  }

  const currentIndex = getCurrentDivisionIndex(currentSr, divisions);
  const currentDivision = cloneDivision(divisions[currentIndex]);

  const nextDivision =
    currentIndex < divisions.length - 1
      ? {
          ...cloneDivision(divisions[currentIndex + 1]),
          srNeeded: getSrNeeded(currentSr, divisions[currentIndex + 1].minSr),
        }
      : undefined;

  const nextRankIndex = findNextRankIndex(currentIndex, divisions);
  const nextRank =
    nextRankIndex === null
      ? undefined
      : {
          ...cloneDivision(divisions[nextRankIndex]),
          srNeeded: getSrNeeded(currentSr, divisions[nextRankIndex].minSr),
        };

  const prevDivision =
    currentIndex > 0
      ? {
          ...cloneDivision(divisions[currentIndex - 1]),
          srBack: getSrBack(currentSr, divisions[currentIndex - 1].maxSr),
        }
      : undefined;

  const prevRankIndex = findPrevRankIndex(currentIndex, divisions);
  const prevRank =
    prevRankIndex === null
      ? undefined
      : {
          ...cloneDivision(divisions[prevRankIndex]),
          srBack: getSrBack(currentSr, divisions[prevRankIndex].maxSr),
        };

  return {
    title: ladder.title,
    ruleset: ladder.ruleset,
    currentSr,
    current: currentDivision,
    nextDivision,
    nextRank,
    prevDivision,
    prevRank,
  };
}
