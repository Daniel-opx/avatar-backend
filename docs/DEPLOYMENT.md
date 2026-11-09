# Deployment and recovery

Current spending policy: mock-only development. Do not enable provider flags, buy credits,
upgrade HeyGen/Render, or activate automation. Real LLM API access and a HeyGen API video
budget remain outstanding; see [MOCK_DEVELOPMENT.md](MOCK_DEVELOPMENT.md).
Steps 21–22 add inactive team sign-in and mock approval APIs. The first administrator was
registered on 2026-11-09; private Render Auth configuration remains pending. No external
messages are sent, and mock approval cannot publish. See [TEAM_ACCESS.md](TEAM_ACCESS.md)
and [APPROVALS.md](APPROVALS.md) before real-account activation. The original owner key is
still server-only; human decisions require individual team sessions.
Step 17 does not provision storage buckets or configure a real TTS adapter. Asset preparation
remains disabled in the production pipeline; see [ASSETS.md](ASSETS.md).
Step 18 similarly does not register a live HeyGen transport or accept real HeyGen credentials.
Rendering remains disabled; no API flag or provider secret alone can activate this mock adapter.
Step 19 completion is likewise hard-disabled: no webhook secret, provider or storage adapter
is registered in production. Its private tables default inactive. Review/callback operations
return disabled until a separate implementation/authorization for real accounts.
Step 20 reuses the existing manual processing trigger and schema; composed rendering now
requires retained media before human review. No new configuration, provider key or migration.

Status: reviewed application source `f253012` deployed on the existing Render Free service.
Steps 21–22 team/approval backend is implemented and mock-tested. Scheduling, processing,
content, assets, rendering, completion and real team sign-in remain disabled.
Deployment `dep-dbolpis9v7es73fluri0` succeeded on 2026-11-09 at 07:40 Asia/Jerusalem;
live health/readiness returned
200. Authenticated processing was checked locally against the live database (200 disabled);
the production owner-authenticated processing route has not been separately exercised.
New content retrieval/regeneration routes reject unauthenticated requests (401); their owner
authentication was exercised locally. Live provider-account verification remains pending.
Asset GET/POST likewise reject unauthenticated requests (401); authenticated local wiring
against the live disabled database returned GET 200 and registration 409 unconfigured.
Rendering-history GET rejects unauthenticated requests (401); authenticated local wiring
returned 200 with an empty journal. No real provider integration or media was verified.
Step 19 video-history/reconciliation routes also reject anonymous requests (401); deployed
callback/review operations return 503 disabled. Local owner-authenticated video history
returned 200 empty; reconciliation and review issuance returned disabled/503. Full regression
passed 131 tests; final focused checks passed 19 tests; the updated mock walkthrough passed.
All new tables are private with RLS and denied client reads. The live database still has
4 jobs and zero events/media/grants/provider calls. No real storage or account was activated.
Step 20 regression: 139 passed, zero failures/skips; five-invocation mock demo passed. No new
migration or endpoint. Local owner-authenticated manual processing returned disabled/200;
deployed anonymous manual processing returned 401. Broader roadmap expansion is deferred
until an approved real script-to-video trial; production flags remain off. Owner subsequently
resumed Steps 21–22 on 2026-11-09; their evidence is recorded in PROJECT_STATUS.md.
Steps 21–22 regression: 151 passed; final focused checks: 12 passed; simulated approval/logout
demo passed. Live anonymous team/approval/internal requests return 401; `/auth/login` returns
503 inactive at deployment. The first administrator was subsequently registered; actual
login remains unverified. New helpers/tables deny public/client access. There are still
4 jobs, one team member, zero approval rows and no
provider calls. Existing owner-key compatibility was verified locally, without retrieving
Render's rotated key. No upgrade, external message or publication was performed.
Live at https://avatar-backend-65ep.onrender.com. Unattended automation is NOT authorized.
HTTPS health/readiness passed; missing/old keys rejected. Owner-run fresh-key `GET /jobs`
returned 200 on 2026-11-06. Build/start/health settings aligned; rebuild and restart recovery passed.
Owner reported private credential rotation after Render accessibility unexpectedly exposed the masked key.
The conservative limiter correction was deployed and live-verified after old-instance draining.
New scheduler-scoped credential is live-verified through GitHub. A controlled 16-minute idle
test returned disabled/200 in 13.9 seconds on the first attempt; internal platform spin-down
state was not independently inspected. Repeated requests left job counts and disabled scheduling unchanged.
See `PROJECT_STATUS.md` for the evidence and remaining acceptance work.

## Configuration

Keep `.env` local and untracked. Required: `DATABASE_URL`, `API_KEY`.
Optional: `PORT` (3000), `NODE_ENV`, `DATABASE_CA_CERT` (PEM text, real newlines or escaped `\n`).
Optional `SCHEDULER_API_KEY`: distinct 32+ character secret granting only scheduler POST access.
Step 16's optional server-only `OPENAI_API_KEY` is unused unless `CONTENT_LIVE_ENABLED=true`
and the database content/processing configuration is explicitly enabled with model and
request allowance. These remain disabled; see [CONTENT.md](CONTENT.md) before any activation.
Configure privately in Render; copy only this limited key into GitHub Actions secret
`AVATAR_SCHEDULER_KEY`. Leave the owner `API_KEY` out of GitHub. Absence preserves existing owner
access; an explicitly empty, short, whitespace-padded or identical scheduler key fails startup.
Production requires a key of at least 32 characters. Generate a cryptographically random key
through the chosen secret manager during coordinated rotation. Never paste it in chat.
`RENDER` is provided by Render; only that environment trusts one reverse-proxy hop.
Do not enable it on an arbitrary directly accessible server.

