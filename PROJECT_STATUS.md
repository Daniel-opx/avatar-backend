# AI Avatar Automation — development status

Updated: 2026-11-05 (Asia/Jerusalem).
Authoritative roadmap: [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).
Original Hebrew architecture document: not found in the repository; requirements depending on it remain unresolved.

## Checklist

- [x] Steps 1–11: existing backend and recurring scheduler; earlier live integration passed.
- [x] Step 12: scheduler reliability/recovery — isolated PostgreSQL tests executed successfully.
- [ ] Step 13: local hardening and verified Supabase TLS passed; production deployment/rotation pending.
- [ ] Step 14: external free Cron integration; leave real recurring execution disabled.
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

## Environment and operational state

- Existing: `DATABASE_URL`, `API_KEY`; optional `PORT`.
- New: optional `DATABASE_CA_CERT` overrides the bundled public CA; `NODE_ENV=production` on Render.
- Render-provided `RENDER` selects one trusted proxy hop; `NODE_VERSION` specified in blueprint.
- Test only: `RUN_DB_TESTS=1` enables isolated database tests; excluded by default.
- `.env` unchanged; ignored and not tracked in current Git index.
- No external provider credentials inspected or verified; no LLM/HeyGen/GHL/Meta requests made.
- No publishing, paid API requests, advertisements, unattended automation or deployments enabled.
- Live schedule was disabled after Step 11; Step 12 tests never modify it.
- Two labelled Step 11 test jobs remain, intentionally retained.

## Required inputs / approval gates

1. Supabase CA certificate: received, validated, configured and live TLS verified; resolved.
2. Intended Render service/repository/branch and approval for production deployment.
   Confirmed: existing Free `avatar-backend`, service `srv-dbljvqou01pc73aea2u0`,
   repository `Daniel-opx/avatar-backend`, branch `main`. Owner authorized deployment/resume
   subject to no additional charges. No paid resource, upgrade or automation activation authorized.
   Dashboard inspected: suspended; no environment variables or linked groups configured.
   Auto-Deploy changed from On Commit to Off and saved, preventing a push from launching code.
   Deployment is pending secure environment setup; service has not been resumed.
3. Coordinated rotation of previously exposed shared API key before public deployment.
   Existing key has not been changed or printed.
4. Original Hebrew architecture document if available.
5. Later: account permissions and approved test budgets for LLM/HeyGen/GHL/Meta;
   verify current official APIs before each adapter, and distinguish mocked from live verification.
6. Separate explicit approvals for public posts, paid campaigns/budget changes, and unattended activation.

## Remaining risks and next actions

- Step 13 acceptance is NOT met: target deployment, HTTPS checks, proxy behavior,
  rotation and production restart/cold-start tests remain pending.
- Verified TLS works with the supplied CA; track its 2031 expiry and review provider CA changes.
- Render Free can sleep/restart; future processing must use durable checkpoints, not detached tasks.
- Rate limiting is per process and resets after restart; no distributed rate-limit store configured.
- Current shared key is temporary; team identities are Step 21.
- Existing edits from before this roadmap were preserved; nothing committed or pushed.
- No migration ledger yet; future schema work needs tracked transactional migration execution.
- See `docs/DEPLOYMENT.md` for test commands, rotation sequence and migration recovery.
