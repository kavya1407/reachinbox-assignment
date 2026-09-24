import { Request, Response } from "express";
import { prisma } from "../config/database";
import { scheduleEmail } from "../services/email-scheduler.service";

function extractEmails(input: string): string[] {
  const matches =
    input.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
    ) || [];

  return [
    ...new Set(
      matches.map((email) =>
        email.trim().toLowerCase()
      )
    )
  ];
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

export async function composeEmails(
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
      senderId,
      subject,
      body,
      recipients,
      startTime,
      delayMs,
      hourlyLimit
    } = req.body;

    /*
     * Basic validation
     */
    if (!senderId) {
      return res.status(400).json({
        message: "senderId is required"
      });
    }

    if (
      typeof subject !== "string" ||
      !subject.trim()
    ) {
      return res.status(400).json({
        message: "Subject is required"
      });
    }

    if (
      typeof body !== "string" ||
      !body.trim()
    ) {
      return res.status(400).json({
        message: "Email body is required"
      });
    }

    if (
      typeof startTime !== "string" ||
      !startTime
    ) {
      return res.status(400).json({
        message: "startTime is required"
      });
    }

    /*
     * Verify sender ownership.
     */
    const sender =
      await prisma.sender.findFirst({
        where: {
          id: String(senderId),
          userId
        }
      });

    if (!sender) {
      return res.status(404).json({
        message:
          "Sender not found for this user"
      });
    }

    /*
     * Recipients can be supplied as:
     *
     * ["a@gmail.com", "b@gmail.com"]
     *
     * or as a string containing CSV/text.
     */
    let recipientText = "";

    if (Array.isArray(recipients)) {
      recipientText =
        recipients.join("\n");
    } else if (
      typeof recipients === "string"
    ) {
      recipientText = recipients;
    }

    const recipientList =
      extractEmails(recipientText);

    if (recipientList.length === 0) {
      return res.status(400).json({
        message:
          "No valid email addresses found"
      });
    }

    /*
     * Validate extracted addresses.
     */
    const invalidRecipients =
      recipientList.filter(
        (email) =>
          !isValidEmail(email)
      );

    if (
      invalidRecipients.length > 0
    ) {
      return res.status(400).json({
        message:
          "Invalid recipient email addresses",
        invalidRecipients
      });
    }

    /*
     * Parse start time.
     */
    const parsedStartTime =
      new Date(startTime);

    if (
      Number.isNaN(
        parsedStartTime.getTime()
      )
    ) {
      return res.status(400).json({
        message:
          "startTime must be a valid date"
      });
    }

    /*
     * Start time must be in the future.
     */
    if (
      parsedStartTime.getTime() <
      Date.now()
    ) {
      return res.status(400).json({
        message:
          "startTime must be in the future"
      });
    }

    /*
     * Delay between emails.
     */
    const parsedDelayMs =
      Number(delayMs ?? 2000);

    if (
      !Number.isFinite(
        parsedDelayMs
      ) ||
      parsedDelayMs < 0
    ) {
      return res.status(400).json({
        message:
          "delayMs must be a non-negative number"
      });
    }

    /*
     * Hourly sender limit.
     */
    const parsedHourlyLimit =
      Number(
        hourlyLimit ?? 100
      );

    if (
      !Number.isFinite(
        parsedHourlyLimit
      ) ||
      parsedHourlyLimit < 1
    ) {
      return res.status(400).json({
        message:
          "hourlyLimit must be at least 1"
      });
    }

    /*
     * Schedule each recipient.
     *
     * Example:
     *
     * Start = 10:00
     * Delay = 2 seconds
     *
     * Email 1 -> 10:00:00
     * Email 2 -> 10:00:02
     * Email 3 -> 10:00:04
     */
    const scheduledEmails = [];

    for (
      let index = 0;
      index < recipientList.length;
      index++
    ) {
      const scheduledAt =
        new Date(
          parsedStartTime.getTime() +
            index *
              parsedDelayMs
        );

      const email =
        await scheduleEmail({
          senderId:
            String(senderId),

          recipient:
            recipientList[index],

          subject:
            subject.trim(),

          body:
            body.trim(),

          scheduledAt,

          minDelayMs:
            parsedDelayMs,

          hourlyLimit:
            Math.floor(
              parsedHourlyLimit
            )
        });

      scheduledEmails.push(email);
    }

    return res.status(201).json({
      message:
        "Email campaign scheduled successfully",

      count:
        scheduledEmails.length,

      emails:
        scheduledEmails.map(
          (email) => ({
            id: email.id,
            recipient:
              email.recipient,
            scheduledAt:
              email.scheduledAt,
            status:
              email.status,
            bullJobId:
              email.bullJobId
          })
        )
    });
  } catch (error) {
    console.error(
      "Compose email error:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to schedule email campaign"
    });
  }
}