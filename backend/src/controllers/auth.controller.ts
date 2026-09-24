import { Request, Response } from "express";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/database";
import { redis } from "../config/redis";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// ----------------------------------------
// Start Google OAuth
// ----------------------------------------

export async function googleLogin(
  _req: Request,
  res: Response
) {
  try {
    const state = crypto.randomBytes(32).toString("hex");

    await redis.set(
      `google-oauth-state:${state}`,
      "valid",
      "EX",
      600
    );

    const authUrl =
      googleClient.generateAuthUrl({
        access_type: "offline",

        scope: [
          "openid",
          "email",
          "profile"
        ],

        state,

        prompt: "select_account"
      });

    return res.redirect(authUrl);
  } catch (error) {
    console.error(
      "Google login error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to start Google login"
    });
  }
}

// ----------------------------------------
// Google OAuth Callback
// ----------------------------------------

export async function googleCallback(
  req: Request,
  res: Response
) {
  try {
    const { code, state } = req.query;

    if (
      typeof code !== "string" ||
      typeof state !== "string"
    ) {
      return res.status(400).json({
        message:
          "Missing Google OAuth code or state"
      });
    }

    // Validate OAuth state
    const stateKey =
      `google-oauth-state:${state}`;

    const validState =
      await redis.get(stateKey);

    if (!validState) {
      return res.status(400).json({
        message:
          "Invalid or expired Google OAuth state"
      });
    }

    // Prevent state reuse
    await redis.del(stateKey);

    // Exchange authorization code
    const { tokens } =
      await googleClient.getToken(code);

    if (!tokens.id_token) {
      return res.status(400).json({
        message:
          "Google did not return an ID token"
      });
    }

    // Verify Google ID token
    const ticket =
      await googleClient.verifyIdToken({
        idToken: tokens.id_token,

        audience:
          process.env.GOOGLE_CLIENT_ID
      });

    const payload =
      ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      !payload.email
    ) {
      return res.status(400).json({
        message:
          "Invalid Google user information"
      });
    }

    const googleId =
      payload.sub;

    const email =
      payload.email;

    const name =
      payload.name ||
      email.split("@")[0];

    const avatar =
      payload.picture || null;

    // Create or update user
    const user =
      await prisma.user.upsert({
        where: {
          email
        },

        update: {
          googleId,
          name,
          avatar
        },

        create: {
          googleId,
          email,
          name,
          avatar
        }
      });

    // ----------------------------------------
    // Create session
    // ----------------------------------------

    req.session.userId =
      user.id;

    console.log(
      `🔐 Creating session for ${user.email}`
    );

    console.log(
      `👤 Session userId: ${req.session.userId}`
    );

    // ----------------------------------------
    // IMPORTANT:
    // Explicitly save the session before
    // redirecting to the frontend.
    // ----------------------------------------

    req.session.save(
      (error) => {
        if (error) {
          console.error(
            "❌ Failed to save session:",
            error
          );

          return res.status(500).json({
            message:
              "Failed to create login session"
          });
        }

        console.log(
          `✅ Google login successful: ${user.email}`
        );

        console.log(
          `🍪 Session saved: ${req.sessionID}`
        );

        const frontendUrl =
          process.env.FRONTEND_URL ||
          "http://localhost:3000";

        return res.redirect(
          frontendUrl
        );
      }
    );
  } catch (error) {
    console.error(
      "Google callback error:",
      error
    );

    return res.status(500).json({
      message:
        "Google authentication failed"
    });
  }
}

// ----------------------------------------
// Logout
// ----------------------------------------

export async function logout(
  req: Request,
  res: Response
) {
  req.session.destroy(
    (error) => {
      if (error) {
        console.error(
          "Logout error:",
          error
        );

        return res.status(500).json({
          message:
            "Logout failed"
        });
      }

      res.clearCookie(
        "connect.sid"
      );

      return res.json({
        message:
          "Logged out successfully"
      });
    }
  );
}

// ----------------------------------------
// Current User
// ----------------------------------------

export async function getCurrentUser(
  req: Request,
  res: Response
) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({
        message:
          "Not authenticated"
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.session.userId
        },

        select: {
          id: true,
          name: true,
          email: true,
          avatar: true
        }
      });

    if (!user) {
      req.session.destroy(
        () => {}
      );

      return res.status(401).json({
        message:
          "User not found"
      });
    }

    return res.json({
      user
    });
  } catch (error) {
    console.error(
      "Current user error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to get current user"
    });
  }
}