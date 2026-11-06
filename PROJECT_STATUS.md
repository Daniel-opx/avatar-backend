# AI Avatar Automation — development status

Updated: 2026-11-06 (Asia/Jerusalem).
Authoritative roadmap: [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).
Original Hebrew architecture document: not found in the repository; requirements depending on it remain unresolved.

## Checklist

- [x] Steps 1–11: existing backend and recurring scheduler; earlier live integration passed.
- [x] Step 12: scheduler reliability/recovery — isolated PostgreSQL tests executed successfully.
- [ ] Step 13: deployed on Free, settings aligned, rebuild/restart and limiter verified; credential rotation and idle cold-start check pending.
- [ ] Step 14: GitHub-hosted health and authenticated disabled-scheduler tests passed; one-off cold-start verification pending. No recurring execution.
- [ ] Step 15: durable processing/lifecycle, attempts, leases, retries and cancellation.
- [ ] Step 16: provider abstraction and versioned structured Hebrew LLM content.
- [ ] Step 17: protected creative assets and optional voice generation.
- [ ] Step 18: HeyGen rendering provider and safe submission recovery.
- [ ] Step 19: authenticated/deduplicated callbacks, storage and reconciliation.
- [ ] Step 20: resumable generation pipeline ending at human review.
- [ ] Step 21: team identities, roles and separate internal service authentication.
- [ ] Step 22: auditable approvals tied to exact content versions.
- [ ] Step 23: authenticated team dashboard with Hebrew/RTL support.
- [ ] Step 24: approval-gated GHL organic publishing.
- [ ] Step 25: approval-gated Meta advertising and budgets.
- [ ] Step 26: source-backed performance metrics.
- [ ] Step 27: evidence-backed recommendations with separate approvals.
- [ ] Step 28: durable audit, monitoring and alerts.
- [ ] Step 29: full acceptance/security testing and authorized live demonstration.
- [ ] Step 30: operational documentation and separately approved gradual launch.

## Step 12 implementation and evidence

Added `scheduler.integration.test.js`; real PostgreSQL constraints and transactions are exercised
through a local authenticated HTTP server using isolated copies of table structures and indexes.
Only test data is inserted. Generated schema is dropped in cleanup. Clock is deterministic.

Verified: insertion/update/begin failures, injected acquisition failure, retry recovery, failures
before COMMIT, lost COMMIT acknowledgement, concurrent backlog consumption, preexisting slots,
one-time rollback/retry, due boundary, disabled/future schedules, DST gaps/repeated hours,
weekly intervals and year boundary. Error responses have a stable public failure code.
Rollback failure discards the client; error logs omit raw driver messages.

Run executed before Step 13 TLS change: 19 passing test records (18 checks plus parent), zero failures.
Connection failures and commit acknowledgement loss are injected at the driver boundary, not a
real Supabase outage or network kill. Production restart/cold-start verification remains pending.
Migration 011 was made repeatable by replacing its named constraints inside a transaction;
repeatability test added afterward. No new live migration was applied this turn.

## Step 13 implementation and evidence

Added `app.js`, `config.js`, `security.test.js`, `render.yaml`, and `docs/DEPLOYMENT.md`.
Updated `server.js`, `db/pool.js`, `routes/jobs.js`, package manifest/lock and scheduler error handling.
Added startup validation, mandatory verified PostgreSQL TLS, timeouts, idle-client error handling,
Helmet headers, 32-KiB body limit, process-local rate limiting, request IDs, safe JSON request logs,
separate liveness/readiness checks and graceful shutdown. No frontend credentials exposed.

