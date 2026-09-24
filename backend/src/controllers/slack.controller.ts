import { Request, Response } from "express";
import crypto from "crypto";

import { redis } from "../config/redis";
import { prisma } from "../config/database";

const SLACK_CLIENT_ID =
  process.env.SLACK_CLIENT_ID!;

const SLACK_CLIENT_SECRET =
  process.env.SLACK_CLIENT_SECRET!;

const SLACK_REDIRECT_URI =
  process.env.SLACK_REDIRECT_URI ||
  "http://localhost:5000/api/slack/callback";

export async function connectSlack(
  req: Request,
  res: Response
) {
  try {
    // Get the currently logged-in Google user
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "You must be logged in with Google first"
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        }
      });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // Generate OAuth state
    const state =
      crypto.randomBytes(32).toString("hex");

    // Store the logged-in user's ID
    // against the OAuth state
    await redis.set(
      `slack-oauth-state:${state}`,
      userId,
      "EX",
      600
    );

    const params =
      new URLSearchParams({
        client_id:
          SLACK_CLIENT_ID,

        scope:
          "chat:write,channels:read",

        redirect_uri:
          SLACK_REDIRECT_URI,

        state
      });

    const slackUrl =
      `https://slack.com/oauth/v2/authorize?${params.toString()}`;

    return res.redirect(slackUrl);
  } catch (error) {
    console.error(
      "Slack connect error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to start Slack OAuth"
    });
  }
}

export async function slackCallback(
  req: Request,
  res: Response
) {
  try {
    const { code, state } =
      req.query;

    if (
      typeof code !== "string" ||
      typeof state !== "string"
    ) {
      return res.status(400).json({
        message:
          "Missing OAuth code or state"
      });
    }

    // Validate OAuth state
    const stateKey =
      `slack-oauth-state:${state}`;

    const userId =
      await redis.get(stateKey);

    if (!userId) {
      return res.status(400).json({
        message:
          "Invalid or expired OAuth state"
      });
    }

    // OAuth state can only be used once
    await redis.del(stateKey);

    // Exchange code for Slack token
    const tokenResponse =
      await fetch(
        "https://slack.com/api/oauth.v2.access",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body: new URLSearchParams({
            client_id:
              SLACK_CLIENT_ID,

            client_secret:
              SLACK_CLIENT_SECRET,

            code,

            redirect_uri:
              SLACK_REDIRECT_URI
          })
        }
      );

    const tokenData =
      await tokenResponse.json() as {
        ok?: boolean;
        error?: string;
        access_token?: string;
        team?: {
          id?: string;
          name?: string;
        };
      };

    if (
      !tokenData.ok ||
      !tokenData.access_token
    ) {
      console.error(
        "Slack OAuth error:",
        tokenData
      );

      return res.status(400).json({
        message:
          "Slack OAuth authorization failed",

        error:
          tokenData.error
      });
    }

    // Save Slack connection against
    // the currently logged-in Google user
    await prisma.slackConnection.upsert({
      where: {
        userId
      },

      update: {
        accessToken:
          tokenData.access_token,

        teamId:
          tokenData.team?.id || null,

        connectedAt:
          new Date()
      },

      create: {
        userId,

        accessToken:
          tokenData.access_token,

        teamId:
          tokenData.team?.id || null
      }
    });

    console.log(
      `✅ Slack connected for user ${userId}`
    );

    return res.json({
      message:
        "Slack connected successfully"
    });
  } catch (error) {
    console.error(
      "Slack callback error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to complete Slack OAuth"
    });
  }
}