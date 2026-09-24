import { Client } from "@elastic/elasticsearch";

import { prisma } from "../config/database";

const client = new Client({
  node:
    process.env.ELASTICSEARCH_URL ||
    "http://localhost:9200"
});

const EMAIL_INDEX = "emails";

async function reindexEmails() {
  console.log(
    "🔄 Starting Elasticsearch email reindex..."
  );

  /*
   * Delete the existing index.
   *
   * PostgreSQL remains untouched.
   * Elasticsearch is only a searchable copy.
   */
  const exists =
    await client.indices.exists({
      index: EMAIL_INDEX
    });

  if (exists) {
    await client.indices.delete({
      index: EMAIL_INDEX
    });

    console.log(
      `🗑️ Deleted old "${EMAIL_INDEX}" index`
    );
  }

  /*
   * Create the new index with the correct
   * userId mapping.
   */
  await client.indices.create({
    index: EMAIL_INDEX,

    mappings: {
      properties: {
        emailId: {
          type: "keyword"
        },

        userId: {
          type: "keyword"
        },

        senderId: {
          type: "keyword"
        },

        senderEmail: {
          type: "keyword"
        },

        recipient: {
          type: "keyword"
        },

        subject: {
          type: "text"
        },

        body: {
          type: "text"
        },

        scheduledAt: {
          type: "date"
        },

        sentAt: {
          type: "date"
        },

        status: {
          type: "keyword"
        }
      }
    }
  });

  console.log(
    `✅ Created new "${EMAIL_INDEX}" index`
  );

  /*
   * Load every email from PostgreSQL,
   * including its sender and owner.
   */
  const emails =
    await prisma.email.findMany({
      include: {
        sender: true
      },

      orderBy: {
        createdAt: "asc"
      }
    });

  console.log(
    `📦 Found ${emails.length} emails in PostgreSQL`
  );

  /*
   * Index each email.
   */
  for (const email of emails) {
    await client.index({
      index: EMAIL_INDEX,

      id: email.id,

      document: {
        emailId:
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
          email.sentAt ?? null,

        status:
          email.status
      }
    });

    console.log(
      `🔎 Indexed ${email.id} → ${email.recipient}`
    );
  }

  /*
   * Make newly indexed documents immediately
   * searchable.
   */
  await client.indices.refresh({
    index: EMAIL_INDEX
  });

  console.log(
    `✅ Successfully reindexed ${emails.length} emails`
  );

  await prisma.$disconnect();

  await client.close();

  console.log(
    "🎉 Elasticsearch reindex completed"
  );
}

reindexEmails().catch(
  async (error) => {
    console.error(
      "❌ Elasticsearch reindex failed:",
      error
    );

    await prisma.$disconnect();

    await client.close();

    process.exit(1);
  }
);