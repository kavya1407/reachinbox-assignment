import express from "express";
import cors from "cors";
import session from "express-session";
import { RedisStore } from "connect-redis";

import { prisma } from "./config/database";
import { redis } from "./config/redis";
import {
  sessionRedis,
  connectSessionRedis
} from "./config/session-redis";

import emailRoutes from "./routes/email.routes";
import composeRoutes from "./routes/compose.routes";
import slackRoutes from "./routes/slack.routes";
import authRoutes from "./routes/auth.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import senderRoutes from "./routes/sender.routes";

import { ensureEmailIndex } from "./services/elasticsearch.service";
import { serverAdapter } from "./config/bull-board";
import { shutdownWorker } from "./workers/email.worker";

const app = express();

const PORT =
  Number(
    process.env.PORT || 5000
  );

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  "http://localhost:3000";

/*
 * --------------------------------------------------
 * CORS
 * --------------------------------------------------
 */

app.use(
  cors({
    origin:
      FRONTEND_URL,

    credentials:
      true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS"
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization"
    ]
  })
);

/*
 * --------------------------------------------------
 * BODY PARSING
 * --------------------------------------------------
 */

app.use(
  express.json({
    limit: "10mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb"
  })
);

/*
 * --------------------------------------------------
 * REDIS SESSION STORE
 * --------------------------------------------------
 *
 * IMPORTANT:
 * BullMQ continues using ioredis.
 *
 * Express sessions use the official node-redis
 * client because connect-redis expects its Redis
 * client API.
 *
 * --------------------------------------------------
 */

const sessionStore =
  new RedisStore({
    client: sessionRedis,

    prefix:
      "reachinbox:session:"
  });

app.use(
  session({
    store:
      sessionStore,

    secret:
      process.env.SESSION_SECRET ||
      "development-session-secret",

    resave:
      false,

    saveUninitialized:
      false,

    cookie: {
      httpOnly:
        true,

      secure:
        false,

      sameSite:
        "lax",

      maxAge:
        1000 *
        60 *
        60 *
        24 *
        7
    }
  })
);

/*
 * --------------------------------------------------
 * REQUEST LOGGER
 * --------------------------------------------------
 */

app.use(
  (
    req,
    _res,
    next
  ) => {
    console.log(
      `${req.method} ${req.originalUrl}`
    );

    next();
  }
);

/*
 * --------------------------------------------------
 * API ROUTES
 * --------------------------------------------------
 */

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/dashboard",
  dashboardRoutes
);

app.use(
  "/api/senders",
  senderRoutes
);

app.use(
  "/api/emails",
  emailRoutes
);

app.use(
  "/api/compose",
  composeRoutes
);

app.use(
  "/api/slack",
  slackRoutes
);

/*
 * --------------------------------------------------
 * BULL BOARD
 * --------------------------------------------------
 */

app.use(
  "/admin/queues",
  serverAdapter.getRouter()
);

/*
 * --------------------------------------------------
 * HEALTH CHECK
 * --------------------------------------------------
 */

app.get(
  "/health",
  async (
    _req,
    res
  ) => {
    try {
      await prisma.$queryRaw`SELECT 1`;

      await redis.ping();

      await sessionRedis.ping();

      return res.json({
        status:
          "ok",

        database:
          "connected",

        redis:
          "connected",

        sessionRedis:
          "connected",

        timestamp:
          new Date().toISOString()
      });
    } catch (error) {
      console.error(
        "Health check failed:",
        error
      );

      return res.status(503).json({
        status:
          "error",

        message:
          "Service dependencies unavailable"
      });
    }
  }
);

/*
 * --------------------------------------------------
 * SESSION DEBUG ENDPOINT
 * --------------------------------------------------
 */

app.get(
  "/api/debug/session",
  (
    req,
    res
  ) => {
    return res.json({
      authenticated:
        Boolean(
          req.session.userId
        ),

      userId:
        req.session.userId ||
        null
    });
  }
);

/*
 * --------------------------------------------------
 * 404 HANDLER
 * --------------------------------------------------
 */

app.use(
  (
    _req,
    res
  ) => {
    return res.status(404).json({
      message:
        "Route not found"
    });
  }
);

/*
 * --------------------------------------------------
 * GLOBAL ERROR HANDLER
 * --------------------------------------------------
 */

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      "Unhandled server error:",
      error
    );

    return res.status(500).json({
      message:
        "Internal server error"
    });
  }
);

/*
 * --------------------------------------------------
 * START SERVER
 * --------------------------------------------------
 */

async function startServer() {
  try {
    /*
     * PostgreSQL
     */
    await prisma.$connect();

    console.log(
      "✅ PostgreSQL connected"
    );

    /*
     * BullMQ / application Redis
     */
    await redis.ping();

    console.log(
      "✅ Redis connected"
    );

    /*
     * Express session Redis
     */
    await connectSessionRedis();

    console.log(
      "✅ Session Redis connected"
    );

    /*
     * Elasticsearch
     */
    await ensureEmailIndex();

    /*
     * Start HTTP server
     */
    app.listen(
      PORT,
      () => {
        console.log(
          `🚀 Server running on http://localhost:${PORT}`
        );

        console.log(
          `📊 Bull Board: http://localhost:${PORT}/admin/queues`
        );
      }
    );
  } catch (error) {
    console.error(
      "❌ Failed to start server:",
      error
    );

    process.exit(1);
  }
}

/*
 * --------------------------------------------------
 * GRACEFUL SHUTDOWN
 * --------------------------------------------------
 */

let isShuttingDown =
  false;

async function gracefulShutdown(
  signal: string
) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown =
    true;

  console.log(
    `\n🛑 Received ${signal}. Starting graceful shutdown...`
  );

  try {
    /*
     * Stop BullMQ worker
     */
    await shutdownWorker();

    /*
     * PostgreSQL
     */
    console.log(
      "🔌 Disconnecting PostgreSQL..."
    );

    await prisma.$disconnect();

    console.log(
      "✅ PostgreSQL disconnected"
    );

    /*
     * Application Redis
     */
    console.log(
      "🔌 Disconnecting Redis..."
    );

    await redis.quit();

    console.log(
      "✅ Redis disconnected"
    );

    /*
     * Session Redis
     */
    console.log(
      "🔌 Disconnecting Session Redis..."
    );

    if (
      sessionRedis.isOpen
    ) {
      await sessionRedis.quit();
    }

    console.log(
      "✅ Session Redis disconnected"
    );

    console.log(
      "👋 Graceful shutdown completed"
    );

    process.exit(0);
  } catch (error) {
    console.error(
      "❌ Error during graceful shutdown:",
      error
    );

    try {
      await prisma.$disconnect();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      await redis.quit();
    } catch {
      // Ignore cleanup errors.
    }

    try {
      if (
        sessionRedis.isOpen
      ) {
        await sessionRedis.quit();
      }
    } catch {
      // Ignore cleanup errors.
    }

    process.exit(1);
  }
}

/*
 * --------------------------------------------------
 * TERMINATION SIGNALS
 * --------------------------------------------------
 */

process.on(
  "SIGINT",
  () =>
    gracefulShutdown(
      "SIGINT"
    )
);

process.on(
  "SIGTERM",
  () =>
    gracefulShutdown(
      "SIGTERM"
    )
);

/*
 * --------------------------------------------------
 * START
 * --------------------------------------------------
 */

startServer();