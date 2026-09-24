import { Client } from "@elastic/elasticsearch";

const elasticsearchUrl =
  process.env.ELASTICSEARCH_URL || "http://localhost:9200";

const elasticsearchApiKey = process.env.ELASTICSEARCH_API_KEY;

export const esClient = elasticsearchApiKey
  ? new Client({
      node: elasticsearchUrl,
      auth: {
        apiKey: elasticsearchApiKey,
      },
    })
  : new Client({
      node: elasticsearchUrl,
    });

const INDEX_NAME = "emails";

export async function ensureEmailIndex() {
  const exists = await esClient.indices.exists({
    index: INDEX_NAME,
  });

  if (!exists) {
    await esClient.indices.create({
      index: INDEX_NAME,
      mappings: {
        properties: {
          id: { type: "keyword" },
          userId: { type: "keyword" },
          senderId: { type: "keyword" },
          senderEmail: { type: "keyword" },
          recipient: { type: "text" },
          subject: { type: "text" },
          body: { type: "text" },
          scheduledAt: { type: "date" },
          sentAt: { type: "date" },
          status: { type: "keyword" },
          createdAt: { type: "date" },
        },
      },
    });

    console.log(`✅ Elasticsearch index "${INDEX_NAME}" created`);
  }
}

export async function indexEmail(email: {
  id: string;
  userId: string;
  senderId: string;
  senderEmail: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  sentAt?: Date | null;
  status: string;
  createdAt?: Date;
}) {
  await esClient.index({
    index: INDEX_NAME,
    id: email.id,
    document: {
      id: email.id,
      userId: email.userId,
      senderId: email.senderId,
      senderEmail: email.senderEmail,
      recipient: email.recipient,
      subject: email.subject,
      body: email.body,
      scheduledAt: email.scheduledAt,
      sentAt: email.sentAt ?? null,
      status: email.status,
      createdAt: email.createdAt ?? new Date(),
    },
    refresh: "wait_for",
  });
}

export async function searchEmails(
  userId: string,
  query: string
) {
  const result = await esClient.search({
    index: INDEX_NAME,
    query: {
      bool: {
        must: [
          {
            multi_match: {
              query,
              fields: [
                "recipient",
                "subject",
                "body",
                "senderEmail",
              ],
            },
          },
        ],
        filter: [
          {
            term: {
              userId,
            },
          },
        ],
      },
    },
  });

  return result.hits.hits.map((hit) => hit._source);
}