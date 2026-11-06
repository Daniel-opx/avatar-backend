# Step 14 preparation — external free Cron (inactive)

Status: owner selected GitHub Actions on 2026-11-06. Provider-independent local trigger client
and manual-only workflow published in `dc4a9eb`. Backend scheduler-key support deployed to Render.
Owner completed sign-in; manually dispatched GitHub-hosted health run `42176151233` passed
on main/source `dc4a9eb`, 2026-11-06 08:42 Asia/Jerusalem (13 seconds total, 5-second job).
Evidence: https://github.com/Daniel-opx/avatar-backend/actions/runs/42176151233
The run used no secret and created no business jobs. New-secret form was prepared with only
name `AVATAR_SCHEDULER_KEY`; owner must enter/save the value after creating the limited key
in Render. Authenticated remote integration is NOT verified by the health-only run.
Earlier local client health mode returned 200 in 623 ms; this was separate from the GitHub run.
Owner stored the scheduler-only secret privately in both services. GitHub authenticated run
`42176661336` attempt 1 failed 401 because the saved Render setting was not deployed.
Redeployment `dep-dbmnh8ijnfac73b068eg` applied it. Attempt 2 succeeded (13 seconds total),
confirming the expected HTTP 200/disabled response through GitHub's runner.
Evidence: https://github.com/Daniel-opx/avatar-backend/actions/runs/42176661336/attempts/2
No recurring execution configured. Natural idle cold-start verification remains pending.
Owner reported key rotation complete. Step 13 still has post-rotation authentication and an idle
cold-start check outstanding. Warm public readiness/health checks passed after rotation.

## Comparison requested by owner, 2026-11-06

GitHub Actions: public repository status confirmed via unauthenticated GitHub REST metadata
for `Daniel-opx/avatar-backend`. Standard hosted runners in public repositories are free.
Secrets belong in Actions Secrets, never code or logs. Fork PR runs have no secrets by default;
never execute untrusted PR code with secret-enabled events. Protect workflow changes, limit
token permissions and avoid unnecessary third-party actions. Public logs require minimal output.
Schedules can be delayed/dropped and are disabled after 60 days without repository activity;
this is an operational limitation, not disclosure of secret values. No workflow enabled.

Upstash QStash: official Free pricing documents 1000 delivery attempts/day, 10 active schedules
and up to 15-minute response duration. Each retry consumes a message. Five-minute polling is
288 initial deliveries/day; with at most two retries per delivery the theoretical daily total is
864 attempts, before other account usage. Verify actual Free account limits and no paid upgrade
before enabling. Signed delivery JWTs can authenticate the provider; setup needs account and
backend signature verification. This is more setup than the existing shared-header mechanism.
API capabilities/pricing are researched, not verified using a real Upstash account or delivery.

Selected by owner: GitHub Actions is reasonable for this small existing public repository
when configured safely. QStash Free is a strong dedicated alternative for long response timeouts
and retry support. GitHub Actions preparation is described below; no production schedule enabled.

## Implemented manual workflow

File: `.github/workflows/scheduler-manual.yml`; display name: **Avatar scheduler - manual verification**.
Only `workflow_dispatch` exists. No `schedule`, `push`, PR or other automatic event is enabled.
The job runs only for `Daniel-opx/avatar-backend`, public visibility, branch `main`, on standard
`ubuntu-24.04`. If repository visibility changes, the job is skipped instead of using private
repository compute. No cache/artifact storage. Timeout is 35 minutes; overlapping manual runs
are serialized. Official checkout v6 is pinned to a verified full SHA, token permissions are
contents-read only, and checkout does not persist credentials. GitHub logs are public: output
contains only status, attempt count and elapsed time. No raw responses or business content.

Default **health** mode is GET-only and needs no secret. **cold-start-disabled-scheduler** waits
16 minutes without calling the backend, then performs the same authenticated test. It is a
one-off diagnostic; it does not enable recurring scheduling. Avoid opening backend URLs during
the wait; Render/GitHub dashboards can be used. Record observed latency and verify idle evidence
before claiming a natural cold start. **disabled-scheduler** mode uses
`AVATAR_SCHEDULER_KEY` from GitHub repository secrets to POST and expects `disabled`.
Authenticated manual modes also verify credential scope: POST `/jobs` with exactly `{}` must
return 401. Even an accidentally supplied owner key cannot create a job with this empty request;
the existing topic validator returns 400 instead, and the scope test fails without reading data.
The scope check occurs BEFORE the idle wait, so it does not disturb the cold-start measurement.
The client uses a fixed HTTPS destination, default TLS verification, no redirects, 120-second
per-attempt timeout and at most 3 attempts. No scheduler frequency is implemented in the client.
Mock tests verify bounded retries, immediate 401/403/409 failure and credential-safe error handling.

## Private owner setup (after backend deployment)

