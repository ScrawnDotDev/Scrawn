import IORedis from "ioredis";

let redisConnection: IORedis | null = null;

export function getRedisConnection(REDIS_URL?: string): IORedis {
  if (redisConnection) return redisConnection;

  if (!REDIS_URL) {
    throw new Error("REDIS_URL is not defined");
  }

  redisConnection = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  return redisConnection;
}