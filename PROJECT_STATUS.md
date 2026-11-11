# AI Avatar Automation — development status

Updated: 2026-11-11 (Asia/Jerusalem).
Authoritative roadmap: [DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).
Original Hebrew architecture document: not found in the repository; requirements depending on it remain unresolved.

## Current handoff — 2026-11-11

Owner resumed development for Step 16 on 2026-11-08 after the Step 15 pause.
Owner subsequently authorized **mock-only continuation with no additional spending**.
Owner resumed development on 2026-11-09 and requested two milestones at a time, in roadmap
order. Steps 23–24 are deployed. Current work: Step 25, paused mock Meta campaign preparation.
This supersedes the Step 20 feature pause; mock-only/no-additional-spending restrictions remain.
Real LLM API account/model/credentials/budget and HeyGen API video credits/rendering budget
remain outstanding. The ChatGPT membership and HeyGen free web plan are not treated as
funded backend API access. See [MOCK_DEVELOPMENT.md](docs/MOCK_DEVELOPMENT.md) for the policy
and repeatable local walkthrough. No real provider activation or plan upgrade is authorized.
Step 16 code and database tests passed; AI provider remains undecided and live verification is pending.
Latest verified application deployment: `7021c2c` on the existing Render Free service.
Step 25 source is not deployed: Render's service and workspace dashboards remained on
Loading after refresh/navigation. Its private schema migration is applied with disabled defaults.
Last verified database state: 4 jobs, scheduling=false, processing=false, 0 queued jobs,
content_enabled=false, assets_enabled=false, render_enabled=false, completion_enabled=false, provider/model unset,
max_requests=0, max_submissions=0, submissions_used=0, zero content/render calls and generated
versions/assets/manifests/requests, no leftover test/demo schemas. GitHub workflow remains manual-only. No paid provider
calls, automatic publication, advertising or unattended processing were enabled.
Last complete regression suite: 175 passed, zero failures/skips (Step 25).
Preexisting local dashboard CSS, `test.js` and generated-folder changes are left untouched
and excluded from this step's commits.

## Checklist

- [x] Steps 1–11: existing backend and recurring scheduler; earlier live integration passed.
- [x] Step 12: scheduler reliability/recovery — isolated PostgreSQL tests executed successfully.
- [x] Step 13: Free deployment, settings, authentication, restart and controlled post-idle recovery verified; infrastructure limitations documented.
- [x] Step 14: GitHub-hosted health, scoped authentication and repeated post-idle triggers verified; recurring template prepared but intentionally inactive.
- [x] Step 15: durable processing/lifecycle, attempts, leases, retries and cancellation; disabled by default, real provider adapters remain future work.
- [ ] Step 16: provider abstraction and versioned Hebrew content implemented/tested; chosen-account live test still pending.
- [ ] Step 17: mock-only asset preparation implemented/tested; live media/avatar/voice acceptance deferred.
- [ ] Step 18: mock HeyGen v3 adapter and durable submit/poll journal implemented/tested; live test deferred.
- [ ] Step 19: mock authenticated/deduplicated callbacks, private fixture retention and review implemented; live acceptance pending.
- [ ] Step 20: small mock workflow connected/tested through retained-media review; live acceptance pending.
- [ ] Step 21: managed identity adapter, private sessions/roles and separate internal authentication implemented; live user acceptance pending.
- [ ] Step 22: version-bound mock approvals, inbox notifications and replacement generation implemented/tested; actual-video/human acceptance pending.
- [ ] Step 23: Hebrew/RTL dashboard implemented, mock-tested and deployed; real sign-in/user acceptance inactive pending review.
- [ ] Step 24: documented GHL v3 mock adapter/journal implemented; real account/permissions/media/publication acceptance pending.
- [ ] Step 25: paused mock Meta campaigns, exact-budget/activation review implemented and mock-tested; Render deployment and live account/activation acceptance pending.
- [ ] Step 26: source-backed performance metrics.
- [ ] Step 27: evidence-backed recommendations with separate approvals.
- [ ] Step 28: durable audit, monitoring and alerts.
- [ ] Step 29: full acceptance/security testing and authorized live demonstration.
- [ ] Step 30: operational documentation and separately approved gradual launch.