`npm audit --omit=dev`: zero reported vulnerabilities. Installation audit also reported zero.
Local hardening HTTP/config tests passed with unrestricted loopback access.
Initial verified-TLS run exposed a missing trusted CA (`SELF_SIGNED_CERT_IN_CHAIN`).
Resolved using the public Supabase Root 2021 CA supplied by the owner from the project dashboard.
Certificate is bundled at `db/certs/supabase-prod-ca-2021.crt`; valid through 2031-04-26.
`DATABASE_CA_CERT` remains an optional PEM override. `.env` was not changed.
Latest full run: `RUN_DB_TESTS=1; npm test` passed all 29 test records, failed 0, skipped 0.
Includes real PostgreSQL transactions over verified TLS, migration repeatability,
rollback-discard/redaction checks, concurrent requests, recovery, DST and HTTP security tests.
A separate read-only verified-TLS query confirmed the live schedule remains disabled.
Generated test schema was removed by the test cleanup. No live data/schema migrations applied.
`node --check` passed for server, app, config and integration test; `git diff --check` passed.

Production deployment: `dep-dbmcppe417fc73c3d3pg`, reviewed source `92c274c`,
Render dashboard status **Deploy succeeded | Live**, 2026-11-05 20:37 Asia/Jerusalem.
Existing Free service resumed; no paid resources added or plan upgrades performed.
Build used Node 24.16.0 and existing `npm install` / `node server.js` settings.
On 2026-11-06 actual settings were aligned to `npm ci`, `npm start` and `/health`.
Manual rebuild `dep-dbmn0iqjnfac73av08ag` succeeded using those commands, source `92c274c`.
Render's Events page confirmed a deliberate service restart at 08:16 Asia/Jerusalem.
During the restart a readiness probe returned 502; subsequent health/readiness probes returned 200.
Job count before/after: 4; scheduled-job count: 3; scheduling enabled: false throughout.
This verifies restart recovery; a naturally idle Free cold-start has NOT yet been timed/verified.

Live ingress investigation: rate-limit remaining counters varied even on a single reused TLS
connection with unchanged headers. This does not establish a header-spoofing vulnerability;
it establishes that the one-hop IP model does not provide a stable per-client bucket here.
Local correction uses a conservative total service cap on Render (120/minute, health exempt),
independent of IP/forwarded headers. Local/direct deployments retain per-IP limiting.
Ten local test records passed, zero failed, one opt-in database suite skipped.
New Render limiter regression passed; no scheduler/database logic changed.
Correction committed/pushed as `5346676`, deployed successfully in
`dep-dbmn3snf3r2c73b4trfg` using `npm ci` and `npm start` on the same Free service.
An immediate live probe overlapped instance draining and was inconclusive. After draining,
four consecutive `/ready` requests (including varied forwarded headers) all returned 200
with one decreasing shared budget: 119, 118, 117, 116. `/health` returned 200; `/jobs`
without a key returned 401. Live request-cap correction verified. No distributed guarantee claimed.

Executed HTTPS checks against `https://avatar-backend-65ep.onrender.com`:
- `GET /health`: 200.
- `GET /ready`: 200 (verified-TLS database connectivity from Render).
- Unauthenticated `GET /jobs`: 401.
- Unauthenticated `POST /internal/run-scheduler`: 401.
- `GET /jobs` with previous local API key: 401; old key is not accepted by production.

No job creation performed during these deployment checks. Fresh production API key remains
private. On 2026-11-06 the owner ran the read-only production `GET /jobs` test with that key
and reported `HTTP 200 - authenticated request succeeded`. This is owner-executed live evidence;
the assistant did not access the key or independently repeat that authenticated request.
Local `.env` still contains the local key; no attempt made to overwrite or synchronize it.
Reviewed build/runtime logs showed safe structured messages, no visible credential values.

## Environment and operational state

- Existing: `DATABASE_URL`, `API_KEY`; optional `PORT`.
- Optional `SCHEDULER_API_KEY`: separate 32+ character external trigger key, accepted only for
  `POST /internal/run-scheduler`. It cannot authorize `/jobs` or other internal operations.
  Must differ from `API_KEY`. Not configured automatically and not mandatory for existing owner access.
- New: optional `DATABASE_CA_CERT` overrides the bundled public CA; `NODE_ENV=production` on Render.
- Render-provided `RENDER` selects one trusted proxy hop; `NODE_VERSION` specified in blueprint.
- Test only: `RUN_DB_TESTS=1` enables isolated database tests; excluded by default.
- `.env` unchanged; ignored and not tracked in current Git index.
- No external provider credentials inspected or verified; no LLM/HeyGen/GHL/Meta requests made.
- Backend deployed with approval on existing Render Free; no publishing, paid API requests,
  advertisements or unattended automation enabled. Auto-Deploy remains Off.
