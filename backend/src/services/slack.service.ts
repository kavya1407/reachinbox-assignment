import { WebClient } from "@slack/web-api";

import { prisma } from "../config/database";
import { redis } from "../config/redis";

export async function notifyHourlyLimitReached(
  senderId: string,
  limit: number
) {
  try {
    const sender =
      await prisma.sender.findUnique({
        where: {
          id: senderId
        },
        include: {
          user: {
            include: {
              slack: true
            }
          }
        }
      });

    if (!sender) {
      console.warn(
        `⚠️ Slack notification skipped: sender ${senderId} not found`
      );

      return;
    }

    const slackConnection =
      sender.user.slack;

    if (!slackConnection) {
      console.log(
        `ℹ️ Slack not connected for user ${sender.user.email}`
      );

      return;
    }

    /*
     * Prevent duplicate Slack notifications.
     *
     * Only one notification is allowed for
     * a sender during the current hour.
     */
    const currentHour =
      Math.floor(
        Date.now() / 3600000
      );

    const notificationKey =
      `slack-hourly-limit:${senderId}:${currentHour}`;

    const secondsUntilHourEnds =
      Math.max(
        1,
        Math.ceil(
          (
            (currentHour + 1) *
              3600000 -
            Date.now()
          ) / 1000
        )
      );

    const notificationLock =
      await redis.set(
        notificationKey,
        "1",
        "EX",
        secondsUntilHourEnds,
        "NX"
      );

    if (notificationLock !== "OK") {
      console.log(
        `ℹ️ Slack notification already sent for ${sender.email} during this hour`
      );

      return;
    }

    const client =
      new WebClient(
        slackConnection.accessToken
      );

    let channelId =
      slackConnection.channelId;

    /*
     * If the user has not selected a channel,
     * find a public channel where the bot is a member.
     */
    if (!channelId) {
      const result =
        await client.conversations.list({
          types: "public_channel",
          exclude_archived: true,
          limit: 100
        });

      const channels =
        result.channels || [];

      const channel =
        channels.find(
          (item) =>
            item.is_member
        );

      if (!channel?.id) {
        console.warn(
          "⚠️ No Slack channel available for notifications"
        );

        return;
      }

      channelId =
        channel.id;

      await prisma.slackConnection.update({
        where: {
          userId:
            sender.userId
        },
        data: {
          channelId
        }
      });

      console.log(
        `📢 Slack channel selected: ${channel.name}`
      );
    }

    await client.chat.postMessage({
      channel: channelId,
      text:
        `🚨 Email hourly limit reached\n\n` +
        `Sender: ${sender.email}\n` +
        `Hourly limit: ${limit}\n\n` +
        `New emails have been rescheduled until the next available window.`
    });

    console.log(
      `✅ Slack notification sent for ${sender.email}`
    );
  } catch (error) {
    console.error(
      "⚠️ Slack notification failed:",
      error
    );
  }
}