# Deployment and recovery — Step 13 preparation

Status: reviewed source `dc4a9eb` deployed with owner approval on the existing Render Free service.
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

Database tests create/drop only a unique `step12_test_<uuid>` schema. They require schema
creation permission and a valid CA. They never enable or mutate the live schedule.
Use the disposable-schema suite instead of `test-step11-live.js` for ongoing regression testing.
The old Step 11 script temporarily changes live scheduler configuration and retains test jobs.

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
For an application rollback retain the additive columns; the old scheduler ignores them.
Disable scheduling before rollback: older code consumes a slot and disables recurrence.
Do not drop columns or delete jobs as a rollback shortcut. Confirm backups in Supabase before
future production schema changes. A migration ledger/runner is still a deployment tooling gap.

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
