"use client";

import { useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/nextjs";
import {
  LANDING_METRICS_REFETCH_MS,
  type LandingMetricsResponse,
} from "@workspace/backend/landing/metrics";

function formatCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value);
}

function formatRelativeTime(timestamp: number | null) {
  if (!timestamp) {
    return "No matches yet";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 45_000) {
    return "Just now";
  }

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

async function fetchLandingMetrics(signal?: AbortSignal) {
  const response = await fetch("/api/landing-metrics", {
    method: "GET",
    signal,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch landing metrics: ${response.status}`);
  }

  return (await response.json()) as LandingMetricsResponse;
}

export function LandingLiveStats() {
  const { isLoaded, isSignedIn, user } = useUser();

  const userId = isSignedIn ? user?.id : undefined;
  const refetchInterval = isSignedIn
    ? LANDING_METRICS_REFETCH_MS.authenticated
    : LANDING_METRICS_REFETCH_MS.anonymous;

  const { data, isPending, isError } = useQuery({
    queryKey: ["landing-live-stats", userId ?? "anonymous"],
    queryFn: ({ signal }) => fetchLandingMetrics(signal),
    enabled: isLoaded,
    staleTime: 0,
    gcTime: refetchInterval * 6,
    refetchInterval,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    placeholderData: (previousData) => previousData,
  });

  const scopedStats = data
    ? data.personal ?? data.global
    : {
        matchesIndexed: 0,
        sessionsTracked: 0,
        activeSessions: 0,
        latestIngestedAt: null,
        winRate: 0,
      };

  const isPersonalized = Boolean(data?.personal);
  const showUnavailable = isError && !data;

  const metrics = isPending
    ? [
        {
          label: "Indexed Matches",
          value: "Loading…",
        },
        {
          label: "Total Sessions",
          value: "Loading…",
        },
        {
          label: "Latest Match Sync",
          value: "Loading…",
        },
      ]
    : [
        {
          label: isPersonalized
            ? "Indexed Matches for Your Account"
            : "Indexed Matches Across CodStats",
          value: showUnavailable
            ? "Unavailable"
            : formatCount(scopedStats.matchesIndexed),
        },
        {
          label: isPersonalized
            ? "Total Sessions for Your Account"
            : "Total Sessions Across CodStats",
          value: showUnavailable
            ? "Unavailable"
            : formatCount(scopedStats.sessionsTracked),
        },
        {
          label: isPersonalized ? "Your Latest Match Sync" : "Platform Match Sync",
          value: showUnavailable
            ? "Unavailable"
            : formatRelativeTime(scopedStats.latestIngestedAt),
        },
      ];

  return (
    <div className="mt-6 space-y-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {isPersonalized
          ? `Live for ${user?.firstName ?? "you"}: your match data is ingested by CodStats bots to CodStats servers, then used in both bot features and dashboard analytics.`
          : "Platform metrics update as CodStats bots ingest match data to CodStats servers. Sign in to view these stats for your account."}
      </p>

      <div className="grid gap-3" aria-live="polite">
        {metrics.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between rounded-xl border border-border/70 bg-background/80 px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {showUnavailable
          ? "Live metrics are temporarily unavailable."
          : isPending
          ? "Win rate is loading…"
          : `${isPersonalized ? "Your" : "Platform"} win rate: ${formatPercentage(scopedStats.winRate)}%`}
      </p>
    </div>
  );
}
