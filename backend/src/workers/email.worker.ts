import { Worker, Job } from "bullmq";

import { redis } from "../config/redis";
import { prisma } from "../config/database";
import { emailQueue } from "../queues/email.queue";

import { sendEmail } from "../services/mail.service";

import {
  reserveSendSlot,
  commitSendSlot,
  releaseSendSlot
} from "../services/rate-limit.service";

import { notifyHourlyLimitReached } from "../services/slack.service";
import { indexEmail } from "../services/elasticsearch.service";

async function processEmail(job: Job) {
  const { emailId } = job.data;

  console.log(
    `📨 Processing email: ${emailId}`
  );

  /*
   * Load email together with its sender.
   *
   * sender.userId is required for:
   * - Elasticsearch user isolation
   * - Slack notifications
   * - ownership information
   */
  const email =
    await prisma.email.findUnique({
      where: {
        id: emailId
      },

      include: {
        sender: true
      }
    });

  if (!email) {
    throw new Error(
      `Email ${emailId} not found`
    );
  }

  /*
   * Idempotency protection.
   *
   * Never send an email again if it has
   * already been successfully sent.
   */
  if (email.status === "sent") {
    console.log(
      `⏭️ Email ${emailId} already sent`
    );

    return {
      success: true,
      alreadySent: true,
      emailId
    };
  }

  /*
   * Reserve a rate-limit slot.
   *
   * This checks:
   * - minimum delay
   * - hourly limit
   *
   * The reservation is temporary.
   */
  const rateLimit =
    await reserveSendSlot(
      email.senderId,
      email.hourlyLimit,
      email.minDelayMs
    );

  if (!rateLimit.allowed) {
    console.log(
      `⏳ Rate limit reached for sender ${email.senderId}`
    );

    console.log(
      `Reason: ${rateLimit.reason}`
    );

    console.log(
      `⏱️ Rescheduling in ${rateLimit.retryAfterMs}ms`
    );

    /*
     * Notify Slack only when the hourly
     * limit has been reached.
     *
     * slack.service.ts handles:
     * - missing Slack connection
     * - duplicate notifications
     * - Slack API errors
     */
    if (
      rateLimit.reason ===
      "hourly-limit"
    ) {
      await notifyHourlyLimitReached(
        email.senderId,
        email.hourlyLimit
      );
    }

    return {
      rateLimited: true,

      retryAfterMs:
        rateLimit.retryAfterMs,

      reason:
        rateLimit.reason,

      emailId
    };
  }

  /*
   * Mark the email as processing.
   */
  await prisma.email.update({
    where: {
      id: emailId
    },

    data: {
      status: "processing"
    }
  });

  try {
    console.log(
      `📧 Sending email to ${email.recipient}...`
    );

    /*
     * Send email through SMTP.
     */
    const result =
      await sendEmail(
        {
          email:
            email.sender.email,

          smtpHost:
            email.sender.smtpHost,

          smtpPort:
            email.sender.smtpPort,

          smtpUser:
            email.sender.smtpUser,

          smtpPassword:
            email.sender.smtpPassword
        },

        email.recipient,

        email.subject,

        email.body
      );

    /*
     * SMTP succeeded.
     *
     * Now permanently commit the rate-limit
     * reservation and record this timestamp
     * as the last successful send.
     */
    if (rateLimit.reservationId) {
      await commitSendSlot(
        email.senderId,
        rateLimit.reservationId
      );
    }

    const sentAt =
      new Date();

    /*
     * Mark the email as sent.
     */
    await prisma.email.update({
      where: {
        id: emailId
      },

      data: {
        status: "sent",

        sentAt
      }
    });

    console.log(
      `✅ Email sent successfully`
    );

    console.log(
      `📬 Message ID: ${result.messageId}`
    );

    if (result.previewUrl) {
      console.log(
        `🔗 Ethereal Preview: ${result.previewUrl}`
      );
    }

    /*
     * Index successful email in Elasticsearch.
     *
     * userId ensures search results are
     * isolated to the logged-in user.
     */
    await indexEmail({
      id:
        email.id,

      userId:
        email.sender.userId,

      senderId:
        email.senderId,

      senderEmail:
        email.sender.email,

      recipient:
        email.recipient,

      subject:
        email.subject,

      body:
        email.body,

      scheduledAt:
        email.scheduledAt,

      sentAt,

      status:
        "sent"
    });

    return {
      success: true,

      emailId,

      messageId:
        result.messageId,

      previewUrl:
        result.previewUrl
    };
  } catch (error) {
    console.error(
      `❌ Failed to send email ${emailId}:`,
      error
    );

    /*
     * SMTP failed.
     *
     * Release ONLY this email's temporary
     * rate-limit reservation.
     *
     * This means failed SMTP attempts do not
     * consume the sender's hourly quota.
     */
    if (rateLimit.reservationId) {
      await releaseSendSlot(
        email.senderId,
        rateLimit.reservationId
      );
    }

    const failureReason =
      error instanceof Error
        ? error.message
        : "Unknown email sending error";

    /*
     * Record the failure in PostgreSQL.
     */
    await prisma.email.update({
      where: {
        id: emailId
      },

      data: {
        status: "failed",

        failureReason
      }
    });

    /*
     * Index failed email in Elasticsearch.
     */
    await indexEmail({
      id:
        email.id,

      userId:
        email.sender.userId,

      senderId:
        email.senderId,

      senderEmail:
        email.sender.email,

      recipient:
        email.recipient,

      subject:
        email.subject,

      body:
        email.body,

      scheduledAt:
        email.scheduledAt,

      sentAt:
        null,

      status:
        "failed"
    });

    /*
     * Throw the error so BullMQ records
     * the job as failed.
     */
    throw error;
  }
}