- Live schedule was disabled after Step 11; Step 12 tests never modify it.
- Two labelled Step 11 test jobs remain, intentionally retained.

## Required inputs / approval gates

1. Supabase CA certificate: received, validated, configured and live TLS verified; resolved.
2. Intended Render service/repository/branch and approval for production deployment.
   Confirmed: existing Free `avatar-backend`, service `srv-dbljvqou01pc73aea2u0`,
   repository `Daniel-opx/avatar-backend`, branch `main`. Owner authorized deployment/resume
   subject to no additional charges. No paid resource, upgrade or automation activation authorized.
   Auto-Deploy changed from On Commit to Off and saved, preventing a push from launching code.
   Owner saved private `DATABASE_URL` and `API_KEY`; all four variable names verified saved.
   `NODE_ENV=production` and `NODE_VERSION=24.16.0` configured. Resumed existing Free service
   and manually deployed tested source `92c274c`. Deployment/HTTPS verified as above.
3. Credential rotation incident: while inspecting the existing Render page on
   2026-11-06, its accessibility output unexpectedly included the saved key despite visual masking.
   Do not reproduce it in documentation or logs. Owner was informed; treat it as exposed.
   Owner reported private rotation/redeployment completed on 2026-11-06. Avoid further full
   environment-page snapshots. Post-rotation public checks: `/health` 200 (745 ms), `/ready`
   200 (1384 ms), missing-key `/jobs` 401. These were warm requests, not a cold-start test.
   Successful authentication using the newly rotated value has not been independently verified.
   External Cron must receive only the fresh private credential, never the exposed one.
4. Original Hebrew architecture document if available.
5. Later: account permissions and approved test budgets for LLM/HeyGen/GHL/Meta;
   verify current official APIs before each adapter, and distinguish mocked from live verification.
6. Separate explicit approvals for public posts, paid campaigns/budget changes, and unattended activation.

## Remaining risks and next actions

- 2026-11-06: owner's authenticated test reached Render's suspended-service page, so it did
  not exercise application authentication. Dashboard confirmed owner-suspended status on Free.
  Resumed the existing service with prior authorization; HTTPS `/health` and `/ready` both
  returned 200 afterward. Subsequent owner-run authenticated `GET /jobs` returned 200.
  No key or plan changed during recovery.

- Step 13 acceptance is NOT fully met: post-rotation authenticated check and natural idle cold-start
  verification remain pending. Step 14 research is prepared in `docs/EXTERNAL_CRON.md`;
  no provider account, remote job, credential transfer or recurring execution configured.