## Step 25 implementation and evidence

Owner requested the next step on 2026-11-11. Added only mock paused Meta campaign preparation,
not Step 26 analytics. Current official Meta SDK source confirms versioned Graph edges and
campaign/ad-set/creative/ad structures. Several Meta documentation pages returned 429 or
were unavailable; actual permissions, account setup and payload acceptance remain unverified.
See [META_ADVERTISING.md](docs/META_ADVERTISING.md) for sources and precise scope.

The immutable draft binds approved content, targeting, schedule and integer ILS lifetime
budget. An admin must separately review its exact budget hash; operators cannot grant it.
Activation review is a separate mock record, and actual activation remains hard-locked even
after both reviews. New settings default disabled with zero allowance; no live adapter,
credential, campaign, budget increase or spend is installed/authorized.

Four private tables store configuration, drafts, decisions and per-stage operations. Row locks,
unique constraints and commit-before-I/O reservation prevent duplicate stage writes. Unknown
creation results quarantine without retry. Known-ID reads have persisted backoff and a
three-check limit. API-only addition uses existing team roles/CSRF, without changing dashboard UI.

Focused verification: 13 test records passed with isolated PostgreSQL and mock Meta. All
14 final Meta test records, including lost-commit-acknowledgement and successful status-read
cases, passed within the full regression run: 175 passed, zero failures/skips (684 seconds).
Migration `20261111125826_mock_meta_campaigns.sql` is applied and matches the hosted ledger.
The initial concurrency assertion was corrected to permit legitimate
progress through distinct stages while requiring exactly one call for each stage.
Preexisting dashboard CSS, test.js and generated folders are excluded from this work.
Post-migration check: 4 production jobs; zero Meta drafts, decisions and operations; all eight
scheduling/generation/publishing/Meta flags false; zero test schemas remain. Four new tables
have RLS and deny client reads. Advisors report no new unindexed foreign keys (three existing
INFO findings), 36 intentional private-table RLS/no-policy INFO findings, unused-index INFO,
and the existing leaked-password-protection warning tracked in the sign-in review.
Local wiring: owner-key GET /jobs 200, anonymous Meta detail 401, login 503 inactive. No secret
or business row was printed. Source/docs are committed and pushed; deployment remains pending
because Render's dashboard never exposed deploy controls. No deploy was triggered. Screenshot:
`step25-render-loading.png` in the session visualization directory. This is an observed browser
loading failure, not evidence of a Render-wide outage. Existing deployed health/readiness/
dashboard returned HTTP 200 after the blocked deployment check. No Step 25 live deployment
or provider-account acceptance is claimed.

## Steps 23–24 implementation and evidence

Added a same-origin, framework-free RTL dashboard for login, job creation/filtering, text,
history, review, notifications and scheduling. Admin-only schedule edits use version checks;
activation stays locked. No server keys or provider credentials enter the browser. Prepared
[Auth settings for review](docs/AUTH_ACTIVATION_REVIEW.md) without applying/activating them.

Verified current official GHL v3 docs and added an injected mock-only Facebook-video adapter
with a durable per-approval/account journal. Current approval is checked before reservation;
concurrent retries cannot duplicate posts, uncertain writes stop and known-ID reads are bounded.
Production has no live provider/token. Mock IDs never populate real GHL fields or job status.
See [DASHBOARD.md](docs/DASHBOARD.md) and [GHL_PUBLISHING.md](docs/GHL_PUBLISHING.md).

