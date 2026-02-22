import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { NextResponse } from "next/server";

import { api } from "@/convex/_generated/api";
import {
  LANDING_METRICS_CACHE_TTL_SECONDS,
  LANDING_METRICS_TRACE_LIST_KEY,
  getLandingMetricsCacheKey,
  type LandingMetricsResponse,
  type LandingMetricsTraceEvent,
} from "@/lib/landing/metrics";
import { getRedisClient } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LANDING_METRICS_CACHE_CONTROL = "private, no-store";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in your .env file");
}

const convex = new ConvexHttpClient(convexUrl);

function getLandingMetricsCacheTtl(userId: string | null) {
  return userId
    ? LANDING_METRICS_CACHE_TTL_SECONDS.authenticated
    : LANDING_METRICS_CACHE_TTL_SECONDS.anonymous;
}

async function appendQueryTrace(
  redis: NonNullable<Awaited<ReturnType<typeof getRedisClient>>>,
  event: LandingMetricsTraceEvent,
) {
  await redis.lPush(LANDING_METRICS_TRACE_LIST_KEY, JSON.stringify(event));
  await redis.lTrim(LANDING_METRICS_TRACE_LIST_KEY, 0, 199);
}

function buildResponse(
  data: LandingMetricsResponse,
  cacheStatus: "hit" | "miss" | "bypass",
  traceId: string,
  scope: "anonymous" | "authenticated",
  cacheKey: string,
  cacheTtl: number,
) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": LANDING_METRICS_CACHE_CONTROL,
      "X-Landing-Metrics-Cache": cacheStatus,
      "X-Landing-Metrics-Trace-Id": traceId,
      "X-Landing-Metrics-Trace": `status=${cacheStatus};scope=${scope}`,
      "X-Landing-Metrics-Cache-Key": cacheKey,
      "X-Landing-Metrics-Cache-TTL": `${cacheTtl}`,
    },
  });
}

export async function GET() {
  const { userId } = await auth();
  const traceId = crypto.randomUUID();
  const scope = userId ? "authenticated" : "anonymous";
  const cacheTtl = getLandingMetricsCacheTtl(userId);
  let missNote: string | undefined;

  const redis = await getRedisClient();
  const cacheKey = getLandingMetricsCacheKey(userId);

  if (redis) {
    try {
      const cachedMetricsRaw = await redis.get(cacheKey);
      if (typeof cachedMetricsRaw === "string" && cachedMetricsRaw.length > 0) {
        const cachedMetrics = JSON.parse(cachedMetricsRaw) as LandingMetricsResponse;

        await redis.expire(cacheKey, cacheTtl);
        await appendQueryTrace(redis, {
          traceId,
          event: "query",
          scope,
          userId,
          cacheStatus: "hit",
          at: new Date().toISOString(),
        });

        return buildResponse(
          cachedMetrics,
          "hit",
          traceId,
          scope,
          cacheKey,
          cacheTtl,
        );
      }
    } catch (error) {
      missNote = "cache_read_or_parse_error";
      await redis.del(cacheKey).catch(() => {
        // noop
      });

      console.error("Failed to read landing metrics from Redis", error);
    }
  }

  const freshMetrics = (await convex.query(
    api.stats.getLandingMetrics,
    userId ? { userId } : {},
  )) as LandingMetricsResponse;

  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(freshMetrics), {
        EX: cacheTtl,
      });
      await appendQueryTrace(redis, {
        traceId,
        event: "query",
        scope,
        userId,
        cacheStatus: "miss",
        note: missNote,
        at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to write landing metrics to Redis", error);
    }
  }

  return buildResponse(
    freshMetrics,
    redis ? "miss" : "bypass",
    traceId,
    scope,
    cacheKey,
    cacheTtl,
  );
}
