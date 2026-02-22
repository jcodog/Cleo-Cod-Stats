import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  LANDING_METRICS_TRACE_LIST_KEY,
  getLandingMetricsCacheKey,
  type LandingMetricsTraceEvent,
} from "@/lib/landing/metrics";
import {
  getLandingMetricsApiKeyHeaderName,
  validateLandingMetricsApiKey,
} from "@/lib/server/landing-metrics-auth";
import { getRedisClient, getRedisConnectionState } from "@/lib/server/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEBUG_CACHE_CONTROL = "private, no-store";

function parseTraceEntries(entries: string[]) {
  return entries.flatMap((entry) => {
    try {
      return [JSON.parse(entry) as LandingMetricsTraceEvent];
    } catch {
      return [];
    }
  });
}

export async function GET(request: Request) {
  const apiKeyValidation = validateLandingMetricsApiKey(request);
  if (!apiKeyValidation.valid) {
    return NextResponse.json(
      {
        ok: false,
        error:
          apiKeyValidation.reason === "missing_api_key_env"
            ? "landing_metrics_api_key_not_configured"
            : "unauthorized",
      },
      {
        status: apiKeyValidation.reason === "missing_api_key_env" ? 503 : 401,
        headers: {
          "Cache-Control": DEBUG_CACHE_CONTROL,
          "X-Landing-Metrics-Debug": "true",
          "X-Landing-Metrics-Auth": "required",
          "X-Landing-Metrics-Auth-Header": getLandingMetricsApiKeyHeaderName(),
        },
      },
    );
  }

  const { userId } = await auth();
  const connectionState = getRedisConnectionState();
  const redis = await getRedisClient();

  const cacheKeys = Array.from(
    new Set([
      getLandingMetricsCacheKey(null),
      ...(userId ? [getLandingMetricsCacheKey(userId)] : []),
    ]),
  );

  if (!redis) {
    return NextResponse.json(
      {
        ok: true,
        redisConfigured: connectionState.configured,
        redisUrlSource: connectionState.urlSource,
        redisConnected: false,
        currentUserId: userId,
        cacheKeys,
        keyStates: [],
        traces: [],
      },
      {
        headers: {
          "Cache-Control": DEBUG_CACHE_CONTROL,
          "X-Landing-Metrics-Debug": "true",
        },
      },
    );
  }

  const keyStates = await Promise.all(
    cacheKeys.map(async (key) => {
      const [existsResult, ttlSeconds, keyType, rawValue] = await Promise.all([
        redis.exists(key),
        redis.ttl(key),
        redis.type(key),
        redis.get(key),
      ]);

      const valueLength = typeof rawValue === "string" ? rawValue.length : 0;
      const parsedOk =
        typeof rawValue !== "string" ||
        rawValue.length === 0 ||
        (() => {
          try {
            JSON.parse(rawValue);
            return true;
          } catch {
            return false;
          }
        })();

      return {
        key,
        exists: existsResult === 1,
        ttlSeconds,
        keyType,
        valueLength,
        parsedOk,
      };
    }),
  );

  const traceEntries = await redis.lRange(LANDING_METRICS_TRACE_LIST_KEY, 0, 49);

  return NextResponse.json(
    {
      ok: true,
      redisConfigured: connectionState.configured,
      redisUrlSource: connectionState.urlSource,
      redisConnected: redis.isOpen,
      currentUserId: userId,
      cacheKeys,
      keyStates,
      traceListKey: LANDING_METRICS_TRACE_LIST_KEY,
      traces: parseTraceEntries(traceEntries),
    },
    {
      headers: {
        "Cache-Control": DEBUG_CACHE_CONTROL,
        "X-Landing-Metrics-Debug": "true",
      },
    },
  );
}