1. In Render → avatar-backend → Environment → Edit, add `SCHEDULER_API_KEY` with a NEW
   random value of at least 32 characters, different from `API_KEY`. Keep the owner key unchanged.
   Generate/enter/save this privately. Do not send it in chat or expose it in screenshots.
   Save/redeploy the reviewed backend. Never expose this page through full accessibility snapshots.
2. In GitHub → Daniel-opx/avatar-backend → Settings → Secrets and variables → Actions,
   choose New repository secret. Name: `AVATAR_SCHEDULER_KEY`. Value: the SAME new scheduler-only
   value saved in Render. Add secret privately. This is not the GitHub account API token and
   not the owner `API_KEY`, database URL, Supabase service key or QStash token.
3. Keep PostgreSQL scheduling disabled. In Actions → Avatar scheduler - manual verification,
   Run workflow on main with **health** first; then **disabled-scheduler**.
4. Expected authenticated log: a short JSON result with `status: disabled`, HTTP 200.
   Confirm the scheduler key gets 401 for `/jobs` in a controlled test. Keep job counts unchanged.
5. Do not add a schedule event or enable business scheduling without separate owner authorization.

Owner must complete new credential entry/submission; assistant can inspect secret NAMES only.
Maintainers who can edit secret-enabled workflow code can misuse the secret: review/protect
workflow changes, never run untrusted fork code with credentials, and do not rely solely on masking.

## Provider assessment, checked 2026-11-06

cron-job.org official FAQ says the service is free, supports custom request headers and POST,
and can invoke every minute. It documents a 30-second request timeout, 64-KiB response limit,
and storage of response history. Its API requires a separate account API key; the documented
management API default is 100 calls/day (not the execution schedule limit).

Two unresolved issues prevent choosing it automatically:

1. Render documents around one minute to wake a Free service, longer than the Cron FAQ timeout.
   A timed-out client does not prove a scheduler transaction did not commit. A later invocation
   must retry safely using the database's slot lock and unique index. No detached background
   request processing or guaranteed warm-instance availability should be assumed.
2. The provider FAQ explicitly says executor HTTPS certificate verification is not performed.
   Confirm current executor behavior with the provider, or select a provider that verifies TLS,
   before giving it a production credential. Do not infer secure identity checks from HTTPS alone.

Render Free also has monthly shared hours, bandwidth and build allowances. Bandwidth overage
can cause charges when a payment method is present; Free compute alone is not a blanket cost cap.
No plan, billing setting, payment method or resource quota was changed. Confirm account limits
before activation. The owner has authorized no added charges.

## Proposed request contract (provider independent)

- Method: POST.
- URL: `https://avatar-backend-65ep.onrender.com/internal/run-scheduler`.
- Header: `x-api-key` supplied privately using a fresh credential; never in a URL or repository.
- Body: empty; business configuration is read from PostgreSQL.
- Polling proposal: every 5 minutes, timezone Asia/Jerusalem. This is a proposal, not an enabled job.
- External job enabled: false. Database `schedule_config.enabled`: false.
- Verify TLS certificate and hostname. Never follow a redirect to send the credential elsewhere.
- Response recording: disable where possible; disabled endpoint currently includes configuration.
- Allow cold-start time with a provider supporting at least 120 seconds, or explicitly test/document
  a supported later retry policy. Use bounded retries for transport/5xx/429, not tight loops.
- Treat 401/403 as configuration errors; 409 as a schedule-configuration problem.
- A lost response is ambiguous: later retry is safe; never clear a slot or insert a manual duplicate.
- Keep the external service separate from business recurrence; never encode daily/weekly rules there.

## Acceptance still outstanding

Inactive recurring configuration is prepared at `docs/templates/scheduler-recurring.yml.example`.
GitHub does not execute that directory or file extension. It proposes five-minute polling away
from the hour boundary, requires a public original repository and explicit
`AVATAR_SCHEDULER_ENABLED=true`, and uses `SCHEDULER_EXPECT_DISABLED=false` to accept future
created/not_due results. CLI defaults remain health-only and expect-disabled. Moving/activating
this template and enabling DB scheduling both require separate owner authorization.
No activation variable or business schedule has been enabled by this work.

Use selected GitHub Actions with standard public runners and TLS verification; establish private
secret setup; deploy scheduler-only authentication; perform a one-off test while DB scheduling
remains disabled; verify authenticated response, duplicate
behavior, failure reporting and cold-start retry through that provider. Leave recurring execution
disabled even after testing. No Step 14 integration is claimed complete from these notes.

## Official sources

- https://cron-job.org/en/faq/
- https://docs.cron-job.org/rest-api.html
- https://render.com/docs/free
- https://render.com/docs/health-checks
- https://render.com/docs/deploys
- https://expressjs.com/en/guide/behind-proxies/
- https://docs.github.com/en/billing/concepts/product-billing/github-actions
- https://docs.github.com/en/actions/concepts/security/secrets
- https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
- https://upstash.com/pricing/qstash
- https://upstash.com/docs/qstash/features/security
- https://upstash.com/docs/qstash/api-reference/messages/publish-a-message
- https://github.com/actions/checkout
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