- Step 14 local preparation: provider-independent `scripts/trigger-scheduler.js` implements
  HTTPS-only fixed destination, redirect rejection, 120-second timeouts, bounded retries and
  content/credential-safe output. Default mode is read-only health; scheduler mode expects disabled.
  Six mock-based client tests passed; live GitHub evidence is recorded below separately.
  Owner selected GitHub Actions after the security/free-tier comparison on 2026-11-06.
  Added manual-only `.github/workflows/scheduler-manual.yml`: default read-only health,
  optional authenticated disabled-scheduler test, no scheduled/PR/push triggers, bounded runtime,
  serialized runs, public/main/original-repository guard, contents-read token, pinned official
  checkout revision with credential persistence disabled. No dependencies installed by this workflow.
  Scheduler mode reads GitHub secret `AVATAR_SCHEDULER_KEY`; no owner API key is sent to GitHub.
  New scheduler authorization implemented in middleware/app with optional startup validation.
  Latest local `npm test`: 19 passed, 0 failed, 1 opt-in database suite skipped. Includes HTTP
  routing tests using a fake database, key separation/denial tests and six mocked trigger tests.
  Source committed/pushed as `dc4a9eb`. GitHub public API returned 200 and registered
  `Avatar scheduler - manual verification`; browser showed zero runs. `active` workflow state
  means it can be manually dispatched, not that a recurring schedule is enabled.
  Deployed backend `dc4a9eb` to existing Render Free, deployment `dep-dbmnbh5g1s2s73bd49b0`:
  dashboard **Deploy succeeded | Live**. Actual client health mode returned status ok, HTTP 200,
  one attempt, 623 ms. `/ready` returned 200; missing-key `/jobs` returned 401.
  Owner completed GitHub sign-in privately. Manually dispatched health mode on main/source
  `dc4a9eb`: run `42176151233`, job `127754978420`, **Success**, total duration 13 seconds
  (job 5 seconds), 2026-11-06 08:42 Asia/Jerusalem. This is a real GitHub-hosted workflow run;
  it runs the six mocked client tests and the actual credential-free HTTPS health request.
  No scheduler POST, business job creation, secret use or recurring activation occurred.
  Run evidence: https://github.com/Daniel-opx/avatar-backend/actions/runs/42176151233
  GitHub repository had no Actions secrets. Prepared blank new-secret form with name
  `AVATAR_SCHEDULER_KEY` for owner entry/submission; value remains blank. No key generated/copied.
  Next: owner creates distinct `SCHEDULER_API_KEY` privately in Render, saves/redeploys, and
  stores the same value as GitHub `AVATAR_SCHEDULER_KEY`. Never use the owner API_KEY here.
  Owner reported both private key entries saved on 2026-11-06; GitHub displayed only secret
  name `AVATAR_SCHEDULER_KEY` and confirmation of creation. First authenticated run
  `42176661336`, attempt 1, failed HTTP 401 (no automatic retry). Render variable NAMES only
  confirmed `SCHEDULER_API_KEY` existed; running deployment preceded its setup. Redeployed saved
  configuration as `dep-dbmnh8ijnfac73b068eg` (same source `dc4a9eb`), **Live**.
  Reran same workflow, attempt 2: **Success**, 13 seconds total / 8-second job,
  job `127757962880`, 2026-11-06 08:51 Asia/Jerusalem. Client enforces HTTP 200/status disabled.
  Evidence: https://github.com/Daniel-opx/avatar-backend/actions/runs/42176661336/attempts/2
  No credential values read or displayed. Authenticated provider connectivity now verified;
  production `/jobs` denial using the scheduler key remains unit/HTTP-mock verified only.
  Adding manual `cold-start-disabled-scheduler` mode: 16-minute no-request idle wait then
  authenticated disabled test, total job bound 25 minutes. No schedule event is introduced.
  One-off idle test dispatched as run `42177635809`, source `e613fed`, job `127759672206`.
  Monitoring only GitHub's public status API; no Render requests during its idle wait.
  Read-only Supabase baseline: 4 jobs / 3 scheduled jobs, scheduling false. Both backend tables
  have RLS enabled and no RLS policies; no schema, grants or record contents changed/read.
  While waiting, prepared an inactive recurring template OUTSIDE `.github/workflows` at
  `docs/templates/scheduler-recurring.yml.example`; default-off activation variable and public
  repository checks remain mandatory. CLI requires explicit false flag to accept active schedule
  results; defaults health-only/expect-disabled. New client tests passed (8 of 8).
  New manual workflow version adds a safe POST `/jobs` empty-object scope probe requiring 401,
  before idle waiting, and a 35-minute upper bound for cold-start/retry diagnostics. It creates
  no job with the current server validator, even if the owner key was provided accidentally.
- Verified TLS works with the supplied CA; track its 2031 expiry and review provider CA changes.
- Render Free can sleep/restart; future processing must use durable checkpoints, not detached tasks.
- Rate limiting is per process and resets after restart; Render uses a conservative shared cap.
  Heavy unauthenticated traffic can consume the shared budget; this is not a distributed WAF.
- Current shared key is temporary; team identities are Step 21.
- Latest deployed source `dc4a9eb`; unrelated preexisting `test.js` edit preserved unstaged.
- No migration ledger yet; future schema work needs tracked transactional migration execution.
- See `docs/DEPLOYMENT.md` for test commands, rotation sequence and migration recovery.
