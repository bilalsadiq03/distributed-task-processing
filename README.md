# Distributed Task Processing Platform

A distributed background job processing system built with **Fastify, TypeScript, PostgreSQL, Prisma, Redis, and Vitest**. The platform accepts asynchronous jobs through a REST API, distributes work across independent workers, persists job state, and recovers work after worker failures.

It demonstrates reliability fundamentals including a transactional outbox, atomic job claiming, retries with exponential backoff, dead-letter handling, worker health monitoring, and crash recovery.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Job Lifecycle](#job-lifecycle)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Platform](#running-the-platform)
- [API Reference](#api-reference)
- [Reliability and Failure Handling](#reliability-and-failure-handling)
- [Testing](#testing)
- [Project Structure](#project-structure)
- [Current Limitations](#current-limitations)
- [Future Improvements](#future-improvements)

## Overview

Applications often need to execute work without blocking an HTTP request, such as data processing, report generation, or other resource-intensive tasks. This platform separates job submission from execution:

1. A client submits a job through the REST API.
2. The API persists the job and an associated outbox event in PostgreSQL.
3. The outbox dispatcher publishes eligible events to Redis.
4. Independent workers consume job IDs from Redis.
5. A worker atomically claims a job in PostgreSQL before executing it.
6. The job status and execution attempts are persisted.
7. Failed jobs can be retried with exponential backoff and eventually moved to a dead-letter state.
8. Monitoring detects unhealthy workers and recovers their unfinished jobs.

**PostgreSQL is the source of truth for job state. Redis is used for delivery, not as the authoritative record of job completion.**

## Architecture

```text
                         Client
                           |
                           v
                    Fastify REST API
                           |
                           v
                     PostgreSQL
             +-------------+-------------+
             | Jobs | Attempts | Workers |
             |       Outbox Events       |
             +-------------+-------------+
                           |
                           v
                  Outbox Dispatcher
                           |
                           v
                         Redis
                    Job ID Queue
                           |
              +------------+------------+
              |            |            |
              v            v            v
          Worker A      Worker B      Worker C
              |            |            |
              +------------+------------+
                           |
                           v
                     PostgreSQL
                  Claim and update jobs
                           ^
                           |
                 Worker Monitoring
                 and Job Recovery
```

### Main components

| Component | Responsibility |
|---|---|
| Fastify API | Accepts requests, validates input, handles authentication, and exposes job status |
| PostgreSQL | Persists jobs, attempts, workers, and outbox events |
| Prisma | Database access and transaction support |
| Redis | Delivers job IDs to workers |
| Outbox dispatcher | Publishes persisted outbox events to Redis |
| Worker | Claims jobs, executes tasks, and records outcomes |
| Heartbeat and failure detector | Tracks worker health and identifies stale workers |
| Job recovery service | Requeues eligible jobs owned by unhealthy workers |
| Retry scheduler | Makes due retries eligible for processing |
| Vitest | Runs automated integration and reliability tests |

## Job Lifecycle

```text
       +--------+      +------------+      +-----------+
       | QUEUED | ---> | PROCESSING | ---> | COMPLETED |
       +--------+      +------------+      +-----------+
                            |
                            | Failure
                            v
                      +-----------+
                      | RETRYING  |
                      +-----------+
                            |
                       Retry is due
                            |
                            v
                         QUEUED

       After retry limit is exhausted: DEAD_LETTER
       After eligible worker recovery: QUEUED
```

Supported status values include `QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`, `RETRYING`, `CANCELLED`, and `DEAD_LETTER`. Not every status has a fully implemented transition or API operation; see [Current Limitations](#current-limitations).

## Features

### Asynchronous job submission

Clients submit jobs through the REST API without executing the task inside the request lifecycle.

### Transactional outbox

The job record and its outbox event are created together in a PostgreSQL transaction. The dispatcher claims eligible events using PostgreSQL row locking with `SKIP LOCKED`, publishes them to Redis, and tracks publication attempts and leases.

### Independent workers and atomic claiming

Workers run as separate processes and can operate concurrently. Conditional database updates ensure that only one worker can successfully claim a queued job through the normal claim path. Completion updates are checked against the current assignment and attempt so stale workers cannot overwrite a reassigned job's result.

### Retries and dead-letter handling

Failed tasks can be retried with exponential backoff. The configured policy uses an initial delay of **1 second**, a maximum delay of **30 seconds**, and a default maximum of **3 retries**. That means a consistently failing job can execute four times: one initial attempt plus three retries. When retries are exhausted, the job transitions to `DEAD_LETTER`.

### Worker health monitoring and crash recovery

Workers periodically update their heartbeat. The failure detector identifies stale workers, and the recovery service finds unfinished jobs assigned to unhealthy workers, returns eligible jobs to the queueable state, closes interrupted attempts, and creates outbox events for redispatch.

### Graceful shutdown

Workers can receive a shutdown request and stop accepting new work. A bounded Redis blocking wait allows the worker loop to check whether shutdown has been requested.

### Automated tests

The suite covers API behavior and reliability scenarios such as job claiming, retries, dead-letter transitions, worker failure detection, and recovery.

## Technology Stack

| Technology | Purpose |
|---|---|
| TypeScript | Type-safe application code |
| Node.js | Runtime |
| Fastify | REST API framework |
| PostgreSQL | Persistent storage |
| Prisma | ORM and database access |
| Redis | Queue delivery |
| Docker Compose | Local infrastructure |
| Vitest | Automated testing |
| Zod | Request validation |
| JWT | Authentication |
| bcrypt | Password hashing |

## Getting Started

### Prerequisites

- Node.js and npm
- Docker Desktop with Docker Compose
- Git

### 1. Clone the repository

```bash
git clone https://github.com/bilalsadiq03/distributed-task-processing.git
cd distributed-task-processing
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file from the example:

```powershell
Copy-Item .env.example .env
```

Update `.env` with your local settings. Use a strong, private `JWT_SECRET`, and never commit `.env`.

### 4. Start PostgreSQL and Redis

```bash
docker compose up -d
docker compose ps
```

### 5. Apply database migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### 6. Build and test

```bash
npm run build
npm test
```

The integration tests require reachable PostgreSQL and Redis services configured for the test environment.

## Environment Variables

Configure the values used by your application in `.env`. The names below reflect the expected configuration; verify them against `.env.example` in the repository.

| Variable | Description |
|---|---|
| `NODE_ENV` | Application environment |
| `API_HOST` | Host interface used by the API server |
| `API_PORT` | Port used by the API server |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `JWT_SECRET` | Secret used to sign and verify JWTs |

For Docker Compose, ensure hostnames and ports match the service configuration. Processes running directly on your machine need connection settings reachable from the host.

## Running the Platform

Start each process in a separate terminal after PostgreSQL and Redis are running.

### Terminal 1: REST API

```bash
npm run dev
```

### Terminal 2: Worker

```bash
npm run worker
```

Start additional worker processes in separate terminals to exercise concurrent processing.

### Terminal 3: Outbox dispatcher

```bash
npm run dispatcher
```

### Terminal 4: Monitoring and recovery

```bash
npm run monitor
```

The monitoring process checks worker heartbeats, recovers jobs from unhealthy workers, and schedules due retries.

### Available npm scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the API in development mode |
| `npm run worker` | Start a worker process |
| `npm run dispatcher` | Start the outbox dispatcher |
| `npm run monitor` | Start monitoring, recovery, and retry scheduling |
| `npm run build` | Compile TypeScript |
| `npm start` | Run the compiled API |
| `npm test` | Run the test suite |
| `npm run test:watch` | Run tests in watch mode |

## API Reference

The API uses the `/api/v1` prefix.

### Health check

```http
GET /api/v1/health
```

Checks the API health endpoint.

### Register a user

```http
POST /api/v1/auth/register
Content-Type: application/json
```

Register using the fields defined by the authentication route schema. Passwords are stored as hashes rather than plain text.

### Log in

```http
POST /api/v1/auth/login
Content-Type: application/json
```

Authenticates a user and returns a token when credentials are valid.

### Submit a job

```http
POST /api/v1/jobs
Content-Type: application/json
Authorization: Bearer <token>
```

Submit a job using the fields accepted by the job creation schema. Example payload:

```json
{
  "type": "CPU_TASK",
  "priority": 5,
  "payload": {
    "message": "Process this task"
  }
}
```

The request must satisfy the API validation rules. A successful submission returns the created job information.

### Get a job

```http
GET /api/v1/jobs/:id
Authorization: Bearer <token>
```

Retrieves the status and available details of a job. Refer to the implemented routes and schemas for exact request and response formats.

## Reliability and Failure Handling

### Transactional consistency

A job and its outbox event are persisted in the same database transaction. This avoids depending on a separate database write and Redis operation both succeeding together.

### At-least-once delivery

The outbox and recovery design supports at-least-once delivery. Events or jobs may be delivered more than once, so queue delivery is not treated as proof that a task executed exactly once.

### Worker claim fencing

Workers must successfully claim a queued job before processing it. Result updates are conditional on the job's current state and worker assignment. This helps prevent stale workers from overwriting newer results, but it does not guarantee exactly-once execution of arbitrary external side effects. Tasks that interact with external systems may need their own idempotency mechanisms.

### Retry behavior

Failed attempts are recorded. If retries remain, the job is scheduled for a later attempt. The retry scheduler makes due jobs queueable and creates the outbox event required for redispatch.

### Worker recovery

When a worker becomes unhealthy, the recovery service identifies jobs still marked as processing under that worker. Eligible jobs are returned to the queueable state and published for another worker to claim. Conditional database updates help prevent concurrent recovery attempts from blindly reassigning jobs whose state has already changed.

### Redis queue semantics

The main Redis list is:

```text
task-processing
```

Workers use per-worker processing lists:

```text
task-processing:processing:<worker-id>
```

The worker moves a job ID into its processing list while dequeuing, then removes it after processing. **A queue length of zero does not necessarily mean no work is active:** jobs may be in per-worker processing lists or executing in a worker process.

PostgreSQL remains the source of truth for job status.

## Testing

Run the test suite:

```bash
npm test
```

Compile TypeScript:

```bash
npm run build
```

Validate the Prisma schema:

```bash
npx prisma validate
```

The integration tests use PostgreSQL and Redis. Ensure both services are available with the correct environment configuration before running the suite.

### Test coverage

The current suite includes tests for:

- Authentication endpoints
- Health endpoint
- Job creation and retrieval
- Outbox dispatcher behavior and locking
- Retry scheduling and exponential backoff
- Dead-letter transitions after retries are exhausted
- Worker claim concurrency
- Protection against stale worker completion
- Worker failure detection
- Recovery of processing jobs assigned to unhealthy workers

The tests cover important reliability paths but do not exhaustively validate every failure scenario or production-scale behavior.

## Project Structure

```text
distributed-task-processing/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── infrastructure/
│   │   ├── database/
│   │   └── queue/
│   │       ├── job.queue.ts
│   │       └── outbox-dispatcher.ts
│   ├── modules/
│   │   ├── auth/
│   │   └── jobs/
│   ├── scripts/
│   └── worker/
│       ├── job-recovery.service.ts
│       ├── task.executor.ts
│       ├── worker.failure-detector.ts
│       ├── worker.heartbeat.ts
│       ├── worker.repository.ts
│       ├── worker.service.ts
│       ├── worker.ts
│       ├── retry-scheduler.ts
│       └── monitor.ts
├── test/
│   ├── auth.integration.test.ts
│   ├── health.integration.test.ts
│   ├── jobs.integration.test.ts
│   ├── outbox-dispatcher.integration.test.ts
│   ├── reliability.integration.test.ts
│   ├── worker-concurrency.integration.test.ts
│   ├── worker-failure-detector.integration.test.ts
│   └── setup.ts
├── docker-compose.yml
├── prisma.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

The exact file organization may evolve as implementation develops.

## Current Limitations

This is an actively developed learning and portfolio project. The following capabilities are not fully implemented:

- **Idempotent job submission:** an idempotency-key table is reserved, but duplicate submission prevention is not wired into the API.
- **Priority scheduling:** priority is persisted, but priority-aware queue ordering is not implemented.
- **Cancellation API:** cancellation states may exist in the data model, but a complete cancellation API and execution protocol are not implemented.
- **General delayed-job API:** scheduling fields and retry scheduling exist, but a general-purpose delayed-job submission feature is not fully exposed.
- **Redis reconciliation:** startup and recovery logic handle important in-flight scenarios, but comprehensive reconciliation for every possible stale or missing Redis entry is not a production-grade guarantee.
- **Exactly-once side effects:** the platform does not guarantee exactly-once execution of arbitrary external side effects.
- **Observability:** monitoring relies primarily on application logs and database-backed worker heartbeats. A full metrics, dashboard, and alerting stack is not included.
- **Production deployment:** high availability, distributed Redis configuration, secrets management, capacity planning, and production load testing remain future work.

## Engineering Principles

1. **Persist before publishing:** use the transactional outbox to avoid losing the intent to publish a job.
2. **Treat the database as authoritative:** Redis delivery state is not the source of truth for job status.
3. **Make state transitions conditional:** workers and recovery processes should only update jobs that match the expected state.
4. **Expect failures:** workers can crash, messages can be delivered more than once, and infrastructure operations can fail.
5. **Retry deliberately:** use bounded retries and backoff rather than retrying indefinitely.
6. **Test failure paths:** verify concurrency, stale workers, retries, and recovery as well as successful execution.
7. **Document limitations honestly:** distinguish implemented behavior from planned features.

## Future Improvements

- Enforce idempotency keys during job submission.
- Implement priority-aware scheduling.
- Add a complete cancellation protocol.
- Improve stale Redis entry reconciliation.
- Add structured logs, metrics, dashboards, and alerting.
- Add load and fault-injection tests.
- Add deployment automation and production-oriented configuration.
- Document operational procedures for dead-letter inspection and recovery.

---

**Built with TypeScript, Fastify, PostgreSQL, Prisma, and Redis.**