Initial focused checks: 12 passed, including existing security checks. Browser preview verified
simulated login, RTL workspace, text/review, mock submission and logout. It used only generated
data/identities; its exact schema was verified and removed after the preview process stdin
closed. No real user/password, decision, provider call or social post was used. Publishing
proof screenshot is from the local mock preview. Full database-enabled regression: 161 passed,
zero failures/skips, including overlapping publication, stale approval, uncertain submission,
lost reservation acknowledgement, scheduled replay and read-only reconciliation cases.
The extended five-stage mock demo also passed: one simulated GHL create despite replay,
zero real posts/provider calls, unchanged production configuration and disposable-schema cleanup.
Migration `20261109082635_mock_social_publishing.sql` is applied and matches the hosted ledger.
Final browser check verified the inline review acknowledgement, persisted simulated approval
and logout. Both preview sessions used disposable mock identities and data only.
Post-migration verification: 4 jobs, 1 enabled member, zero sessions/approvals/provider calls/
publishing requests/accounts; all six automation flags false, publishing disabled with zero
allowance; no fixture schemas remain. All three new tables have RLS and deny client reads.
Advisors: 32 intentional private-table RLS/no-policy INFO findings, three existing unindexed
foreign keys and unused-index INFO findings. Auth leaked-password protection is disabled;
recorded for sign-in review without changing account settings or enabling a paid feature.
Application `7021c2c` deployed manually to the existing Render Free service as
`dep-dboo96qjnfac73fhn7b0`, Deploy succeeded | Live, 2026-11-09 at 10:30 Asia/Jerusalem.
Live checks: health/readiness/dashboard/JS/CSS 200, root redirect 302, anonymous dashboard/
publishing-account/Auth-me APIs 401, Auth-login 503 inactive. Local owner-key GET /jobs remained
200 without printing its value or business rows. Actual team login remains unverified.
Deployment evidence: `step23-24-render-live.png`; local mock UI evidence:
`step23-dashboard-overview.png` and `step23-dashboard-mock.png` in the session visualization directory.
No paid resource, recurring trigger, real provider or publication was activated. Code and
documentation are pushed; only the unrelated preexisting `test.js` modification remains local.

## Steps 21–22 implementation and evidence

Added Supabase Auth password/getUser adapter using pinned official Auth SDK; private team
memberships, opaque short-lived cookie sessions, CSRF/origin validation, role boundaries,
immediate local/session-row revocation, last-admin protection and audit records. Existing
owner/scheduler authentication remains separate; shared keys cannot make human decisions.
Initial deployment provisioned no member and enabled no authentication flag; the first admin
was subsequently registered as recorded below. Account-backed sign-in verification remains
pending. No `.env` values or credentials were changed.

Added approval snapshots/fingerprints, authenticated reviewer decisions with comments/time,
deduplication and conflict protection, in-app notifications, stale-content rejection and
same-job replacement revisions preserving old content/decisions. Mock decisions never set
publishable job status; the service gate and database trigger deny publication. No publisher,
WhatsApp/email message or paid integration was activated. See [TEAM_ACCESS.md](docs/TEAM_ACCESS.md)
and [APPROVALS.md](docs/APPROVALS.md). Initial focused checks: 10 passed; expanded checks:
12 passed, including replacement generation. Full serialized suite: 151 passed, zero
failures/skips (574.2 seconds). Final focused run after tightening readiness: 12 passed,
zero failures/skips (94.6 seconds). Updated mock demo passed, with simulated team sessions,
one simulated approval, publication denied and immediate logout revocation; no real reviewer
or account was used. Its disposable schema was removed.
Applied additive migrations `20261109053326_team_access.sql` and
`20261109053341_video_approvals.sql` through the Supabase connector; CLI-generated files
aligned to the hosted ledger. No team membership or activation flag was inserted/enabled.
Post-migration verification: original 4 jobs, all six generation switches false, zero team
members/sessions/requests/decisions/notifications/audit records/provider calls and no leftover
test/demo schemas. All six new tables have RLS and deny anon/authenticated reads. Advisors:
INFO only (private RLS/no-policy, 3 older unindexed FKs and unused indexes); no warning/error.
Local owner-key job listing and disabled processing returned 200; team login 503 inactive,
unauthenticated/team-administration requests 401, and shared-key human approval attempts 401.
The actual backend role can read the managed Auth metadata needed for session/enrollment checks.
Implementation `f253012` deployed manually to the existing Render Free service as
`dep-dbolpis9v7es73fluri0` on 2026-11-09 at 07:40 Asia/Jerusalem (live at 07:41).
Live health/readiness returned 200; auth login 503 inactive; anonymous identity, team inbox,
membership, approval and internal-processing requests returned 401. New public-schema
helper functions deny anon/authenticated execution. Post-deployment counts remain 4 jobs
and zero real team members/sessions/approval requests/decisions/notifications.
Deployment screenshot: `steps21-22-render-live.png` in the session visualization directory.
Real sign-in remains pending private configuration; the first administrator is now registered. Actual
human/video acceptance remains pending. No outbound messages, paid call, generation activation,
publishing or advertising occurred. Follow-up report commit changes documentation only.
Steps 23–24 followed this milestone; see their evidence above. Existing `test.js` modification
remains untouched and unstaged.

