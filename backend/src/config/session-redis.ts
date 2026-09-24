import { createClient } from "redis";

export const sessionRedis = createClient({
  socket: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379)
  }
});

sessionRedis.on("error", (error) => {
  console.error(
    "❌ Session Redis error:",
    error
  );
});

sessionRedis.on("connect", () => {
  console.log(
    "🔐 Session Redis connecting..."
  );
});

sessionRedis.on("ready", () => {
  console.log(
    "🔐 Session Redis ready"
  );
});

export async function connectSessionRedis() {
  if (!sessionRedis.isOpen) {
    await sessionRedis.connect();
  }
}