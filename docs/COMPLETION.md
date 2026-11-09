# Step 19 — mock callbacks, retention and review

Implemented for controlled mock adapters only. No live webhook is registered, no HeyGen
secret/account is configured, and no remote media is downloaded. Production composition
constructs a disabled completion service without provider, signing secret or storage adapter.
Environment variables cannot enable it. The database singleton also defaults disabled.

## Callback contract

`POST /webhooks/heygen` receives at most 32 KiB of uncompressed JSON bytes, before JSON
middleware. In the mock harness, the `signature` header must contain the hexadecimal
HMAC-SHA256 of those exact bytes. The secret is independent of the owner API key.
Comparison uses constant-time buffers. Invalid authentication is 401; authenticated malformed
events are 400; accepted inbox events are 202; duplicate/unsupported events are 200.
The default deployed service returns 503 disabled and never accepts a real event.

The contract follows the current [HeyGen webhook documentation](https://developers.heygen.com/docs/webhooks)
and [event reference](https://developers.heygen.com/docs/webhook-events), checked 2026-11-08.
No signed timestamp is documented; no timestamp-based freshness guarantee is claimed.
Logical deduplication hashes event type plus video ID; optional delivery IDs are unique too.
Only hashes, correlation IDs, event type and inbox state persist. Raw payloads, supplied
URLs and raw error messages are discarded. Unknown mock resources remain unmatched.
Callback UUIDs and known video IDs must agree; real video IDs are rejected in this phase.

Callbacks are completion signals, never instructions to download a supplied URL or directly
change a job. Reconciliation checks the known mock provider resource first. Early callbacks
can supply a candidate ID only when the authoritative response echoes the reserved request UUID.
Authoritative success/failure controls outcomes; contradictory terminal results cannot regress
completed/failed renders. Requests include their reserved UUID as `callback_id`.

## Retention and recovery

Owner-only `POST /internal/videos/:renderRequestId/reconcile` performs one bounded check;
there is no timer, background activation or callback registration. It also works with no
callback when the submission journal already contains the external ID. A database lease and
fencing token serialize concurrent retention. Provider inspection rotates the render token
to invalidate an older in-flight poll result. Waiting checks back off, with at most 120 checks;
three consecutive provider/storage failures require explicit recovery.

The injected mock store copies to a deterministic private object key with put-if-absent
semantics, then verifies its MIME type, size and SHA256 against independent metadata.
Owner-key or admin/operator-session `POST /jobs/:jobId/video/retry-media` resets bounded inspection/retention retries
for a known, non-failed video without resubmitting generation, and revokes old review grants. A lost copy or
database commit acknowledgement recovers using the same object identity. Cancellation and
revision changes prevent promotion and invalidate review access. An interrupted remote copy
could leave an orphan object; live cleanup/lifecycle rules still need a real adapter.

The fixture store is an in-memory Map; it is not durable across process restarts and does
not contain a playable MP4. Database state/recovery is tested against PostgreSQL, while
provider calls and object retention use controlled mocks. Production durability, real
download limits/redirect/SSRF protection, private bucket policies, checksums and account
permissions need implementation and live verification before enabling a real adapter.
There is no fallback to fetching callback URLs and no real storage bucket was provisioned.

## Protected review

Owner-key or team-session `GET /jobs/:jobId/video` returns sanitized media/event history without object
paths, payloads, secrets or bearer links. `POST /jobs/:jobId/video/review` permits all team roles
with CSRF verification, or the existing server owner key, and issues
a relative `/review/:token` link for retained, completed, current, uncancelled media.
Tokens contain 256 random bits; only SHA256 hashes are stored. Default expiry is five minutes,
configurable from 30–900 seconds. The bearer link requires no owner key, so share privately.
Expired, revoked, cancelled or superseded grants return 404. Reads verify size/hash and use
`Cache-Control: no-store`. Responses label the bytes as mock and do not claim a real video.
HTTP logs omit paths, links, request bodies and credentials. Scheduler keys cannot access
history, reconciliation, media retry or link issuance.

All four new tables have RLS enabled and PUBLIC/anon/authenticated privileges revoked.
The CLI-generated migration was applied once through the Supabase connector and aligned
to hosted version `20261108200903`: `supabase/migrations/20261108200903_webhook_media.sql`.
Intentional private-table/no-policy informational advisories are expected. The backend role
accesses these tables directly; public Supabase API access is not used. For future real
storage, [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads)
require authenticated access or an authorized expiring link.

Step 18's standalone service can still finish a mock poll before retention; protected review
always requires Step 19 media readiness. Step 20's shared composition now applies this gate
before the worker finishes; see [PIPELINE.md](PIPELINE.md).
Human approval, publication and advertising are separate future steps and remain disabled.

## Verification commands

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
$env:RUN_DB_TESTS='1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
# Run only after the suite finishes; both use the same existing database allowance.
npm run demo:mock
```

For focused database coverage use `npm run test:completion:db` with `RUN_DB_TESTS=1`.
The tests create a uniquely named disposable schema without copying business data, then
remove it. They cover signature tampering, concurrent duplicates, early/late/failure events,
missed callbacks, bounded storage retries, lease recovery, cancellation, commit-ack loss,
corrupt bytes, expiring/revoked grants and owner/scheduler route separation.

Live acceptance remains pending: real LLM account/key/budget, HeyGen API access and approved
video credits/budget, account-backed webhook authenticity/delivery and durable private media.
Follow [MOCK_DEVELOPMENT.md](MOCK_DEVELOPMENT.md); mock success authorizes no spending.

Verification on 2026-11-08: full serialized regression 131 passed; final focused Step 19
suite 19 passed, zero failures/skips. Updated mock walkthrough passed. Hosted migration,
private-table privileges and disabled local route wiring verified. Account-backed delivery,
real file retention and playable video remain unverified.
Application source `21665a3` deployed to the existing Render Free service. Live health/readiness
returned 200, owner routes rejected anonymous requests with 401, and callback/review operations
returned 503 disabled. No recurring trigger, external account or storage bucket was activated.
