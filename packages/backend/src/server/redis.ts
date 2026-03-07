import { createClient, type RedisClientType } from "redis";

type AppRedisClient = RedisClientType;

const REDIS_URL_ENV_KEYS = [
  "REDIS_URL",
  "REDIS_TLS_URL",
  "KV_URL",
] as const;

let redisClient: AppRedisClient | null = null;
let redisClientPromise: Promise<AppRedisClient | null> | null = null;

function resolveRedisUrl() {
  for (const envKey of REDIS_URL_ENV_KEYS) {
    const value = process.env[envKey];
    if (value) {
      return { url: value, envKey };
    }
  }

  return { url: null, envKey: null };
}

export function getRedisConnectionState() {
  const { envKey } = resolveRedisUrl();

  return {
    configured: Boolean(envKey),
    urlSource: envKey,
    isOpen: redisClient?.isOpen ?? false,
    isReady: redisClient?.isReady ?? false,
  };
}

export async function getRedisClient(): Promise<AppRedisClient | null> {
  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  const { url } = resolveRedisUrl();
  if (!url) {
    return null;
  }

  const client = redisClient ?? createClient({
    url,
  });

  if (!redisClient) {
    client.on("error", (error) => {
      console.error("Redis client error", error);
    });
  }

  redisClientPromise = client
    .connect()
    .then(() => {
      redisClient = client;
      return client;
    })
    .catch((error) => {
      console.error("Failed to connect to Redis", error);
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
