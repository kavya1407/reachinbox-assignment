import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new IORedis(redisUrl, {
      maxRetriesPerRequest: null
    })
  : new IORedis({
      host: process.env.REDIS_HOST || "localhost",
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: null
    });