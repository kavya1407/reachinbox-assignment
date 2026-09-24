import { Request, Response } from "express";
import { prisma } from "../config/database";

/*
 * Create a new sender
 */
export async function createSender(
  req: Request,
  res: Response
) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required"
      });
    }

    const {
      email,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword
    } = req.body;

    if (
      !email ||
      !smtpHost ||
      !smtpPort ||
      !smtpUser ||
      !smtpPassword
    ) {
      return res.status(400).json({
        message:
          "email, smtpHost, smtpPort, smtpUser and smtpPassword are required"
      });
    }

    const port = Number(smtpPort);

    if (
      !Number.isInteger(port) ||
      port <= 0 ||
      port > 65535
    ) {
      return res.status(400).json({
        message:
          "smtpPort must be a valid port number"
      });
    }

    const existingSender =
      await prisma.sender.findFirst({
        where: {
          userId,
          email
        }
      });

    if (existingSender) {
      return res.status(409).json({
        message:
          "This sender is already configured"
      });
    }

    const sender =
      await prisma.sender.create({
        data: {
          userId,
          email,
          smtpHost,
          smtpPort: port,
          smtpUser,
          smtpPassword
        },
        select: {
          id: true,
          email: true,
          smtpHost: true,
          smtpPort: true,
          createdAt: true
        }
      });

    return res.status(201).json({
      message:
        "Sender added successfully",
      sender
    });
  } catch (error) {
    console.error(
      "Create sender error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to create sender"
    });
  }
}

/*
 * Get all senders belonging to
 * the currently logged-in user.
 */
export async function getSenders(
  req: Request,
  res: Response
) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const senders =
      await prisma.sender.findMany({
        where: {
          userId
        },
        select: {
          id: true,
          email: true,
          smtpHost: true,
          smtpPort: true,
          createdAt: true
        },
        orderBy: {
          createdAt: "desc"
        }
      });

    return res.json({
      senders
    });
  } catch (error) {
    console.error(
      "Get senders error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to load senders"
    });
  }
}

/*
 * Update an existing sender.
 *
 * This allows SMTP credentials to be changed
 * without deleting the sender and breaking
 * existing email history.
 */
export async function updateSender(
  req: Request,
  res: Response
) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const senderId =
      String(req.params.id);

    if (
      !senderId ||
      senderId === "undefined"
    ) {
      return res.status(400).json({
        message:
          "Sender ID is required"
      });
    }

    const {
      email,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPassword
    } = req.body;

    if (
      !email ||
      !smtpHost ||
      !smtpPort ||
      !smtpUser
    ) {
      return res.status(400).json({
        message:
          "email, smtpHost, smtpPort and smtpUser are required"
      });
    }

    const port = Number(smtpPort);

    if (
      !Number.isInteger(port) ||
      port <= 0 ||
      port > 65535
    ) {
      return res.status(400).json({
        message:
          "smtpPort must be a valid port number"
      });
    }

    /*
     * Verify that this sender belongs
     * to the logged-in user.
     */
    const existingSender =
      await prisma.sender.findFirst({
        where: {
          id: senderId,
          userId
        }
      });

    if (!existingSender) {
      return res.status(404).json({
        message:
          "Sender not found"
      });
    }

    /*
     * If the password is empty, preserve
     * the existing password.
     */
    const password =
      typeof smtpPassword ===
        "string" &&
      smtpPassword.trim()
        ? smtpPassword
        : existingSender.smtpPassword;

    const sender =
      await prisma.sender.update({
        where: {
          id: senderId
        },

        data: {
          email:
            email.trim(),

          smtpHost:
            smtpHost.trim(),

          smtpPort:
            port,

          smtpUser:
            smtpUser.trim(),

          smtpPassword:
            password
        },

        select: {
          id: true,
          email: true,
          smtpHost: true,
          smtpPort: true,
          createdAt: true
        }
      });

    return res.json({
      message:
        "Sender updated successfully",

      sender
    });
  } catch (error) {
    console.error(
      "Update sender error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to update sender"
    });
  }
}

/*
 * Delete sender.
 *
 * We intentionally prevent deletion when
 * email history exists.
 */
export async function deleteSender(
  req: Request,
  res: Response
) {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({
        message:
          "Authentication required"
      });
    }

    const senderId =
      String(req.params.id);

    if (
      !senderId ||
      senderId === "undefined"
    ) {
      return res.status(400).json({
        message:
          "Sender ID is required"
      });
    }

    const sender =
      await prisma.sender.findFirst({
        where: {
          id: senderId,
          userId
        }
      });

    if (!sender) {
      return res.status(404).json({
        message:
          "Sender not found"
      });
    }

    const emailCount =
      await prisma.email.count({
        where: {
          senderId
        }
      });

    if (emailCount > 0) {
      return res.status(409).json({
        message:
          "Cannot delete a sender that has scheduled or sent emails"
      });
    }

    await prisma.sender.delete({
      where: {
        id: senderId
      }
    });

    return res.json({
      message:
        "Sender deleted successfully"
    });
  } catch (error) {
    console.error(
      "Delete sender error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to delete sender"
    });
  }
}