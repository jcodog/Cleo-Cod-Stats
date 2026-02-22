export type LandingMetricsSnapshot = {
  matchesIndexed: number;
  sessionsTracked: number;
  activeSessions: number;
  latestIngestedAt: number | null;
  winRate: number;
};

export type LandingMetricsResponse = {
  global: LandingMetricsSnapshot;
  personal: LandingMetricsSnapshot | null;
};

export type LandingMetricsTraceEvent = {
  traceId: string;
  event: "query" | "invalidate";
  scope: "anonymous" | "authenticated" | "all";
  userId: string | null;
  cacheStatus?: "hit" | "miss" | "bypass";
  deletedKeyCount?: number;
  note?: string;
  at: string;
};

export const LANDING_METRICS_CACHE_PREFIX = "landing:metrics";
export const LANDING_METRICS_TRACE_LIST_KEY =
  `${LANDING_METRICS_CACHE_PREFIX}:trace`;

export function getLandingMetricsCacheKey(userId: string | null) {
  return `${LANDING_METRICS_CACHE_PREFIX}:${userId ?? "anonymous"}`;
}

export const LANDING_METRICS_CACHE_TTL_SECONDS = {
  anonymous: 30,
  authenticated: 15,
} as const;

export const LANDING_METRICS_REFETCH_MS = {
  anonymous: 15_000,
  authenticated: 5_000,
} as const;
