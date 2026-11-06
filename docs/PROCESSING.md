# Durable processing (Step 15)

Implemented and deployed (`8c708a7`); development paused by the owner on 2026-11-06.
Processing remains disabled. Final regression suite: 57 passed, zero failures/skips.
All provider handlers used in tests are controlled test code; no live provider is integrated.

Job creation and video execution are separate. `jobs.status` retains its existing values.
Every newly inserted job gets a `job_processing` row in the same transaction, including
scheduler-created jobs. Existing jobs are not backfilled. A failed enqueue rolls back
the job insert. Processing configuration starts disabled. There is no background loop,
cron change, provider registration, or automatic external call.

Processing stages: `content -> assets -> render -> review`. Successful rendering ends
processing at `succeeded` and changes the job status to `ready_for_review`. Approval,
publication and advertising are outside this engine. Other processing states leave the
existing video status unchanged; inspect processing history for execution state.

Transitions:

| Current state | Operation | Result |
| --- | --- | --- |
| queued / due retry_wait | atomic claim | running |
| running | successful step | queued at next stage / succeeded at review |
| running | saved pending external operation | retry_wait, same stage |
| running | explicit transient error, retry-safe adapter, budget remaining | retry_wait |
| running | permanent error / exhausted retry budget | failed |
| running | uncertain outcome or expired unsafe lease | needs_reconciliation |
| failed | owner retry, only if retry-safe | queued, new retry budget |
| queued / retry_wait / failed | owner cancellation | cancelled |

Expired safe leases use bounded retries. Expired unsafe leases require reconciliation.
Running jobs cannot be cancelled/retried: cancellation cannot undo a provider action.
`needs_reconciliation` has no generic retry override. A provider-specific reconciliation
path must verify the external operation before moving it forward (future integration).
Manual controls are serialized with claims and produce durable events.

Each invocation handles at most one short operation. Claims use row locks and
`SKIP LOCKED`; no transaction spans a provider request. A random lease token fences
completion writes. Leases last 30 seconds; step timeout is 10 seconds. An adapter must
honour AbortSignal. The engine cannot forcibly terminate a provider request or undo a
provider side effect. Request shutdown/timeouts leave durable leases for recovery.
Recovery scans at most 20 expired leases per enabled invocation. No recovery occurs
while disabled. Turning processing off prevents new claims; it does not revoke claims
already issued. A subsequent enabled invocation performs recovery after a restart.

Automatic retries require an explicitly retry-safe adapter AND an explicitly transient
`StepError`; default/unexpected errors are conservative. Backoff is 30, 60, 120... seconds,
capped at one hour, with three attempts per stage by default (database limit 1–10).
Manual retries retain prior attempt history. Successful polls reset the consecutive
failure budget. Disabling processing preserves all pending work.

The engine supplies a stable `jobId:stage` operation key. `retrySafe: true` is a contract:
the adapter/provider must enforce idempotency across overlapping/late requests, including
a timeout after submission. Database fencing alone cannot guarantee exactly-once external
effects. Adapters are server code, never supplied by HTTP callers. No adapters are
registered in the production router yet, so an enabled but unconfigured engine claims
no new work. Controlled adapters in tests do not verify any real provider integration.

Long operations must use `PendingStep({ externalId, ... }, pollAfterSeconds)`, save the
external identifier, and return. The next invocation receives that checkpoint as
`progress` and polls it rather than resubmitting. Final output replaces the pending
checkpoint atomically with stage advancement. A crash between provider submission and
checkpoint commit still needs provider idempotency or reconciliation. The engine never
waits for an entire video render. A completed checkpoint is not silently overwritten.

Tables `processing_config`, `job_processing`, `job_attempts`, `job_checkpoints`, and
`job_processing_events` have RLS enabled and no client policies/grants. Only the trusted
backend database role operates on them. Raw provider errors and credentials are not saved
in attempts or exposed in failure responses. Adapter checkpoint output must contain only
necessary content/operation identifiers, never provider keys or raw secret-bearing responses.

## Owner-only manual API

All require `x-api-key: API_KEY`. The separate scheduler key is denied.

- `POST /internal/processing/run`: one awaited step; initially `disabled`.
- `GET /internal/processing/{job UUID}/history`: execution state, attempts, checkpoints, events.
- `POST /internal/processing/{job UUID}/retry`: safe failed job only; conflict is HTTP 409.
- `POST /internal/processing/{job UUID}/cancel`: unclaimed work only; conflict is HTTP 409.

There is deliberately no HTTP enable switch. Activation and provider budgets require
separate review. Render Free can sleep/restart, so work is durable but start times and
continuous execution are not guaranteed. Future triggers must call these bounded steps;
no task depends on detached work after an HTTP response.

## Tests (PowerShell)

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
$env:RUN_DB_TESTS = '1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

This creates uniquely named disposable PostgreSQL schemas, copies table structure without
business data, applies the versioned migration there, and drops those schemas afterward.
It does not enable the production scheduler or process production jobs. Network/database
access is required. Provider calls are controlled test handlers.

Migration file was generated with Supabase CLI 3.0.0:
`supabase/migrations/20261106073647_durable_processing.sql`.
Apply once, after migration 011 and the original tables. CLI 3.0.0 `db query` rejects
multi-statement files; submit the SQL between BEGIN/COMMIT inside a single atomic
`DO $migration$ BEGIN ... END $migration$;` block, or use a migration-capable runner.
It is transactional and intentionally fails if already installed. This repository still
has no migration ledger; inspect schema before deployment instead of rerunning the file.

References: [PostgreSQL locking / SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
