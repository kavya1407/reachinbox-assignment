import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
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
      }
    });

    if (!user) {
      return res.status(401).json({
        message: "User not found"
      });
    }

    next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error
    );

    return res.status(500).json({
      message: "Authentication check failed"
    });
  }
}