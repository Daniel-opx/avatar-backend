# Step 17 — asset preparation (mock-only)

Implemented/tested and deployed as `d53aa9a` on Render Free, 2026-11-08. Final regression:
91 passed, zero failures/skips; updated mock demo passed. Live health/readiness 200 and
unauthenticated asset routes 401. Live account/storage/avatar/voice verification is pending.

Continues the owner's mock-only/no-additional-spending policy. Real LLM API access/budget,
HeyGen API video credits/budget, avatar/voice permissions and live media verification remain
outstanding. No HeyGen, storage or voice account was activated, no bucket created, no object
uploaded, and no ElevenLabs or other TTS request was made.

The current HeyGen developer guide supports an avatar, voice and script workflow, and a
separate audio-input workflow. Separate external TTS is therefore optional. We use a
provider-neutral manifest rather than an assumed old HeyGen v2 payload; the old v2 reference
URL returned 404 during research. Step 18 must verify and implement the current endpoint
for the eventually selected avatar/account. A manifest is not a submitted render request.

## Storage model and validation

The migration adds `asset_config` (disabled, no avatar/voice), `job_assets` and
`asset_manifests`. All have RLS enabled and no public/anon/authenticated grants.
CLI-generated migration was applied once through the Supabase connector and aligned to
hosted version `20261108191748`: `supabase/migrations/20261108191748_asset_preparation.sql`.
The tables do not backfill existing jobs or activate preparation. The trusted
backend database role and owner API key are required. Asset records and manifests are tied
to an immutable content revision; older versions are retained when content is regenerated.
No real credentials or signed URLs are stored in these tables.

Registered media uses private bucket/object references, not arbitrary download URLs.
The service rejects traversal, encoded path components, unsupported types and invalid sizes
or SHA-256 metadata. It cross-checks MIME/size/hash with a storage adapter before registration
and preparation. Metadata replacement conflicts rather than silently changing an asset.
Registration is serialized with claims, limited to 20 media references per revision, and
refuses changes after preparation has started. A repeated identical reference reuses its ID.

| Type | Allowed MIME types | Maximum size |
| --- | --- | --- |
| Image | image/jpeg, image/png, image/webp | 10 MiB |
| Audio | audio/mpeg, audio/wav, audio/mp4 | 25 MiB |
| Video | video/mp4, video/webm | 100 MiB |

These are local validation limits, not claims about HeyGen account limits. Only controlled
mock storage adapters exist. They do not prove uploaded bytes match a declared MIME/hash,
that an actual bucket is private, or that HeyGen can fetch it. A real upload integration
must inspect bytes/checksums, enforce private storage policies and recheck provider limits.

## Manifest and worker

The manifest includes the content revision, script, scene plan, avatar ID, voice settings
and media IDs. Default voice mode `builtin` requires neither external TTS nor a separate
audio object. Optional `external_mock` accepts only an injected mock synthesis adapter,
uses a stable job/revision operation key, and verifies its audio reference through mock
storage. It produces no real speech file. A real ElevenLabs adapter would additionally
need credentials, budget approval and a durable submission journal before it can be used.

Manifest insertion, checkpoint persistence and advancement to `render` share the existing
lease-fenced transaction. Concurrent/late workers cannot overwrite the current stage.
Recoverable mock storage/signing failures use existing bounded retries; metadata mismatches
and invalid/expired assets stop safely. Jobs moved to review cannot commit a draft manifest.

`resolveForRender` rechecks references and obtains fresh short-lived signed URLs just before
handoff to a trusted renderer. It enforces HTTPS, an exact configured storage origin/object
path, no credentials/fragments/IP literals, a token, and 5–60 minutes remaining validity.
URLs are returned transiently, never persisted in history or worker checkpoints. No URL
is fetched by this code; real accessibility and DNS/storage/provider behavior are unverified.
Built-in voice with no media needs no storage adapter or signed link.

Production `createPipeline` deliberately passes no preparation permission, mock storage
adapter or TTS adapter. The database also starts disabled. There is no environment shortcut
to activate the asset handler. Mocks are instantiated only by tests and the local demo.
Normal production processing remains disabled; no recurring trigger is changed.

## Owner-only routes and retention

- `GET /jobs/{id}/assets`: metadata and saved manifests. No signed URLs.
- `POST /jobs/{id}/assets`: `{ "revision": 1, "asset": { ...metadata... } }`.
  Production returns unconfigured (409); registration requires explicitly injected mock
  preparation/storage adapters. This is not a file-upload endpoint.

The scheduler-only key is denied both routes. Validation errors and adapter failures use
sanitized responses rather than raw storage errors or tokens.

Retention defaults to 30 days. The service's explicit `expireReferences()` maintenance
method marks up to 100 old/expired references per call; it is disabled in production and
has no automatic trigger or HTTP route. Metadata stays inspectable and expired references
cannot render. It never deletes real storage objects. Actual file deletion/retention must
be reviewed with storage ownership and required audit retention before live uploads.

## Verification

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
$env:RUN_DB_TESTS = '1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
npm run demo:mock
```

Asset-only database checks: `npm run test:assets:db` with `RUN_DB_TESTS=1`.
The full suite serializes test files to fit the existing Supabase session pool. Individual
tests still exercise overlapping requests/workers. Do not run the database demo alongside
the full suite: separate schemas isolate records but still share the connection allowance.
Tests use disposable `step17_test_<uuid>` schemas and controlled storage/voice functions.
The demo uses this manifest service and Step 18's durable render journal, with simulated
content/HeyGen responses. Success is mock evidence, not a real video or live acceptance.
See [RENDERING.md](RENDERING.md); unsupported multi-scene/external media is rejected explicitly.

Official references checked 2026-11-08:
[HeyGen Digital Twin](https://developers.heygen.com/generate-avatar-video),
[HeyGen Audio to Video](https://developers.heygen.com/audio-to-video),
[Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