First administrator setup — 2026-11-09: owner supplied a Supabase Auth user UUID. Verified
the user exists and email is confirmed, then atomically registered it as the first enabled
administrator under a team-table lock and inserted one bootstrap audit event. Post-check:
exactly one enabled administrator and one bootstrap audit event; all six generation switches
remain false. No password, key, `.env`, Render activation setting or user identity was placed
in Git. Supabase/Render Auth configuration and real login verification remain pending.

## Step 20 implementation and evidence

Reused existing services, tables and manual processing trigger; no new migration, endpoint,
dashboard or infrastructure. Shared composition now checkpoints completed renders before
retention, and checks retained media inside final worker completion before `ready_for_review`.
The demo uses this same composition. Production stays disabled; real LLM/HeyGen/storage
verification remains pending. See [PIPELINE.md](docs/PIPELINE.md).
Focused end-to-end checks: 6 passed with real isolated PostgreSQL and mock providers.
Confirmed one generated content package/submission/retained fixture under overlapping workers,
no review before retention, storage recovery and final-checkpoint rollback recovery without
repeating earlier stages. Disabled retention prevents submission; cancellation stops later work.
Full serialized regression suite: 139 passed, zero failures/skips (476.8 seconds).
Updated mock demo passed through five worker invocations, with one mock content call and
one mock video submission, retained fixture/review grant verified, zero real calls/publication.
Post-run production verification: original 4 jobs, all six switches false, zero provider calls,
media/events/grants and leftover test/demo schemas. Owner-authenticated local manual trigger
against the live database returned HTTP 200 disabled. No `.env`, migration or provider change.
Implementation `f80eb96` deployed manually to Render Free as `dep-dbodp0hsrm7s73bmc03g`
on 2026-11-08 at 22:33 Asia/Jerusalem. Live health/readiness returned 200, anonymous manual
processing returned 401, callback/review operations returned 503 disabled. No Render owner
credential was retrieved or provider activated. Deployment screenshot: `step20-render-live.png`
in the session visualization directory. Documentation synced separately after deployment.
Broader features are now deferred at the agreed MVP checkpoint; real-account acceptance remains pending.

## Step 19 implementation and evidence

Added raw-body HMAC-SHA256 verification, a durable minimal inbox, logical event/delivery
deduplication and callback/request correlation. Callback URLs and raw payloads are discarded.
Owner-triggered reconciliation checks the authoritative mock resource and handles early,
missed, delayed and contradictory terminal signals. Leases and tokens fence concurrent/late
workers. Bounded media retries reuse deterministic object identities without generating a
replacement video. Protected expiring review grants store only token hashes, check current
revision/cancellation and validate retained size/hash. Scheduler-scoped credentials cannot
access these owner routes. All four new tables are private/RLS-enabled.

No real callback registration, provider secret, media download, storage bucket or paid call.
Production completion is hard-disabled and its database configuration defaults false.
Fixture bytes are labeled mock, in-memory and not playable video. Real durable storage,
provider/account-backed authenticity and output remain unverified. Standalone Step 18 completion
can precede retention; Step 20 subsequently added a shared pipeline gate before worker review.
Review links always require retained media. See [COMPLETION.md](docs/COMPLETION.md).

