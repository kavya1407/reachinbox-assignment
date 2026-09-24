\# ReachInbox Email Scheduler



A production-oriented full-stack email scheduling application built as part of the ReachInbox Software Development Intern assignment.



The application supports persistent email scheduling, configurable rate limiting, multiple senders, Google authentication, Slack notifications, Elasticsearch search, and a BullMQ monitoring dashboard.



\## Features



\- Google OAuth authentication

\- Redis-backed persistent user sessions

\- Multiple email senders

\- Email scheduling with configurable start time

\- Persistent background processing using BullMQ and Redis

\- Configurable worker concurrency

\- Minimum delay between emails

\- Configurable hourly email rate limit

\- Rate-limited jobs are delayed/rescheduled instead of failed

\- Idempotent email scheduling

\- Ethereal SMTP integration for email delivery

\- Slack OAuth integration

\- Slack notification when the hourly sender limit is reached

\- Elasticsearch indexing and search

\- User-isolated email search

\- Bull Board queue monitoring

\- Scheduled and Sent email views

\- Graceful backend shutdown

\- PostgreSQL persistence using Prisma

\- Docker-based PostgreSQL, Redis and Elasticsearch setup



\## Tech Stack



\### Backend



\- Node.js

\- TypeScript

\- Express.js

\- Prisma

\- PostgreSQL

\- BullMQ

\- Redis

\- Nodemailer

\- Ethereal Email

\- Elasticsearch

\- Slack Web API

\- Google OAuth

\- Bull Board



\### Frontend



\- Next.js

\- React

\- TypeScript

\- Tailwind CSS



\### Infrastructure



\- Docker

\- PostgreSQL

\- Redis

\- Elasticsearch



\## Architecture



```text

&#x20;                   ┌──────────────────────┐

&#x20;                   │      Next.js UI      │

&#x20;                   │   React + TypeScript │

&#x20;                   └──────────┬───────────┘

&#x20;                              │

&#x20;                              ▼

&#x20;                   ┌──────────────────────┐

&#x20;                   │   Express API        │

&#x20;                   │   TypeScript         │

&#x20;                   └──────┬───────┬───────┘

&#x20;                          │       │

&#x20;             ┌────────────┘       └─────────────┐

&#x20;             ▼                                  ▼

&#x20;      ┌─────────────┐                    ┌─────────────┐

&#x20;      │ PostgreSQL  │                    │    Redis    │

&#x20;      │   Prisma    │                    │   BullMQ    │

&#x20;      └─────────────┘                    │   Sessions  │

&#x20;                                         │ Rate Limits │

&#x20;                                         └──────┬──────┘

&#x20;                                                │

&#x20;                                                ▼

&#x20;                                       ┌────────────────┐

&#x20;                                       │ Email Worker   │

&#x20;                                       │   BullMQ       │

&#x20;                                       └───────┬────────┘

&#x20;                                               │

&#x20;                                               ▼

&#x20;                                       ┌────────────────┐

&#x20;                                       │ Ethereal SMTP  │

&#x20;                                       └────────────────┘



&#x20;      ┌─────────────────┐

&#x20;      │  Elasticsearch  │

&#x20;      │ Search / Index  │

&#x20;      └─────────────────┘



&#x20;      ┌─────────────────┐

&#x20;      │ Slack Web API   │

&#x20;      │ Notifications   │

&#x20;      └─────────────────┘



&#x20;      ┌─────────────────┐

&#x20;      │    Bull Board   │

&#x20;      │ Queue Dashboard │

&#x20;      └─────────────────┘

