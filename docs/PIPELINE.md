# Step 20 — small mock generation workflow

Scope decision: prove the core flow before expanding the product. Reuse existing services,
tables and owner authentication. No dashboard, team roles, publishing, advertising, provider
activation or new infrastructure is included. Broader roadmap work pauses after this mock
milestone until one real script-to-video trial can be authorized within an approved budget.

The shared pipeline composition connects content → assets → render submission/polling →
media retention → `ready_for_review`. The render checkpoint stores `awaiting_media` between
provider completion and retention. The processing engine performs the final review transition
only after its transaction checks that the current render and retained media are ready.
No token or expiring URL is saved in a checkpoint. Review links are issued separately on demand.
Existing manual job creation and scheduler-created jobs use the same database enrollment
trigger. The external Cron service still only requests scheduling; this MVP drives processing
manually and does not activate recurring generation.

Each manual invocation performs one short stage operation. Retention runs on a later
invocation than render polling; no long-running background loop or new scheduler is added.
Both render and completion must be configured before the composed worker submits a video.
The existing production defaults remain disabled, without real rendering/storage adapters.

Existing versioned outputs, leases, attempt timestamps, stage errors, cancellation and owner
retry routes are reused. A storage failure leaves the job outside review. Retention retries
do not repeat the script or video submission. If bounded media retries are exhausted, use
the existing media-retry action, then processing retry; neither generates a replacement video.
Unknown provider submission outcomes still require reconciliation rather than resubmission.
Operational failure/cancellation is tracked in `job_processing.state`; use processing history
alongside the coarse `jobs.status` when inspecting a job.

The worker owns the final checkpoint/lease transaction. A failed final checkpoint can reuse
retained media after lease recovery without another provider read or copy. Standalone Step 19
reconciliation remains compatible and can complete the same retained-media gate; an older
worker is then fenced by its processing lease. There is no publishing handler.

## Manual demonstration

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
npm run demo:mock
```

The demo creates one job in a disposable schema, uses controlled provider responses, runs
five worker invocations and verifies an expiring review grant. It removes the schema afterward.
Only its isolated configuration is enabled. It does not change `.env` or production flags.
The retained bytes are a labeled non-playable fixture, not an AI-generated video.

The existing owner-only `POST /internal/processing/run` is the manual HTTP trigger; it
performs one due operation and requires `x-api-key`. Production currently returns disabled.
Do not enable production settings to run the demonstration. The scheduler-scoped key cannot
run processing. History/retry/cancel routes remain under `/internal/processing/:jobId/…`.

```powershell
$env:RUN_DB_TESTS='1'
try { npm run test:pipeline:db } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

Run the demo and database suites sequentially. End-to-end tests use the real PostgreSQL
engine in a disposable schema, with mock LLM, HeyGen and storage. They cover stage restarts,
overlapping manual workers, missed callbacks, storage failure, final-checkpoint rollback,
disabled retention and cancellation. Provider permissions, real media durability and quality
remain unverified. Account/key/budget prerequisites are in [MOCK_DEVELOPMENT.md](MOCK_DEVELOPMENT.md).

Verification on 2026-11-08: focused end-to-end checks 6 passed; full serialized regression
139 passed, zero failures/skips. No production schema or activation settings were changed.
The five-invocation demo passed with zero real calls/publication; all disposable schemas
were removed. The existing owner-authenticated local trigger returned disabled/200 against
the live database. Production still had four jobs, all six switches off and zero provider calls.
Application source `f80eb96` deployed to the existing Render Free service on 2026-11-08.
Live health/readiness returned 200; anonymous manual processing returned 401; callback/review
operations returned 503 disabled. No real-account or real-video acceptance is claimed.
