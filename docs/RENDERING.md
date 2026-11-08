# Step 18 — HeyGen rendering (mock-only)

Implements a durable render journal and an adapter modeled on the current HeyGen v3
contract. Every transport is explicitly injected with `mode: mock`; there is no default
HTTP client and no real API key accepted by this adapter. The production pipeline creates
the render service without permission/provider, so environment keys cannot enable it.
The database starts disabled, in mock mode, with a zero submission allowance.

Real LLM API funding and HeyGen API access, avatar/voice permissions, credits and a separate
approved video budget remain outstanding. No new paid account/resource, real video, speech
request, upload, publishing or advertising is authorized by this implementation.

## Supported request contract

The adapter models `POST /v3/videos` and `GET /v3/videos/{video_id}`, `x-api-key`, and the
documented `Idempotency-Key` mutation header. It uses a fixed mock credential, HTTPS URLs,
no redirect following, and a UUID submission key. It never reads `.env` provider credentials.
The current direct API uses v3; old v1/v2 routes are not used.

Supported composition is one avatar scene with a saved Hebrew script, selected mock
avatar/voice, built-in voice synthesis, and explicit engine/resolution/aspect ratio.
Configuration defaults are simulation settings, not selected or verified account capabilities.
Extra media, external audio and multi-scene manifests are rejected before reservation or
submission. Scene notes/overlay text are not silently converted into an edited video:
this adapter produces only the basic talking-avatar request. Full scene composition and
real avatar capabilities need a separate implementation/verification before live use.

The provider's guide/reference describes queued/in-progress, completed and failed results.
Responses are normalized without saving provider messages or presigned output URLs. Mock
video IDs must begin `mock_`; they are saved in the journal and never copied into
`jobs.heygen_video_id`. Consequently a real completion/review link is never implied.

## Durability and retry rules

- Before each submission, serialize the job/revision and global allowance, save the
  request/payload and operation token, increment the reservation count, and commit.
  One request exists per asset-manifest revision. Each explicit rejection retry uses the
  same request UUID/idempotency key and snapshotted payload.
- Save the returned mock ID before the worker checkpoint. Later invocations poll that ID;
  restarting or losing the checkpoint does not submit another video.
- A transport timeout, HTTP 5xx, in-flight idempotency conflict, invalid submission response,
  or unfinished submission reservation has an uncertain outcome. Stop for reconciliation;
  never blindly resubmit. Provider idempotency has a documented replay window, so this
  journal does not assume that its protection lasts forever.
- Explicit rate-limit rejections use backoff, at most three submissions, and a serialized
  overall submission allowance. Respect `Retry-After` before another call; delays longer
  than an hour stop automatic retry. Quota/access/other permanent rejections stop.
- Known-ID polling can retry transient failures without submitting a replacement. Three
  consecutive read failures or the configured total poll limit require reconciliation.
  Pending polls reset only the worker's consecutive failure budget, not the durable poll cap.
- A token fences each poll's journal update. A late/older response cannot overwrite a
  newer result. Final processing completion is lease-fenced and reuses a cached completed
  journal after rollback/acknowledgement loss without more provider requests.

Each call uses an eight-second AbortSignal bound inside the worker's ten-second operation
timeout. Only one short submit/poll operation is awaited per request; no detached renderer
or long-held HTTP request is required. No callback is registered. Reconciliation overrides,
authenticated webhooks, media retention and working review links are Step 19 work.

## Database and inspection

The CLI-generated migration adds `render_config`, `render_requests`, `render_calls`.
Applied once through the Supabase connector and aligned to hosted version `20261108193747`:
`supabase/migrations/20261108193747_render_requests.sql`.
All have RLS and no public/anon/authenticated grants. No old job is enrolled/backfilled.
`render_config.max_submissions` defaults to zero; reservations count even interrupted calls.
`max_polls` defaults to 60 and is snapshotted per request. This is not a dollar billing cap.
Estimated cost stays NULL because no real usage/price was reported; NULL is not zero cost.
Calls retain action, timestamps, sanitized outcome/code, HTTP status and request ID.

Owner-only `GET /jobs/{id}/rendering` returns sanitized request/call history without raw
payloads, credentials or video URLs. The scheduler-only key is denied. Existing owner-only
`POST /internal/processing/run` remains the sole worker trigger; there is no submit/enable
HTTP route. Completed simulated jobs stop at a clearly simulated human-review state.

## Verification (PowerShell)

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
$env:RUN_DB_TESTS = '1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
npm run demo:mock
```

Rendering database checks alone: `npm run test:rendering:db` with `RUN_DB_TESTS=1`.
Run suites and demo sequentially to fit the existing database connection allowance.
Tests use disposable `step18_test_<uuid>` schemas and mock transports. No real endpoint,
avatar/account authorization, media generation, cost or provider replay behavior was verified.
The demo uses the real content, asset and render journal services with controlled providers;
its persisted `mock_` ID is removed with the disposable schema. No MP4 or review media exists.

Official documentation checked 2026-11-08:
[Create Video](https://developers.heygen.com/reference/create-video),
[Get Video](https://developers.heygen.com/reference/get-video),
[Digital Twin guide](https://developers.heygen.com/generate-avatar-video),
[Error Codes](https://developers.heygen.com/docs/error-codes).
