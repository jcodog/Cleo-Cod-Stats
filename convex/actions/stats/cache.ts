"use node";

import { createClient, type RedisClientType } from "redis";
import { v } from "convex/values";

import { internalAction } from "../../_generated/server";

const LANDING_METRICS_CACHE_PREFIX = "landing:metrics";
const LANDING_METRICS_TRACE_LIST_KEY = `${LANDING_METRICS_CACHE_PREFIX}:trace`;

const REDIS_URL_ENV_KEYS = [
  "REDIS_URL",
  "REDIS_TLS_URL",
  "KV_URL",
] as const;

type ActionRedisClient = RedisClientType;

let redisClient: ActionRedisClient | null = null;
let redisClientPromise: Promise<ActionRedisClient | null> | null = null;

function resolveRedisUrl() {
  for (const envKey of REDIS_URL_ENV_KEYS) {
    const value = process.env[envKey];
    if (value) {
      return value;
    }
  }

  return null;
}

async function getRedisClient(): Promise<ActionRedisClient | null> {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  const redisUrl = resolveRedisUrl();
  if (!redisUrl) {
    return null;
  }

  const client = redisClient ?? createClient({
    url: redisUrl,
  });

  if (!redisClient) {
    client.on("error", (error) => {
      console.error("Landing metrics invalidation Redis error", error);
    });
  }

  redisClientPromise = client
    .connect()
    .then(() => {
      redisClient = client;
      return client;
    })
    .catch((error) => {
      console.error("Failed connecting Redis in invalidation action", error);
      try {
        client.destroy();
      } catch {
        // noop
      }
      redisClient = null;
      return null;
    })
    .finally(() => {
      redisClientPromise = null;
    });

  return redisClientPromise;
}

function getLandingMetricsCacheKey(userId: string) {
  return `${LANDING_METRICS_CACHE_PREFIX}:${userId}`;
}

async function appendInvalidationTrace(
  redis: ActionRedisClient,
  args: {
    traceId: string;
    scope: "anonymous" | "authenticated" | "all";
    userId: string | null;
    deletedKeyCount: number;
  },
) {
  await redis.lPush(
    LANDING_METRICS_TRACE_LIST_KEY,
    JSON.stringify({
      traceId: args.traceId,
      event: "invalidate",
      scope: args.scope,
      userId: args.userId,
      deletedKeyCount: args.deletedKeyCount,
      at: new Date().toISOString(),
    }),
  );
  await redis.lTrim(LANDING_METRICS_TRACE_LIST_KEY, 0, 199);
}

async function deleteKeysByPattern(redis: ActionRedisClient, pattern: string) {
  let deletedKeyCount = 0;

  for await (const keys of redis.scanIterator({
    MATCH: pattern,
    COUNT: 200,
  })) {
    for (const key of keys) {
      if (key === LANDING_METRICS_TRACE_LIST_KEY) {
        continue;
      }

      deletedKeyCount += await redis.del(key);
    }
  }

  return deletedKeyCount;
}

export const invalidateLandingMetricsCache = internalAction({
  args: {
    userId: v.optional(v.string()),
    invalidateAll: v.optional(v.boolean()),
  },
  handler: async (_ctx, { userId, invalidateAll }) => {
    const redis = await getRedisClient();
    if (!redis) {
      return {
        invalidated: false,
        reason: "redis_not_configured",
        deletedKeyCount: 0,
      };
    }

    let deletedKeyCount = 0;
    if (invalidateAll) {
      deletedKeyCount += await deleteKeysByPattern(
        redis,
        `${LANDING_METRICS_CACHE_PREFIX}:*`,
      );
    } else {
      const keys = Array.from(
        new Set([
          getLandingMetricsCacheKey("anonymous"),
          ...(userId ? [getLandingMetricsCacheKey(userId)] : []),
        ]),
      );

      for (const key of keys) {
        deletedKeyCount += await redis.del(key);
      }
    }

    const traceId = crypto.randomUUID();
    await appendInvalidationTrace(redis, {
      traceId,
      scope: invalidateAll ? "all" : userId ? "authenticated" : "anonymous",
      userId: userId ?? null,
      deletedKeyCount,
    });

    return {
      invalidated: true,
      reason: "ok",
      deletedKeyCount,
      traceId,
    };
  },
});
