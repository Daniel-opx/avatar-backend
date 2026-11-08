# Step 16 — Hebrew content generation

Owner decision: continue with mocks only. A real LLM API account, private credentials and
approved test budget remain required; the ChatGPT membership is not counted as API funding.
See [MOCK_DEVELOPMENT.md](MOCK_DEVELOPMENT.md). No live acceptance is implied by the local demo.

Provider-neutral content service with an optional OpenAI Responses adapter. The owner has
not selected a provider/model or authorized a live test budget. Tests use controlled
provider responses; no live LLM generation has been verified. No default model or pricing
is assumed. No SDK/dependency or paid resource was added.
Application source `697380e` deployed successfully to Render Free on 2026-11-08;
health/readiness returned 200 and both new routes denied unauthenticated requests.
Final regression: 76 passed, zero failures/skips. Live database has zero content calls/versions.

## Data and execution

Migration: `supabase/migrations/20261108184837_versioned_content.sql`, generated with
Supabase CLI and aligned to the hosted migration version after application through the
Supabase connector. Applied once on 2026-11-08 after Step 15; it does not activate generation or enroll old jobs.
Six content tables have RLS and no `anon`/`authenticated`/PUBLIC grants.

- `content_prompts`: numbered prompt versions. Insert a new version rather than changing
  an existing one; select it using `content_config.prompt_version`.
- `content_config`: disabled by default, provider/model unset, request allowance zero.
  Verified business facts and optional USD-per-million token rates are configured here.
- `content_requests`: one durable journal entry per job/revision. Before submission it
  snapshots topic, facts, prompt text/version, model, output-token limit and optional rates.
- `content_calls`: per-attempt outcomes, request ID, resolved model, timestamps, duration,
  input/output tokens and estimated cost where known. Provider keys/raw errors are omitted.
- `content_versions`: successful validated packages, retained across regeneration.
- `content_regenerations`: idempotent owner requests to create a new content revision.

The existing content processing stage uses the journal. Every submission first reserves
one request from a database-serialized allowance. A successful saved package is reused
after a checkpoint/commit/restart failure without making another provider request. Script
and visual plan are copied to `jobs` only inside the lease-fenced checkpoint transaction.
The stage advances to `assets`; content generation alone never marks a video ready or approved.
Caption/hashtags/metadata remain in the versioned package and are retrieved through the API.

Explicit provider rate-limit rejections retry with backoff and a maximum of three calls
per revision. Insufficient quota, refusals, incomplete output, invalid content and other
permanent rejections stop. HTTP 5xx, transport errors and timeouts may already be billable:
they require reconciliation instead of automatic resubmission. An unfinished journal entry
after restart is also conservative; neither worker retry nor regeneration can bypass it.
There is no generic reconciliation override yet. Provider-specific recovery remains future work.

Requests use an eight-second AbortSignal timeout inside the ten-second processing timeout.
The adapter must honour cancellation. There is no detached generation after an HTTP response.
A provider too slow for this bound needs a separately designed resumable integration; no
claim of live latency/compatibility is made. OpenAI requests use a fixed HTTPS endpoint,
strict structured output, no tools, no automatic HTTP retries, `store: false`, and no redirect
following. `store: false` is not a claim of zero provider-side retention.

## Content validation and human review

The closed JSON schema requires Hebrew script/caption, hashtags, bounded scene descriptions,
on-screen text and durations, claims with source facts, and tone/audience/review metadata.
Local validation rejects missing/extra keys, wrong types, English-only required Hebrew
fields, invalid hashtags, out-of-range values and unknown fact references.
It does not coerce or repair malformed output. The prompt treats the topic as data, asks
for conversational Hebrew, and prohibits invented statistics, prices, credentials,
testimonials, guarantees and health/financial claims. With no verified facts it requests
neutral educational wording. Every declared claim must cite an exact configured fact.

These checks do not establish truth, fact entailment, complete claim disclosure, Hebrew
fluency or prompt-injection resistance. Those require human editorial review and real
provider evaluation. Nothing generated here is approved for publication automatically.

## Owner-only API

Step 17 consumes the saved content revision to prepare a private asset manifest. Regeneration
keeps prior content/assets as history and does not reuse another revision's media references.
See [ASSETS.md](ASSETS.md); no live storage or TTS provider is activated.
Step 18 journals a mock single-avatar render using that manifest; it never treats a mock ID
as a real video. Live LLM/HeyGen accounts and budgets remain outstanding.

Both routes require the owner `x-api-key`; the scheduler-only key is denied.

- `GET /jobs/{id}/content`: stored versions and sanitized request/usage history.
- `POST /jobs/{id}/content/regenerate`: body `{"request_key":"<new UUID>"}`.
  Reuse the same UUID after an HTTP retry; it queues only one new revision. This endpoint
  does not call a provider. It accepts draft jobs before downstream work begins, and
  rejects running/uncertain work and jobs at review or later. Earlier versions remain;
  the current script/plan and content checkpoint are cleared until the new version succeeds.

Processing still runs only through the existing owner-only manual
`POST /internal/processing/run`. The GitHub scheduler key never gains this permission.

## Activation remains separate

Runtime requires `CONTENT_LIVE_ENABLED=true` and the selected provider's private server
credential (`OPENAI_API_KEY` for the optional adapter), AND database processing enabled,
content enabled, a selected provider/model and a positive request allowance.
All activation flags remain off; `.env` was not changed. There is no HTTP activation route.
Model availability, account access, structured-output compatibility, latency and pricing
must be verified with the chosen account before any authorized live test.

`max_requests` counts reservations including failed/uncertain submissions and caps calls
across concurrent workers. It is not a dollar billing cap. A future owner-approved test
must set an appropriate small allowance and provider-side controls. Estimated costs use
snapshotted administrator-supplied rates and reported token usage; missing rates or usage
produce NULL, never a misleading zero. Estimates ignore discounts/caching/provider fees
and are not invoices. Unknown outcomes can have unknown charges. No live test was run.

## Verification (PowerShell)

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
$env:RUN_DB_TESTS = '1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

Or replace `npm test` with `npm run test:content:db` for content database checks only.
Tests apply migrations to disposable `step16_test_<uuid>` schemas, copy structure without
business records, exercise real PostgreSQL transactions and drop their own schema afterward.
Provider responses are controlled fixtures, not real AI output or evidence of model quality.

Official API documentation checked 2026-11-08:
[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
[Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create),
[Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
