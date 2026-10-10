# Distributed Task Processing Platform

A backend system for asynchronous job submission, queue-based task processing, persistent job tracking, and independent worker execution. Built with Fastify, TypeScript, PostgreSQL, Prisma, and Redis.

## Overview

The Distributed Task Processing Platform allows authenticated users to submit tasks through a REST API and track their execution status. Jobs are persisted in PostgreSQL and their IDs are published to a Redis queue, where independent worker processes consume and execute them.

The project focuses on backend engineering concepts such as asynchronous processing, database persistence, JWT authentication, separation of concerns, worker management, and distributed-system reliability.

## Architecture

```text
                    Client
                       |
                       v
                Fastify REST API
                       |
              +--------+--------+
              |                 |
              v                 v
       Authentication       Jobs API
              |                 |
              v                 v
          AuthService       JobsService
              |                 |
              v                 v
        AuthRepository    JobsRepository
              |                 |
              +--------+--------+
                       |
                       v
                  PostgreSQL
                       |
              Persistent Job State
                       |
                       v
                   Redis Queue
                       |
                       v
                Independent Worker
                       |
                       v
                  Task Executor
                       |
                       v
            Update Job Result/Status
```

### Job lifecycle

```text
QUEUED → PROCESSING → COMPLETED
                   ↘ FAILED
```

The worker updates job status and stores execution results in PostgreSQL. Additional lifecycle states are defined in the database schema for future reliability features.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| API framework | Fastify |
| Database | PostgreSQL |
| ORM | Prisma |
| Queue | Redis |
| Authentication | JWT |
| Password hashing | bcrypt |
| Request validation | Zod |
| Testing | Vitest |
| Infrastructure | Docker Compose |

## Features Implemented

### 1. API Foundation
- Fastify server with a modular application structure.
- Environment-based configuration.
- PostgreSQL and Redis connections.
- Health endpoint for checking service availability.
- Centralized application container for dependency wiring.

### 2. Authentication
- User registration and login.
- Password hashing with bcrypt.
- JWT access-token generation and verification.
- Request validation with Zod.
- Duplicate-registration handling.
- Consistent handling of invalid credentials.

### 3. Job Management
- Authenticated job submission.
- Persistent job records in PostgreSQL.
- Support for multiple job types:
  - `CPU_TASK`
  - `IO_TASK`
  - `DOCUMENT_PROCESSING`
  - `WEBHOOK`
- JSON task payloads.
- Job priority validation from 1 to 10.
- Optional scheduled execution timestamp.
- Job retrieval by ID.
- User ownership enforcement: users cannot retrieve other users' jobs.

### 4. Redis Queue
- Redis-backed job queue.
- Job IDs are enqueued after job records are created.
- Blocking queue consumption using Redis `BLPOP`.
- Separation of job persistence from asynchronous execution.

### 5. Independent Worker
- Worker runs separately from the Fastify API.
- Consumes job IDs from Redis.
- Retrieves job records from PostgreSQL.
- Updates jobs to `PROCESSING`.
- Executes tasks through a task executor.
- Persists successful results and marks jobs `COMPLETED`.
- Handles execution errors by marking jobs `FAILED`.

### 6. Worker Monitoring Foundation
- Worker registration in PostgreSQL.
- Heartbeat updates.
- Worker statuses: `HEALTHY`, `UNHEALTHY`, and `DRAINING`.
- Initial stale-heartbeat detection logic.
- Initial service for recovering jobs assigned to unhealthy workers.

**Reliability note:** automated recovery orchestration, race-free job claiming, crash-safe queue/database consistency, and complete graceful shutdown are still in progress.

## API Reference

Base URL:

```text
http://localhost:3000
```

### Health Check

`GET /api/v1/health`

Checks API and backing-service availability.

### Register

`POST /api/v1/auth/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123"
}
```

Returns the created user and an authentication token. The password hash is stored in the database; the plaintext password is not returned.

### Login

`POST /api/v1/auth/login`

