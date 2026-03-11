# BPM Engine - Accomplishments Summary

## Date: March 11, 2026

---

## What We Built

A generic BPM (Business Process Management) orchestration engine exposed as an autonomous HTTP service, consumable by multiple applications of different nature (HR, e-commerce, banking, support, etc.) regardless of their backend language.

---

## Architecture

```
[App Cliente (any language)]
│
│ POST /api/v1/workflow/execute
│ Authorization: Bearer bpm_live_xxxxx
│
[BPM ENGINE — Autonomous HTTP Service]
│
├── Phase 1: Reception + Validation
├── Phase 2: Dispatcher + Init Context
├── Phase 3: Workflow Execution
└── Phase 4: Notification + Archive

[Backend Client — executes its own business logic]
```

The engine ORCHESTRATES. The client backends EXECUTE.
The engine NEVER knows the business logic of the applications.

---

## Completed Steps

### ✅ Step 1: Project Skeleton

**Files Created:**
- `package.json` - Dependencies: fastify, @fastify/static, prisma, bullmq, ioredis, zod, nodemailer, vitest
- `tsconfig.json` - TypeScript 5.x config
- `docker-compose.yml` - PostgreSQL + Valkey + BPM Engine
- `.env.example` - Environment variables template
- `.env` - Local environment variables
- `Dockerfile` - Production image
- `src/main.ts` - Fastify entry point serving /api/v1 and /admin
- `prisma/schema.prisma` - Database tables

**Database Tables:**
- `ApiClient` - Client applications
- `ApiKey` - API keys (hashed)
- `WorkflowRegistry` - Workflow definitions (JSONB)
- `WorkflowExecution` - Execution states
- `WorkflowEvent` - Event store
- `AccessLog` - Audit trail
- `IdempotencyKey` - Idempotency keys

---

### ✅ Step A: API Key Authentication