Initial focused checks: 15 passed. Full serialized regression: 131 passed, zero failures/skips
(373.9 seconds). Final Step 19 checks after recovery/constraint refinements: 19 passed,
zero failures/skips (87.0 seconds), including two additional tests beyond the full run.
All provider/retention behavior used controlled mocks; PostgreSQL state was real and isolated.
Updated `npm run demo:mock` passed with one mock render submission, accepted mock callback,
retained 71-byte non-playable fixture and verified expiring grant; zero real calls/publication,
production settings unchanged and disposable schema removed. Applied additive migration
`20261108200903_webhook_media.sql` through the Supabase connector; local CLI-generated file
aligned to the hosted ledger. No bucket, webhook registration or provider key was created.
Post-migration verification: original 4 jobs, all six configuration switches false, zero
content/render calls, events, media and review grants; all four new tables deny client reads.
No leftover test/demo schemas. Advisors report INFO only: expected private RLS/no-policy,
three older unindexed foreign keys and unused indexes on inactive paths. No new warning/error.
Authenticated local wiring against the live disabled database: video history 200 empty;
review issuance and reconciliation 503 disabled. Public callback/review routes also 503.
No owner key was read from Render or exposed. The unrelated local `test.js` edit is preserved.
Implementation pushed as `21665a3`; manual deployment `dep-dbodep15efls73di9ll0` succeeded
on the existing Render Free service on 2026-11-08 at 22:11 Asia/Jerusalem. Live health and
database readiness returned 200; anonymous video-history/reconciliation requests returned
401; webhook and bearer-review requests returned 503 disabled. Production owner-authenticated
routes were verified locally against the live database, not with Render's rotated owner key.
No automatic scheduler/processing, paid resource, real provider/storage call or publishing
was enabled. Deployment proof saved as `step19-render-live.png` in the session visualization
directory. The Step 19 follow-up commit updated documentation only; subsequent Step 20 work
is recorded above.

## Step 18 implementation and evidence

Added mock-only HeyGen v3 request mapping/transport adapter, durable per-revision render
requests and per-operation history, serialized submission allowance, stable idempotency
keys, saved external mock IDs and resumable bounded polling. Unknown submission outcomes
require reconciliation. Late polling results are fenced; cached completion supports rollback
recovery. Raw provider errors, signed output URLs and credentials are not retained.
Mock IDs are not written to jobs.heygen_video_id. Production rendering is hard-disabled;
no environment key can activate it. Owner-only rendering-history route added; no webhook,
real account call, file upload, paid credits or real video. See [RENDERING.md](docs/RENDERING.md).
Current composition supports one talking-avatar scene with built-in voice; extra media,
external audio and multi-scene plans fail explicitly. Live avatar/voice/engine support,
API scopes, credits, costs, output quality and provider replay behavior remain unverified.
Initial rendering checks: 18 passed with real isolated PostgreSQL and controlled responses.
Final sequential suite: `RUN_DB_TESTS=1; npm test` — 114 passed, zero failures/skips.
Includes 16 real PostgreSQL rendering subtests plus HTTP/adapter tests and prior regressions:
overlap, stable keys, Retry-After, quota failures, lost acceptance/commit acknowledgements,
restart recovery, stale polls, checkpoint rollback and bounded polling/submissions.
All provider responses are controlled fixtures. No real HeyGen endpoint/account, provider
replay behavior, video quality, media accessibility or cost has been verified.
Updated demo passed: one mock submission, persisted `mock_demo_video`, later polling to
simulated review, zero real provider calls/videos/publications, disposable schema removed.
Migration applied through Supabase connector, hosted/local version `20261108193747`.
Live schema postcheck: 4 jobs, zero render requests/calls, scheduling/processing/content/
assets/rendering all false, mode=mock, max_submissions=0, submissions_used=0.
All three render tables have RLS and deny anon/authenticated SELECT. Disposable Step 18/demo
schemas remaining: 0. Advisor results: INFO only for intentionally private policy-free tables,
inactive indexes and previously recorded FK notices; no warning/error findings.
Syntax, whitespace and aligned migration-path checks passed.
Authenticated local rendering-history smoke test against the live disabled database returned
200 with no requests/calls. No rotated Render credential was retrieved. Source committed/
pushed as `b0aa3ff`, deployed on the existing Render Free service as
`dep-dbod04bm8hqs7387k500`, **Deploy succeeded | Live**, 2026-11-08 21:40 Asia/Jerusalem.
Live HTTPS health/readiness returned 200; unauthenticated rendering-history GET returned 401.
The live owner-authenticated rendering route was not separately called with the rotated
Render credential; local authenticated wiring against the live disabled database passed.
Post-deploy DB state: 4 jobs, zero render requests/calls, all automation false and zero
submission allowance/use. No paid provider, storage upload, video, publication or advertising
was enabled. Step 19 webhook/media-storage work was subsequently added in mock mode; see above.