/*
 * --------------------------------------------------
 * BULLMQ WORKER
 * --------------------------------------------------
 */

export const emailWorker =
  new Worker(
    "email-queue",

    processEmail,

    {
      connection:
        redis,

      concurrency:
        Number(
          process.env.WORKER_CONCURRENCY ||
            5
        )
    }
  );

/*
 * --------------------------------------------------
 * GRACEFUL WORKER SHUTDOWN
 * --------------------------------------------------
 */

export async function shutdownWorker() {
  console.log(
    "🛑 Shutting down email worker..."
  );

  await emailWorker.close();

  console.log(
    "✅ Email worker stopped"
  );
}

/*
 * --------------------------------------------------
 * COMPLETED JOBS
 * --------------------------------------------------
 *
 * Rate-limited jobs are rescheduled instead
 * of being permanently failed.
 */

emailWorker.on(
  "completed",

  async (
    job,
    result
  ) => {
    console.log(
      `✅ Job completed: ${job.id}`
    );

    if (
      result &&
      typeof result === "object" &&
      "rateLimited" in result &&
      result.rateLimited === true
    ) {
      const retryAfterMs =
        Number(
          result.retryAfterMs
        );

      const emailId =
        String(
          result.emailId
        );

      console.log(
        `🔄 Rescheduling email ${emailId}`
      );

      console.log(
        `⏱️ Retry delay: ${retryAfterMs}ms`
      );

      await emailQueue.add(
        "send-email",

        {
          emailId
        },

        {
          delay:
            retryAfterMs,

          /*
           * Original job already exists,
           * therefore every retry receives
           * a unique BullMQ job ID.
           */
          jobId:
            `${emailId}-retry-${Date.now()}`,

          removeOnComplete:
            false,

          removeOnFail:
            false
        }
      );

      console.log(
        `✅ Email ${emailId} rescheduled`
      );
    }
  }
);

/*
 * --------------------------------------------------
 * FAILED JOBS
 * --------------------------------------------------
 */

emailWorker.on(
  "failed",

  (
    job,
    error
  ) => {
    console.error(
      `❌ BullMQ job failed: ${job?.id}`,

      error
    );
  }
);

/*
 * --------------------------------------------------
 * WORKER ERRORS
 * --------------------------------------------------
 */

emailWorker.on(
  "error",

  (
    error
  ) => {
    console.error(
      "❌ BullMQ worker error:",

      error
    );
  }
);

console.log(
  `🚀 Email worker started with concurrency: ${
    process.env.WORKER_CONCURRENCY ||
    5
  }`
);