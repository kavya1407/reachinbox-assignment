import { Request, Response } from "express";
import { prisma } from "../config/database";

export async function getDashboard(
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

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true
      }
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    const [
      scheduledCount,
      sentCount,
      senders
    ] = await Promise.all([
      prisma.email.count({
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
        }
      }),

      prisma.email.count({
        where: {
          sender: {
            userId
          },
          status: "sent"
        }
      }),

      prisma.sender.findMany({
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
      })
    ]);

    return res.json({
      user,
      stats: {
        scheduled: scheduledCount,
        sent: sentCount,
        senders: senders.length
      },
      senders
    });
  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );

    return res.status(500).json({
      message: "Failed to load dashboard"
    });
  }
}