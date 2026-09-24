import { Request, Response } from "express";

import { prisma } from "../config/database";
import { scheduleEmail } from "../services/email-scheduler.service";
import { searchEmails } from "../services/elasticsearch.service";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/*
 * Schedule a single email.
 */
export async function createScheduledEmail(
  req: Request,
  res: Response
) {
  try {
    const userId =
      req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const {
      senderId,
      recipient,
      subject,
      body,
      scheduledAt,
      minDelayMs,
      hourlyLimit
    } = req.body;

    /*
     * Validate required fields.
     */
    if (
      !senderId ||
      !recipient ||
      !subject ||
      !body ||
      !scheduledAt
    ) {
      return res.status(400).json({
        message:
          "senderId, recipient, subject, body and scheduledAt are required"
      });
    }

    /*
     * Validate recipient email.
     */
    if (
      !isValidEmail(
        String(recipient).trim()
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid recipient email address"
      });
    }

    /*
     * Make sure the sender belongs to
     * the currently authenticated user.
     *
     * This prevents one user from scheduling
     * emails using another user's sender.
     */
    const sender =
      await prisma.sender.findFirst({
        where: {
          id: String(senderId),

          userId
        }
      });

    if (!sender) {
      return res.status(403).json({
        message:
          "Sender does not belong to the authenticated user"
      });
    }

    /*
     * Validate scheduled time.
     */
    const scheduleDate =
      new Date(scheduledAt);

    if (
      Number.isNaN(
        scheduleDate.getTime()
      )
    ) {
      return res.status(400).json({
        message:
          "Invalid scheduledAt date"
      });
    }

    /*
     * Prevent scheduling in the past.
     */
    if (
      scheduleDate.getTime() <
      Date.now()
    ) {
      return res.status(400).json({
        message:
          "scheduledAt must be in the future"
      });
    }

    /*
     * Schedule the email.
     */
    const email =
      await scheduleEmail({
        senderId:
          sender.id,

        recipient:
          String(recipient),

        subject:
          String(subject),

        body:
          String(body),

        scheduledAt:
          scheduleDate,

        minDelayMs:
          minDelayMs !== undefined
            ? Number(minDelayMs)
            : undefined,

        hourlyLimit:
          hourlyLimit !== undefined
            ? Number(hourlyLimit)
            : undefined
      });

    return res.status(201).json({
      message:
        "Email scheduled successfully",

      email
    });
  } catch (error) {
    console.error(
      "Create scheduled email error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to schedule email"
    });
  }
}

/*
 * Get scheduled emails belonging to
 * the authenticated user.
 */
export async function getScheduledEmails(
  req: Request,
  res: Response
) {
  try {
    const userId =
      req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const emails =
      await prisma.email.findMany({
        where: {
          sender: {
            userId
          },

          status: {
            in: [
              "scheduled",
              "processing"
            ]
          }
        },

        select: {
          id: true,

          recipient: true,

          subject: true,

          body: true,

          scheduledAt: true,

          sentAt: true,

          status: true,

          createdAt: true,

          sender: {
            select: {
              email: true
            }
          }
        },

        orderBy: {
          scheduledAt:
            "asc"
        }
      });

    return res.json({
      count:
        emails.length,

      emails
    });
  } catch (error) {
    console.error(
      "Get scheduled emails error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load scheduled emails"
    });
  }
}

/*
 * Get sent emails belonging to
 * the authenticated user.
 */
export async function getSentEmails(
  req: Request,
  res: Response
) {
  try {
    const userId =
      req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const emails =
      await prisma.email.findMany({
        where: {
          sender: {
            userId
          },

          status:
            "sent"
        },

        select: {
          id: true,

          recipient: true,

          subject: true,

          body: true,

          scheduledAt: true,

          sentAt: true,

          status: true,

          createdAt: true,

          sender: {
            select: {
              email: true
            }
          }
        },

        orderBy: {
          sentAt:
            "desc"
        }
      });

    return res.json({
      count:
        emails.length,

      emails
    });
  } catch (error) {
    console.error(
      "Get sent emails error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load sent emails"
    });
  }
}

/*
 * Search emails using Elasticsearch.
 *
 * IMPORTANT:
 * The userId from the session is passed to
 * Elasticsearch so users can only search
 * their own indexed emails.
 */
export async function searchScheduledEmails(
  req: Request,
  res: Response
) {
  try {
    const userId =
      req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const query =
      String(
        req.query.q || ""
      ).trim();

    if (!query) {
      return res.status(400).json({
        message:
          "Search query is required"
      });
    }

    /*
     * Search only within this user's
     * Elasticsearch documents.
     */
    const results =
      await searchEmails(
        userId,
        query
      );

    return res.json({
      query,

      count:
        results.length,

      results
    });
  } catch (error) {
    console.error(
      "Search emails error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to search emails"
    });
  }
}