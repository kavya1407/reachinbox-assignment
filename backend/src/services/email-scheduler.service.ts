import crypto from "crypto";

import { prisma } from "../config/database";
import { emailQueue } from "../queues/email.queue";
import { indexEmail } from "./elasticsearch.service";

interface ScheduleEmailInput {
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  minDelayMs?: number;
  hourlyLimit?: number;
}

export async function scheduleEmail(
  input: ScheduleEmailInput
) {
  const minDelayMs = Math.max(
    0,
    Math.floor(
      input.minDelayMs ?? 2000
    )
  );

  const hourlyLimit = Math.max(
    1,
    Math.floor(
      input.hourlyLimit ?? 100
    )
  );

  /*
   * Create a deterministic idempotency key.
   *
   * If the exact same email is submitted again,
   * we return the existing email instead of
   * creating another BullMQ job.
   */
  const idempotencySource = [
    input.senderId,
    input.recipient
      .trim()
      .toLowerCase(),
    input.subject.trim(),
    input.body,
    input.scheduledAt.toISOString()
  ].join("|");

  const idempotencyKey =
    crypto
      .createHash("sha256")
      .update(idempotencySource)
      .digest("hex");

  /*
   * Check whether this email was already scheduled.
   */
  const existingEmail =
    await prisma.email.findUnique({
      where: {
        idempotencyKey
      }
    });

  if (existingEmail) {
    console.log(
      `♻️ Existing email returned for ${input.recipient}`
    );

    return existingEmail;
  }

  /*
   * Find the sender.
   *
   * We need sender.userId here because
   * Elasticsearch must associate every
   * email with the logged-in user's account.
   */
  const sender =
    await prisma.sender.findUnique({
      where: {
        id: input.senderId
      }
    });

  if (!sender) {
    throw new Error(
      `Sender ${input.senderId} not found`
    );
  }

  /*
   * Create the email record in PostgreSQL.
   */
  const email =
    await prisma.email.create({
      data: {
        senderId:
          input.senderId,

        recipient:
          input.recipient
            .trim()
            .toLowerCase(),

        subject:
          input.subject.trim(),

        body:
          input.body,

        scheduledAt:
          input.scheduledAt,

        idempotencyKey,

        minDelayMs,

        hourlyLimit
      }
    });

  /*
   * Calculate how long BullMQ should wait
   * before processing this email.
   */
  const delay = Math.max(
    0,
    input.scheduledAt.getTime() -
      Date.now()
  );

  /*
   * Add the email to BullMQ.
   *
   * The email ID is also used as the BullMQ
   * job ID to provide another layer of
   * idempotency.
   */
  const job =
    await emailQueue.add(
      "send-email",
      {
        emailId:
          email.id
      },
      {
        delay,

        jobId:
          email.id,

        removeOnComplete:
          false,

        removeOnFail:
          false
      }
    );

  /*
   * Store the BullMQ job ID in PostgreSQL.
   */
  await prisma.email.update({
    where: {
      id: email.id
    },

    data: {
      bullJobId:
        job.id
    }
  });

  /*
   * Index the scheduled email in Elasticsearch.
   *
   * IMPORTANT:
   * userId is included so search results
   * can later be restricted to the currently
   * authenticated user.
   */
  await indexEmail({
    id:
      email.id,

    userId:
      sender.userId,

    senderId:
      email.senderId,

    senderEmail:
      sender.email,

    recipient:
      email.recipient,

    subject:
      email.subject,

    body:
      email.body,

    scheduledAt:
      email.scheduledAt,

    sentAt:
      email.sentAt,

    status:
      email.status
  });

  console.log(
    `📅 Email scheduled`
  );

  console.log(
    `   To: ${email.recipient}`
  );

  console.log(
    `   At: ${email.scheduledAt.toISOString()}`
  );

  console.log(
    `   Delay: ${minDelayMs}ms`
  );

  console.log(
    `   Hourly limit: ${hourlyLimit}`
  );

  console.log(
    `   User ID: ${sender.userId}`
  );

  return email;
}