Request:

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123"
}
```

Returns the authenticated user and JWT.

### Submit a Job

`POST /api/v1/jobs`

Requires:

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

Request:

```json
{
  "type": "CPU_TASK",
  "payload": {
    "operation": "calculate",
    "value": 100
  },
  "priority": 5
}
```

Returns the created job, initially with status `QUEUED`. The job ID is also published to Redis for worker consumption.

### Retrieve a Job

`GET /api/v1/jobs/:id`

Requires a valid JWT.

Returns the job if it belongs to the authenticated user. Otherwise, the API returns `404 Not Found`.

## Database Design

The Prisma schema defines the following entities:

| Entity | Purpose |
|---|---|
| `User` | User identity and password hash |
| `Job` | Job payload, status, priority, result, and ownership |
| `JobAttempt` | Individual execution-attempt records |
| `Worker` | Worker identity, status, and heartbeat |
| `IdempotencyKey` | Idempotency-key records for preventing duplicate submissions |

Job statuses defined in the schema:

- `QUEUED`
- `PROCESSING`
- `COMPLETED`
- `FAILED`
- `RETRYING`
- `CANCELLED`
- `DEAD_LETTER`

Additional lifecycle states are defined in the schema but are not all wired into the execution flow yet.

## Project Structure

```text
distributed-task-platform/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── infrastructure/
│   │   ├── auth/
│   │   ├── database/
│   │   ├── queue/
│   │   └── redis/
│   ├── modules/
│   │   ├── auth/
│   │   └── jobs/
│   ├── worker/
│   │   ├── task.executor.ts
│   │   ├── worker.ts
│   │   ├── worker.service.ts
│   │   ├── worker.repository.ts
│   │   ├── worker.heartbeat.ts
│   │   ├── worker.failure-detector.ts
│   │   └── job-recovery.service.ts
│   ├── app.ts
│   ├── container.ts
│   └── server.ts
├── test/
│   ├── auth.integration.test.ts
│   ├── health.integration.test.ts
│   ├── jobs.integration.test.ts
│   └── setup.ts
├── docker-compose.yml
├── prisma.config.ts
├── vitest.config.ts
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
└── README.md
```

The exact file list may evolve as the project develops.

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- Docker Desktop
- Git

### 1. Clone the repository

```bash
git clone https://github.com/bilalsadiq03/distributed-task-processing.git
cd distributed-task-platform
```

Use the actual directory created by Git if it differs from the example.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example file:

```powershell
Copy-Item .env.example .env
```

Configure the values for your local environment:

```env
NODE_ENV=development
API_HOST=0.0.0.0
API_PORT=3000

DATABASE_URL=postgresql://task_user:YOUR_PASSWORD@localhost:5432/task_platform

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
```

**Important:** use the database name, username, and password configured in your `docker-compose.yml`. The example above assumes the database is named `task_platform`.

Never commit `.env` or production secrets to GitHub.

### 4. Start PostgreSQL and Redis

```bash
docker compose up -d
```

Verify the containers:

```bash
docker compose ps
```

### 5. Apply database migrations

```bash
npx prisma migrate deploy
```

For local development when creating a new migration, use:

```bash
npx prisma migrate dev
```

### 6. Start the API server

```bash
npm run dev
```

The API should be available at:

```text
http://localhost:3000
```

### 7. Start the worker

Open another terminal in the project directory:

```bash
npm run worker
```

The API and worker run as separate processes.

## Testing

Run the production TypeScript build:

```bash
npm run build
```

Run the test suite:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

The current integration tests cover:

- Health endpoint.
- User registration and invalid credentials.
- Request validation.
- Authenticated job submission.
- Rejection of unauthenticated requests.
- Job retrieval.
- User-level job ownership.

Tests use the configured database and service environment, so ensure PostgreSQL and Redis are available when running integration tests.

## Current Limitations

This is an actively developed project. The following capabilities are not yet fully implemented:

- Exponential retry scheduling.
- Dead-letter queue processing.
- Crash-safe recovery with atomic database/queue coordination.
- Concurrency-safe job claiming and stale-worker fencing.
- Idempotency enforcement on job submission.
- Priority-aware and delayed scheduling.
- Job cancellation.
- Fully implemented execution-attempt tracking.
- Complete graceful shutdown and in-flight job recovery.
- Distributed rate limiting and caching.
- Prometheus/Grafana observability.
- Load testing and production deployment automation.

The database schema contains foundations for several of these capabilities, but schema definitions alone do not mean the corresponding behavior is complete.

## Roadmap

### Phase 1 — Foundation
- [x] Fastify and TypeScript setup
- [x] PostgreSQL and Prisma
- [x] Redis connection
- [x] Database schema and migrations
- [x] Health endpoint

### Phase 2 — Authentication
- [x] Registration and login
- [x] Password hashing
- [x] JWT authentication
- [x] Request validation

### Phase 3 — Jobs API
- [x] Authenticated job submission
- [x] Job persistence
- [x] Job status retrieval
- [x] User ownership enforcement

### Phase 4 — Queue and Worker
- [x] Redis queue integration
- [x] Independent worker process
- [x] Task execution
- [x] Completion and failure status updates
- [x] Worker registration and heartbeat foundation
- [ ] Dedicated failure-monitoring process
- [ ] Reliable recovery of interrupted jobs
- [ ] Race-free job claiming and graceful shutdown

### Phase 5 — Reliability
- [ ] Exponential retries
- [ ] Dead-letter queue
- [ ] Idempotency
- [ ] Priority and delayed jobs
- [ ] Cancellation
- [ ] Execution-attempt tracking

### Phase 6 — Production Readiness
- [ ] Rate limiting and caching
- [ ] Structured observability and metrics
- [ ] Failure and concurrency testing
- [ ] Load testing
- [ ] CI/CD and deployment

## Engineering Principles

The project is being developed around the following principles:

- **Separation of concerns:** routes, services, repositories, queue infrastructure, and workers have distinct responsibilities.
- **Persistent state:** PostgreSQL is the source of truth for jobs and their statuses.
- **Asynchronous processing:** the API submits work without executing the task inline.
- **Independent scaling:** API and worker processes can be scaled separately.
- **Security:** password hashing, JWT verification, input validation, and resource ownership checks.
- **Reliability:** retries, recovery, idempotency, and observability are planned as explicit engineering features rather than assumptions.


