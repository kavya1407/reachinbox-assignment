import { Client } from "@elastic/elasticsearch";

const client = new Client({
  node:
    process.env.ELASTICSEARCH_URL ||
    "http://localhost:9200"
});

const EMAIL_INDEX = "emails";

interface IndexEmailInput {
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
}

export async function ensureEmailIndex() {
  try {
    const exists =
      await client.indices.exists({
        index: EMAIL_INDEX
      });

    if (!exists) {
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
        `✅ Elasticsearch index "${EMAIL_INDEX}" created`
      );
    }

    /*
     * Make sure userId exists as a keyword field
     * even if the index was created earlier.
     */
    try {
      await client.indices.putMapping({
        index: EMAIL_INDEX,
        properties: {
          userId: {
            type: "keyword"
          }
        }
      });

      console.log(
        "✅ Elasticsearch userId mapping verified"
      );
    } catch (mappingError) {
      console.warn(
        "⚠️ Could not update Elasticsearch userId mapping:",
        mappingError
      );
    }
  } catch (error) {
    console.error(
      "⚠️ Elasticsearch index setup failed:",
      error
    );
  }
}

export async function indexEmail(
  email: IndexEmailInput
) {
  try {
    await client.index({
      index: EMAIL_INDEX,

      id: email.id,

      document: {
        emailId:
          email.id,

        userId:
          email.userId,

        senderId:
          email.senderId,

        senderEmail:
          email.senderEmail,

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
      },

      refresh: "wait_for"
    });

    console.log(
      `🔎 Email indexed in Elasticsearch: ${email.id}`
    );
  } catch (error) {
    console.error(
      `⚠️ Failed to index email ${email.id}:`,
      error
    );
  }
}

export async function searchEmails(
  userId: string,
  query: string
) {
  const result =
    await client.search({
      index: EMAIL_INDEX,

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
                  "senderEmail"
                ]
              }
            }
          ],

          filter: [
            {
              term: {
                userId
              }
            }
          ]
        }
      }
    });

  return result.hits.hits;
}