## Step 17 implementation and evidence

Added private revision-bound media metadata/manifests, avatar/voice configuration, closed
file/reference policy, storage metadata verification contract, temporary signed-link resolution,
optional mock TTS and bounded metadata expiry. Default built-in voice needs no separate TTS.
Manifest/checkpoint/advancement commit atomically with the processing lease. Production
preparation stays hard-disabled and has no real storage or TTS adapters. Owner-only metadata
routes added; scheduler key denied. No upload endpoint/bucket or real file deletion introduced.
At the Step 17 checkpoint, the demo used its manifest handler while rendering remained a
stub. Step 18's later journal/adapter implementation is recorded above.
See [ASSETS.md](docs/ASSETS.md) for policies, limitations, current HeyGen references and tests.
Initial asset tests: 13 passed using isolated PostgreSQL and controlled adapters.
Final full regression: `RUN_DB_TESTS=1; npm test` — 91 passed, zero failures/skips.
An initial overlapping suite/demo run exceeded the existing 15-connection session allowance,
causing connection errors and knock-on reliability failures. Test files now run sequentially
while concurrency checks inside each test remain intact. The complete rerun passed with
no database upgrade; the demo is run afterward. No application pool limit was changed.
Updated demo passed after the sequential suite: real Step 17 manifest preparation, simulated
render submission/polling and simulated review. Zero real provider calls/videos/publications;
disposable schema removed. Syntax/whitespace and renamed migration path checks passed.
Migration applied through Supabase connector, hosted/local version `20261108191748`.
Live postcheck: 4 jobs, zero asset records/manifests, scheduling/processing/content/assets all
false, avatar/voice unset, voice_mode=builtin. Advisors show INFO only for intentionally
private policy-free tables, inactive indexes and previously documented FK indexing notices;
no warning/error findings. No real storage or voice resource/credit was purchased.
Live catalog check confirmed all three asset tables have RLS and deny anon/authenticated
SELECT. Leftover Step 17/demo schemas: 0. Authenticated local HTTP smoke test against the
live disabled database: assets GET 200 empty, registration POST 409 unconfigured.
Source `d53aa9a` committed/pushed and deployed to Render Free as
`dep-dbocmktg1s2s73eqpivg`, **Deploy succeeded | Live**, 2026-11-08 21:19 Asia/Jerusalem.
Live HTTPS: health/readiness 200, unauthenticated asset GET/POST 401. Live owner-authenticated
asset routes were not exercised using the rotated Render credential; local authenticated
wiring with the live disabled database was verified above. Final DB check: 4 jobs, zero
content calls/assets/manifests, all scheduling/processing/content/asset flags false.
No plan upgrade, paid provider request, upload, publication or advertising enabled.

## Step 16 implementation and evidence

Mock-only continuation: real LLM acceptance is explicitly deferred, not waived. Added
`npm run demo:mock`: isolated end-to-end simulation through content, demo assets, demo render
submission/polling and a simulated review state. It uses controlled functions and removes
its disposable schema. The original asset/render stubs did not complete Steps 17/18 or create a video.
Step 17 subsequently replaces the demo asset stub with the real manifest service; the render
handler at that checkpoint remained a stub. Step 18 later replaces it with the journal/
mock transport adapter; it still creates no real video.
Executed successfully on 2026-11-08: advanced to assets, advanced to render, saved pending
render checkpoint, resumed to simulated review; one controlled LLM call, zero real provider
calls, no video or publication. Disposable schema removed. Syntax/whitespace checks passed.