Database connections require certificate AND hostname verification. Obtain the project's
CA through Supabase Dashboard → Database Settings → SSL Configuration. The owner supplied
that public certificate; it is bundled in `db/certs/supabase-prod-ca-2021.crt` and works locally
and on Render without extra environment setup. Optional `DATABASE_CA_CERT` overrides its PEM.
It expires on 2031-04-26; review replacement before expiry or a provider CA change.
Invalid or mismatched certificates fail closed; there is no insecure fallback.
URL SSL parameters are removed before passing the separately verified SSL options to pg.
No database or authentication settings were overwritten in `.env`.

## Local verification

```powershell
npm ci
npm test
$env:RUN_DB_TESTS='1'
npm test
Remove-Item Env:RUN_DB_TESTS
```

Database tests create/drop unique `step12_test_<uuid>`, `step15_test_<uuid>`, `step16_test_<uuid>`
and `step17_test_<uuid>` / `step18_test_<uuid>` / `step19_test_<uuid>` / `step20_test_<uuid>` /
`step21_test_<uuid>` schemas. They require schema
creation permission and a valid CA. They never enable or mutate the live schedule.
Use the disposable-schema suite instead of `test-step11-live.js` for ongoing regression testing.
The old Step 11 script temporarily changes live scheduler configuration and retains test jobs.
Test files run sequentially to fit the existing Supabase session connection limit; concurrency
within worker/scheduler tests is retained. Run `npm run demo:mock` after database tests finish,
not alongside them. No database plan upgrade is needed for these checks.

## Render review and deployment

`render.yaml` defines a free Node web service, `npm ci`, `npm start`, `/health`, and manual
deployments. It creates no Render database or paid Cron resource. Confirm the intended existing
Render service and repository/branch BEFORE applying it; do not create a duplicate service blindly.
Blueprint structure is prepared from current official docs, not validated by the live Render API.

1. Obtain target service details and explicit deployment approval.
2. Coordinate API-key rotation between server and every internal client/Cron consumer.
   Pause Cron; deploy the new secret through Render's secret settings; update consumers securely;
   verify old key rejected/new key accepted without logging either; resume only with authorization.
3. Set database URL and key securely in Render. Use the bundled CA unless a replacement is required.
   Keep `schedule_config.enabled = FALSE`.
4. Deploy the reviewed revision. Verify HTTPS `/health` (liveness) and `/ready` (database).
5. Check unauthenticated protected endpoints return 401; run authenticated read-only checks.
6. Check graceful restart and readiness; inspect redacted logs.
7. Keep Cron, external generation, publication and advertising disabled.

Rate limits use process memory and reset after restart. Render applies a shared 120-request/minute
cap because live ingress IP buckets were unstable even on one persistent connection. Local/direct
deployments use per-IP limits. This is not distributed abuse protection; unauthenticated callers
can consume the shared budget. Health remains unthrottled. Body limit: 32 KiB.
Graceful shutdown stops accepting traffic, drains requests and ends the pool, with a 25-second cap.
Restart and controlled post-idle recovery passed. Free instances still have best-effort availability.
Do not assume one trusted proxy hop yields an authoritative client IP on this deployment.
Do not use `req.ip` for authorization or security-sensitive decisions without verified ingress trust.

## Migration and recovery

Use versioned SQL files, review on an isolated schema, then apply in a transaction.
Migration 011 can be repeated and preserves schedule configuration. It does not enable automation.
Step 15's additive migration was applied once and starts processing disabled, without
enrolling existing jobs. It is not repeatable; see [PROCESSING.md](PROCESSING.md) for the
CLI single-statement workaround and recovery/adapter contracts. Keep these additive tables
when rolling the application back. The enqueue trigger remains installed, so new job inserts
still create queue rows even if older application code is restored; disabled processing
prevents their execution. Last verified live state: 4 jobs, 0 queued existing jobs.
For an application rollback retain the additive columns; the old scheduler ignores them.
Disable scheduling before rollback: older code consumes a slot and disables recurrence.
Do not drop columns or delete jobs as a rollback shortcut. Confirm backups in Supabase before
future production schema changes. A migration ledger/runner is still a deployment tooling gap.
Step 16 is recorded in the hosted migration ledger; older DDL is not. Reconcile that
baseline before using a general migration runner. The Step 16 migration is applied once
and keeps content disabled; retain the additive tables during application rollbacks.

If a test process is killed, a disposable schema can remain. Confirm its generated name and
ownership before targeted cleanup; never drop `public` or use a schema wildcard.

## Sources checked 2026-11-05

- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/blueprint-spec
- https://render.com/docs/free (idle free services sleep; no reliable in-memory background worker)
- https://supabase.com/docs/guides/platform/ssl-enforcement
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://node-postgres.com/features/ssl
- https://express-rate-limit.mintlify.app/reference/configuration

No GHL, HeyGen, Meta, LLM, or Cron API integration has been implemented or live-verified.