**Files Created:**
- `src/services/ApiKeyService.ts` - Key generation, SHA-256 hashing, verification
- `src/middleware/auth.middleware.ts` - API Key validation for /api/v1/*
- `src/middleware/adminAuth.middleware.ts` - Admin secret validation for /admin/api/*
- `src/api/routes/admin.routes.ts` - CRUD for clients, keys, stats

**Security Features:**
- Keys generated with `crypto.randomBytes()` (cryptographically secure)
- Keys hashed with SHA-256 before storage (never stored in plain text)
- Key prefix (10-12 chars) shown for user reference
- Revocation with timestamp
- Timing-safe comparison for admin secret

**Authentication Architecture:**
```
/admin/api/*    → protected by X-Admin-Secret (ADMIN_SECRET)
/api/v1/*       → protected by Bearer token (bpm_live_xxx)
```

---

### ✅ Step B: Registry + Context

**Files Created:**
- `src/core/WorkflowRegistry.ts` - Workflow registration, resolution, in-memory cache
- `src/core/ExecutionContext.ts` - Context object with execution_id, results Map, metadata Map
- `src/services/IdempotencyService.ts` - Redis/PostgreSQL idempotency with configurable TTL
- `src/api/routes/registry.routes.ts` - POST /api/v1/registry/register, GET /api/v1/registry/:type

**Features:**
- UPSERT pattern to avoid race conditions
- In-memory cache with database fallback
- Automatic re-hydration on server restart
- TTL configurable via `IDEMPOTENCY_TTL_SECONDS` (default: 7 days)
- Zod validation for workflow definitions

**Validation:**
- auto type requires url
- human type requires actor and decisions
- condition type requires evaluate and branches

---

### ✅ Step C: Pipeline Complete

**Files Created:**
- `src/phases/phase2-validation/GuardChain.ts` - AuthGuard, SchemaGuard, SanitizeGuard, RateLimitGuard
- `src/phases/phase3-execution/AutoStepExecutor.ts` - POST to backend + retry with exponential backoff
- `src/phases/phase3-execution/HumanStepExecutor.ts` - suspend + email + BullMQ delay
- `src/core/PipelineRunner.ts` - orchestrates all step types + Saga rollback
- `src/api/routes/workflow.routes.ts` - execute, status, resume endpoints

**Features:**
- Exponential backoff retry: `delay * 2^attempt` (1s, 2s, 4s...)
- Retry stops immediately on `retryable: false`
- Saga rollback in reverse order of completed steps
- Human step suspend with notifications and timeout scheduling
- Resume reads decisions from Registry (not stored result) - bug fix applied

**Bug Fix Applied:**
- HumanStepExecutor.resume() now reads `decisions` from `WorkflowRegistry` (source of truth)
- Previously read from `execution.result` which could be stale if workflow was updated

---

## API Endpoints

### Admin Endpoints (X-Admin-Secret required)
```
POST   /admin/api/clients              → Create client
GET    /admin/api/clients              → List clients
GET    /admin/api/clients/:id          → Get client details
DELETE /admin/api/clients/:id          → Delete client
POST   /admin/api/clients/:id/keys    → Generate API key
DELETE /admin/api/clients/:id/keys/:keyId → Revoke key
GET    /admin/api/stats               → Dashboard stats
```

### Registry Endpoints (API Key required)
```
POST   /api/v1/registry/register       → Register workflow (Zod validated)
GET    /api/v1/registry/:type        → Get workflow definition
GET    /api/v1/registry/             → List all workflows
```

### Public API Endpoints (API Key required)
```
POST   /api/v1/workflow/execute        → Execute workflow
GET    /api/v1/workflow/:id            → Get execution status
POST   /api/v1/workflow/:id/resume     → Resume after human step
```

---

## Tests Passed

### Step A Tests
| Test | Result |
|------|--------|
| Create client | ✅ PASS |
| Generate API Key (bpm_live_xxx) | ✅ PASS |
| Key NOT in plain text (only prefix shown) | ✅ PASS |
| Route without key → 401 | ✅ PASS |
| Route with fake key → 401 | ✅ PASS |
| Route with valid key | ✅ PASS |
| Unauthorized type → 403 | ✅ PASS |
| Revoked key → 401 | ✅ PASS |

### Step B Tests
| Test | Result |
|------|--------|
| Register valid workflow | ✅ PASS |
| Get workflow by type | ✅ PASS |
| Update workflow (UPSERT) | ✅ PASS |
| Unknown type → 404 | ✅ PASS |
| Invalid workflow (auto without url) → 400 | ✅ PASS |
| Invalid workflow (human without decisions) → 400 | ✅ PASS |
| Workflows loaded at startup | ✅ PASS |
| No duplicates in database | ✅ PASS |

### Step B Audits
| Check | Result |
|-------|--------|
| JSONB for workflowDef | ✅ PASS |
| Unique constraint on type | ✅ PASS |
| JSONB queries work | ✅ PASS |
| IdempotencyKey table exists | ✅ PASS |
| UPSERT prevents race conditions | ✅ PASS |
| loadWorkflowsToMemory() called at startup | ✅ PASS |
| TTL 7 days (604800 seconds) | ✅ PASS |

### Step C Tests (Manual curl)
| Test | Result |
|------|--------|
| 1. Register auto workflow (order) | ✅ PASS |
| 2. Execute workflow | ✅ PASS (~1.3s) |
| 3. Check status - COMPLETED | ✅ PASS |
| 4. Idempotency - same execution_id | ✅ PASS |
| 5. Unknown type → 404 | ✅ PASS |
| 6. Register human step workflow | ✅ PASS |
| 7. Execute human step → WAITING_HUMAN | ✅ PASS |
| 8. Verify suspension | ✅ PASS |
| 9. Resume (approve) → next step | ✅ PASS |
| 10. Check completion | ✅ PASS |
| 11. Rejection flow | ✅ PASS |

### Step C Audits
| Check | Result |
|-------|--------|
| Human step stops via return | ✅ PASS |
| Status persisted BEFORE suspend | ✅ PASS |
| Saga rollback in reverse order | ✅ PASS |
| Exponential backoff (delay * 2^attempt) | ✅ PASS |
| Stops on retryable: false | ✅ PASS |
| next_step from Registry (not result) | ✅ PASS |
| Unknown decision returns 400 | ✅ PASS |

---

## Database Verification

```sql
-- WorkflowRegistry table
SELECT type, version, "baseUrl" FROM "WorkflowRegistry";

-- Unique constraint
SELECT COUNT(*) FROM "WorkflowRegistry" WHERE type = 'internship_request';
-- Result: 1 (no duplicates)

-- JSONB query
SELECT type, "workflowDef"->'steps'->0->>'name' as first_step FROM "WorkflowRegistry";
-- Result: "check-budget"
```

### ✅ Step D: BullMQ Workers

**Files Created:**
- `src/queue/queues.ts` - Queue definitions (workflow-execution, human-timeout, reminders)
- `src/queue/workers/workflow.worker.ts` - Async workflow execution, concurrency 10
- `src/queue/workers/humanTimeout.worker.ts` - Timeout handling: escalate, auto_approve, reject
- `src/queue/workers/reminder.worker.ts` - Scheduled reminder emails

**Features:**
- Jobs queued instead of synchronous execution
- Workflow worker processes jobs asynchronously
- Human timeout worker handles: escalate, auto_approve, reject actions
- Reminder worker sends scheduled reminder emails
- All workers log to console with [WorkerName] prefix
- Workers started automatically on server boot

---

## Next Steps (Pending)

### Step D: BullMQ Workers ✅ COMPLETE
- Queue definitions (workflow-execution, human-timeout, reminders)
- Workflow worker (async processing, concurrency 10)
- Human timeout worker (escalate, auto_approve, reject)
- Reminder worker (email reminders)

---

### Step E: Phase 4 + Tests

**Files Created:**
- `src/phases/phase4-output/ArchiveService.ts` - Event writing, KPIs, snapshots every 5 min
- `src/phases/phase4-output/NotificationService.ts` - Email (nodemailer) + Slack webhooks
- `src/phases/phase4-output/StepCallService.ts` - Extracted HTTP call logic
- `prisma/schema.prisma` - Added KpiSnapshot table
- `src/core/PipelineRunner.ts` - Integrated Archive + Notification on COMPLETED/FAILED

**Features:**
- ArchiveService: append-only events, in-memory KPIs with 5-min snapshots
- NotificationService: best-effort (never blocks workflow)
- PipelineRunner calls post-completion handlers via Promise.allSettled
- Integration tests: tests/integration/workflow-execute.test.ts

---

## Running the Project

```bash
# Start PostgreSQL and Redis
docker run -d --name bpm-postgres -e POSTGRES_USER=bpm -e POSTGRES_PASSWORD=bpm -e POSTGRES_DB=bpm_engine -p 5432:5432 postgres:16-alpine
docker run -d --name valkey -p 6379:6379 valkey/valkey:latest

# Push schema
npx prisma db push

# Start development server
npm run dev

# Server runs at http://localhost:3000
# Admin API: http://localhost:3000/admin/api/
# Public API: http://localhost:3000/api/v1/
# Admin UI: http://localhost:3000/admin/
```

---

## Environment Variables

```bash
DATABASE_URL=postgresql://bpm:bpm@localhost:5432/bpm_engine
REDIS_URL=redis://localhost:6379
ADMIN_SECRET=changez-moi-en-production-32-chars-min
JWT_SECRET=changez-moi-aussi-32-chars-min
IDEMPOTENCY_TTL_SECONDS=604800  # 7 days
NODE_ENV=development
PORT=3000
```

---

## Key Technical Decisions

1. **API Key Security**: SHA-256 hashing, never stored in plain text
2. **Admin Authentication**: Separate X-Admin-Secret header (timing-safe comparison)
3. **Workflow Storage**: JSONB for queryable JSON fields
4. **Idempotency**: Redis with PostgreSQL fallback, 7-day TTL
5. **Memory Cache**: In-memory Map with database fallback and startup re-hydration
6. **UPSERT**: Prisma upsert() to prevent race conditions
7. **Zod Validation**: Strict workflow definition validation