Added provider-neutral generation service, optional OpenAI Responses adapter, closed Hebrew
content schema, versioned database prompts/packages, durable request/call journal, usage and
optional cost estimates. Added owner-only retrieval/idempotent regeneration routes and wired
the content handler into the existing processing engine. New job fields are updated only
inside the fenced checkpoint transaction. Unknown provider outcomes force reconciliation.
Known rate-limit rejections have bounded retries; request allowance is serialized in PostgreSQL.

Provider selection remains undecided. No model/pricing defaults, live test budget or provider
credentials were chosen. Runtime and database activation remain disabled. Test fixtures are
not live integration verification or evidence of Hebrew marketing quality. Step 16 remains
unchecked until an authorized chosen-provider test verifies the remaining acceptance criteria.
Details, limitations and PowerShell tests: [CONTENT.md](docs/CONTENT.md).
Final expanded suite: `RUN_DB_TESTS=1; npm test` — 76 passing test records, zero failures/skips.
This includes 13 real PostgreSQL content subtests plus HTTP/schema/provider tests and all
existing scheduler/processing regressions. No paid/live provider calls were made.
Migration applied through the Supabase connector, hosted version `20261108184837`;
CLI-generated local file aligned to that version. Earlier schema migrations remain untracked.
Live postcheck: 4 jobs, 0 content calls/versions, scheduling/processing/content all false,
provider/model NULL, max_requests=0, requests_used=0.
Live catalog verification: six content tables, all RLS enabled, all anon/authenticated
SELECT privileges denied. Disposable Step 16 schemas remaining: 0.
Authenticated local smoke test with the live database: content retrieval 200 (empty),
processing POST 200 disabled. No production owner credential was read from Render.
Advisors reported INFO only: intentionally private RLS tables without client policies,
unused indexes on inactive queues, and unindexed prompt FKs / existing event FK. No warning
or error findings; small config/prompt tables and retained prompt versions need no added
indexes for this step. These notices are not a comprehensive security assurance.

Source `697380e` committed/pushed and deployed to the existing Render Free service:
`dep-dboc9ebm8hqs7385k24g`, **Deploy succeeded | Live**, 2026-11-08 20:51 Asia/Jerusalem.
Build `npm ci` reported zero vulnerabilities. HTTPS checks after rollout: health/readiness
200; unauthenticated content GET and regeneration POST both 401. No live owner-authenticated
content call was performed using the rotated Render key; authenticated wiring was tested
locally against the live disabled database. Post-deploy database state is unchanged:
4 jobs, zero content calls/versions, all automation disabled, no provider/model/request allowance.
No paid resource, live LLM test, publication or advertising was enabled. At that checkpoint,
Step 17 had not started; its later mock implementation is recorded above.

## Step 15 implementation and evidence

Added a durable processing engine, owner-only manual processing/history/retry/cancel routes,
and CLI-generated migration `supabase/migrations/20261106073647_durable_processing.sql`.
New-job enqueue is transactional; existing jobs are not enrolled. Processing starts disabled.
Stages stop at human review. No LLM, HeyGen or publishing adapter is registered yet.
See [PROCESSING.md](docs/PROCESSING.md) for transitions, adapter contracts and PowerShell tests.

PostgreSQL tests verify concurrent claims, retry backoff/exhaustion, permanent failure,
lease expiry/restart recovery, stale completion fencing, cancellation, checkpoint rollback,
pending-operation resume, timeout quarantine, private grants/RLS and lost commit acknowledgements.
These use disposable schemas and controlled handlers; they do not verify real external APIs.
Final regression run: `RUN_DB_TESTS=1; npm test` — 57 passing test records,
zero failures/skips, including the lost-acknowledgement test. Syntax and whitespace checks passed.

Live additive migration applied 2026-11-06 using Supabase CLI 3.0.0 `db query`.
CLI initially rejected multi-statement input without applying changes; successfully submitted
as one atomic DO block afterward. Before/after: 4 jobs; scheduling=false; processing=false;
0 queued existing jobs. No generation, paid provider request, publishing or recurring trigger
was enabled. CLI `db advisors --remote=<private connection> --type all` returned no issues;
this is the CLI's custom-Postgres advisor result, not a claim of a comprehensive security audit.
New table RLS/grants are also directly exercised by the integration suite.

Committed/pushed as `8c708a7`, deployed to the existing Render Free service:
`dep-dbmodfff3r2c73b7nep0`, **Deploy succeeded | Live**, 2026-11-06 09:50 Asia/Jerusalem.
Build `npm ci` reported zero vulnerabilities; no upgrade or paid resource added.
Live checks: `/health` 200, `/ready` 200, unauthenticated processing POST 401.
Authenticated processing POST tested through local HTTP against the live database: 200 disabled.
The production owner-authenticated processing route was not separately exercised with the
rotated Render owner credential; no secret was retrieved from the dashboard to do that.
User selected **Keep the provider undecided** for Step 16. No provider/account/model is
selected and no live LLM test budget is authorized. Provider-neutral preparation may proceed;
real integration verification must wait for that choice, server credentials and budget.

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
real Supabase outage or network kill. Production restart and controlled post-idle recovery were
subsequently verified as recorded below; no actual external database outage was induced.
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
This verifies restart recovery. A later 16-minute quiescence test verified post-idle requests
as recorded below; Render's internal spin-down flag was not independently read.

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

- Steps 13–14 functional checks passed for the chosen Free setup. Production-grade uptime,
  guarantees of scheduled punctuality and simulated upstream outages are not claimed.
  GitHub Actions stores only the scheduler-scoped credential saved privately by the owner.
  No standing recurring workflow or business scheduling was enabled. Next milestone: Step 15.
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
  **Final live results (2026-11-06):**
  - Idle test run `42177635809`, source `e613fed`, job `127759672206`: **Success**,
    job duration 16m19s. Wait step exactly 16m00s; authenticated request returned
    `status=disabled`, HTTP 200, attempts=1, elapsedMs=13866. This is measured post-idle recovery;
    the provider's actual internal power/spin-down state was not independently inspected.
  - Scope/repeat run `42179382445`, source `8f4e01e`, job `127765285608`: **Success**,
    job duration 4s. Actual stored scheduler credential rejected POST `/jobs` empty JSON:
    HTTP 401, attempts=1, elapsedMs=354. Following scheduler POST returned disabled,
    HTTP 200, attempts=1, elapsedMs=727. No values or response contents were logged.
  - Workflow concurrency queued the scope/repeat test behind the idle test; it did not disturb
    the idle wait. No automatic event was added; future recurring template is outside workflows.
  - Final direct database comparison: 4 jobs / 3 scheduled jobs, scheduling_enabled=false,
    identical to baseline. No jobs created, schema changed, or live data deleted by these tests.
  - Final `npm test`: 21 local test records passed, 0 failed, 1 opt-in DB suite skipped.
    Earlier real PostgreSQL integration results remain separately recorded under Step 12.
  - No paid service/resource, account upgrade, paid API call or publishing enabled.
  Live evidence:
  https://github.com/Daniel-opx/avatar-backend/actions/runs/42177635809
  https://github.com/Daniel-opx/avatar-backend/actions/runs/42179382445
- Verified TLS works with the supplied CA; track its 2031 expiry and review provider CA changes.
- Render Free can sleep/restart; future processing must use durable checkpoints, not detached tasks.
- Rate limiting is per process and resets after restart; Render uses a conservative shared cap.
  Heavy unauthenticated traffic can consume the shared budget; this is not a distributed WAF.
- Current shared key is temporary; team identities are Step 21.
- Latest deployed source `7021c2c`; unrelated preexisting `test.js` edit preserved unstaged.
- Step 16 has a hosted migration ledger entry; earlier DDL is untracked. Reconcile the baseline before using a general migration runner.
- See `docs/DEPLOYMENT.md` for test commands, rotation sequence and migration recovery.
