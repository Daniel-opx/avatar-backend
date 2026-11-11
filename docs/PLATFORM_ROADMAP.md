# AI Avatar platform — outcome-based roadmap

Adopted: 2026-11-11, Asia/Jerusalem, at the owner's request.
This replaces the execution order in [the legacy roadmap](DEVELOPMENT_ROADMAP.md).
It covers the complete platform, not only a proof of concept. Reuse the existing repository;
starting the plan at Step 0 does not mean rebuilding the application.

## Product baseline and authority

The product baseline is [ארכיטקטורה מלאה למערכת האווטר](https://files.instinct.com/uol1rj37gm3r),
updated 2026-11-01 and read in full during the 2026-11-11 review, together with the owner's
subsequent clarifications. The document's API/pricing statements are dated references, not
proof of current account access. Verify official API contracts and actual account capabilities
before implementing each live connection. Treat example payloads as illustrations.

The requested system produces Hebrew videos with Tomer's avatar/voice and background creative,
accepts Cron or chat/manual commands, obtains human approval, publishes organically through
GHL, and supports direct Meta campaigns and approved performance-based optimization.
Initial organic network: Instagram. Initial frequency remains an owner-selected setting;
the document's 2–3 videos/week is a suggestion, not an activated schedule.

The current request authorizes this planning update. It does not authorize live provider calls,
additional charges, account upgrades, advertising, publication or recurring activation.
Existing no-additional-spending and mock-only execution restrictions remain until the owner
explicitly changes them. Record the relevant account, operation and allowance before a paid test.
Do not infer API funding from a ChatGPT membership or HeyGen web-plan allowance.

## Responsibility boundaries

| Component | Responsibility |
| --- | --- |
| Our Node/Express backend + PostgreSQL | Coordinate jobs and saved progress; topic bank; approvals; credentials; request/spend limits; retries, reconciliation, audit and essential notifications |
| External Cron | Send authenticated bounded triggers; business generation frequency stays in PostgreSQL |
| LLM | Hebrew script, caption, hashtags, visual plan, asset search intent, and later evidence-backed recommendations |
| Owned library + one stock provider | Supply creative material; our integration selects/downloads assets and retains provenance and permitted-use records |
| HeyGen | Avatar/voice and video rendering using one initial branded Studio template |
| One controlled storage service | Retain approved source material, finished video and subtitle artifacts with appropriate access controls |
| One chat channel + minimal review page | Commands, notifications, playback, approve/reject/revise; channel remains replaceable |
| GHL Social Planner | Organic publishing calendar and publication; backend submits approved requests and records outcomes |
| Meta | Advertising delivery, measurement, attribution and reporting; backend reads needed Insights and executes explicitly approved campaign operations |

Do not build a competing Ads Manager, a second GHL calendar product, an independent marketing
measurement system, or a general video editor. Lightweight operational job/status views are
still required. Retain the evidence behind decisions without creating a broad reporting warehouse.

## Completion and execution rules

- Track **implemented**, **mock-tested**, **live-verified**, and **owner-accepted** separately.
  A mocked response or a non-playable fixture never satisfies a real-video acceptance gate.
- A phase is accepted only when its stated outcome is demonstrated and evidence is recorded.
  If credentials/budget are missing, label that phase blocked for live acceptance; do not
  replace that milestone with unrelated downstream mock expansion.
- Use short, resumable operations on the existing Free hosting design. Do not depend on a
  local computer or an untracked background loop continuing after an HTTP response.
- Preserve authorization, input validation, private media, version checks, duplicate protection,
  audit records and essential tests throughout. Do not rebuild working infrastructure.
- Save a durable operation reservation before billable or externally visible writes. Use provider
  idempotency only where documented. Unknown outcomes require reconciliation, not blind retry.
- Routine safe implementation/testing remains autonomous when authorized. Never expose keys,
  overwrite .env, remove unrelated edits, or activate external actions under a planning request.

## Step 0 — Resolve prerequisites and record the production choices

Confirm actual LLM and HeyGen API access/credits, Tomer's avatar/voice rights and consent,
one storage service, one stock source (Pexels or Pixabay), the first GHL/Instagram account,
and one chat channel (WhatsApp Cloud API or in-app chat). Record open choices rather than
silently choosing paid services. Inventory existing reusable code and its mock-only gates.
Verify Meta onboarding requirements early; prepare any app-review/business prerequisites
in parallel where authorized so external approval lead times do not block later phases.

**Acceptance:** account/permission prerequisites, chosen options, unresolved decisions and
explicit test limits are documented without secrets. No purchases or access grants are implied.

## Step 1 — Verify Tomer's avatar and Hebrew voice

Set up or verify the actual avatar and required consent. Run a short fixed-script Hebrew
pilot (the source suggests 30–60 seconds), only within a separately approved allowance.
Check resemblance, pronunciation and lip sync. Start with built-in HeyGen voice;
add ElevenLabs only if the accepted quality requires it.

**Acceptance:** a real pilot is playable and Tomer accepts avatar/voice quality. This proves
account/media feasibility; it is not yet evidence of the automated production pipeline.

## Step 2 — Reuse and verify the minimal cloud foundation

Keep Node/Express, Supabase PostgreSQL, Render Free and the selected external GitHub Actions
trigger arrangement. Reuse jobs, schedule slots, transactions, authentication, processing leases,
checkpoints, bounded retries, request history and redacted logs. Recheck deployment/configuration
compatibility when adding live adapters. Explain any demonstrated Free-hosting limitation
before proposing a paid alternative; do not silently weaken the workflow.

**Acceptance:** an authenticated job persists and can resume after restart; overlapping
requests cannot claim the same operation twice. Existing verified foundations are reused.

## Step 3 — Generate real Hebrew content from a topic bank

Add a small topic bank, brand facts/tone and topic-selection history. Use one chosen LLM
provider to generate validated script, caption, hashtags and timed visual/search instructions.
Persist the topic, prompt/model, package revision and available usage/cost evidence.
Reject malformed output and unsupported factual marketing claims. Preserve old versions.

**Acceptance:** one authorized real request creates a useful, stored Hebrew content package
from a selected topic. Token/usage data is traceable; estimates are not reported as billed cost.

## Step 4 — Gather actual creative material

Implement one stock-source adapter, not both by default, alongside Tomer's owned brand assets.
Translate the visual plan into suitable search requests, select clips/images, download them,
validate bytes/type/size and store stable references. Record provider/source IDs, creator/source
links, applicable licensing/attribution information and intended permitted use for each asset.
Verify current API and commercial-use conditions before use. Missing, unsuitable or
uncertain-rights results stop for review or use an approved owned-asset fallback.

**Acceptance:** a real job contains usable media matching its visual plan, with provenance
and usage checks. An asset table or metadata-only fixture does not satisfy this step.

## Step 5 — Render one branded HeyGen Studio template

Create one reusable template with avatar, voice, background-media and text slots. Inspect its
actual API schema and map saved content/assets into supported inputs; do not assume a raw
avatar request implements the visual plan. Verify media accessibility/lifetime for rendering,
vertical format, scene timing and Hebrew caption behavior. Distinguish exported subtitle
files from visible rendered captions. Preserve request/video IDs before subsequent work.

**Acceptance:** a real submitted job renders Tomer's avatar with the selected background
creative and intended text/captions. The owner accepts the visual treatment. Transparent
WebM/FFmpeg or another compositor is a fallback only if a documented template limitation
prevents the required output; do not build both rendering paths in advance.

## Step 6 — Complete the manual end-to-end video workflow

Connect live generation, asset sourcing, template rendering, signed webhook validation,
known-ID polling/reconciliation and controlled media retention. Verify the actual provider's
authentication/event contract. Securely retrieve finished bytes and preserve needed subtitles;
do not rely solely on expiring provider links. Supply protected playable review access.

**Acceptance:** one manually initiated cloud job progresses through real content and media
to a stored, playable branded Hebrew video. Restart, delayed/duplicate callback and uncertain
submission handling do not trigger blind duplicate generation. Stop before publication.

## Step 7 — Commands and version-bound human review

Implement one selected chat channel for create/status commands and review notifications;
do not build WhatsApp and in-app chat simultaneously. Reuse the minimal dashboard/review
page for playback, text, errors and approve/reject/revise. Verify real sign-in for the intended
reviewer; keep existing role checks without expanding team-management features unnecessarily.
Bind review to immutable content/media and any proposed action, with explicit expiry.
Changing the proposal invalidates its approval. Revisions retain the previous version/history.

**Acceptance:** Tomer receives a real video for authenticated review, can approve/reject or
request a revision, and stale/expired approvals cannot authorize later actions. No publication
is permitted before the relevant current human approval.

## Step 8 — Run the working production pipeline from Cron

Extend the authenticated external trigger to advance due processing/completion work as well
as create jobs. Use a narrowly scoped service credential, not the owner's general API key.
Cron wake-up cadence and business video-production frequency are separate: repeated ticks
must resume existing renders without generating a fresh video each time. Keep scheduling
configuration and Jerusalem/DST behavior in PostgreSQL. Test one controlled run before
activating any standing schedule.

**Acceptance:** one Cron-created job reaches a real playable review video without manual
processing commands or dependence on the local computer. Overlapping/missed ticks and
Free-service restarts recover safely. No unattended recurrence is enabled without authorization.

## Step 9 — Publish approved Instagram content through GHL

Verify actual GHL API access, connected Instagram account and required IDs/permissions.
Map the approved video/caption to the supported organic operation, submit its publication
time to Social Planner, save the returned post ID and reconcile scheduled/published/failed
status. Check media accessibility through the required publication window. GHL owns the
calendar; our backend tracks the approved intent and external result, not a duplicate calendar UI.

**Acceptance:** one explicitly authorized, current approved video is scheduled and published
to Instagram through GHL, with traceable outcome and no duplicate submission. Broader organic
automation is enabled separately and gradually, retaining the approval gate.

## Step 10 — Read Meta results and propose evidence-backed improvements

Verify read permissions for the actual ad account. Fetch the selected Insights needed for
owner-defined KPIs on an agreed hourly/daily cadence; handle pagination, reporting delays,
attribution windows and minimum sample requirements. Existing account campaigns can supply
data where authorized; otherwise this acceptance remains pending, without fabricated metrics.
Give the LLM relevant results and preserve the evidence snapshot behind each recommendation.
Send the proposed action, rationale and exact settings for human approval.

**Acceptance:** a recommendation is grounded in actual Meta results and adequate data; the
owner can inspect its evidence and approve/reject it. No action is executed by analysis alone.
Do not create a separate analytics dashboard, attribution engine or broad time-series warehouse.

## Step 11 — Execute explicitly approved Meta campaigns and replacements

After actual write access is verified, upload approved video creative and prepare supported
campaign/ad-set/creative/ad structures paused. Bind approval to the exact content, account,
targeting, budget and time window. Enforce owner-approved daily aggregate and campaign
limits, including exposure from concurrent campaigns and replacement overlap. Record all
provider IDs and decisions; uncertain creates reconcile rather than resubmit.

For replacement, create a version alongside the old ad, preserve its statistics, and activate
only with explicit authorization. Verify the new ad receives delivery before pausing the old
one under the approved conditions. Account for reporting delays; do not assume immediate delivery.

**Acceptance:** an expressly authorized real campaign operation and, subsequently, a controlled
replacement succeed with a complete audit trail. Budget changes and activation require their
own current approvals. No approval in this roadmap grants advertising spend.

## Step 12 — Verify complete operation and launch gradually

Run an authorized end-to-end demonstration spanning generation, review, GHL publication,
Meta reporting/recommendation and separately approved campaign actions. Verify secret/media
access, stop controls, concurrency, daily/campaign limits, restarts, provider failures and
recovery. Reuse current logs/audits; add essential stuck-job/failure notifications through
the selected channel, not a separate monitoring platform. Verify backup/recovery and retain
a concise setup, cost, permissions, pause and incident/recovery guide.

**Acceptance:** the complete requested workflow is demonstrated, exceptions and Free-tier
limits are explicit, the owner can pause each external action, and launch is approved in stages.
Safety/recovery work and tests happen throughout, not only at this final step.

## Scope decisions and mapping from the legacy plan

| Legacy area | New treatment |
| --- | --- |
| Steps 1–15 foundation | Reuse under Step 2 and Step 8; do not rebuild |
| Step 16 content | Step 3, explicitly adding topic-bank selection and real acceptance |
| Step 17 assets/voice | Steps 1 and 4; source/download real creative, optional separate TTS only if needed |
| Steps 18–20 generation | Steps 5–6 and 8; actual template composition, real playable video and automatic processing are mandatory |
| Steps 21–23 access/review/dashboard | Step 7; reuse essential controls, no further general management UI expansion |
| Step 24 organic publishing | Step 9, Instagram first; current Facebook mock is not acceptance |
| Steps 25–27 Meta/analytics/recommendations | Steps 10–11, read/recommend before paid action; keep platform reporting in Meta |
| Steps 28–30 monitoring/testing/launch | Cross-cutting safeguards plus Step 12; essential alerts and one practical runbook |

Keep current disabled downstream code and tables unless a demonstrated integration need calls
for a scoped change. Do not delete tested infrastructure merely to shorten the plan. Mocks
remain useful test fixtures; they must not become a parallel product or live acceptance claim.
English, broad A/B tooling, more networks/providers, advanced multi-account management,
extra dashboards and generic composition engines are deferred. Before adding another tenant,
implement and verify account/data isolation; never mix identities or assets between accounts.

## Current position and next action

See [PROJECT_STATUS.md](../PROJECT_STATUS.md) for code, mock, live and owner-acceptance evidence.
The active position is **Step 0: prerequisites and production choices**, followed by the actual
avatar/voice pilot and completion of Steps 3–6 using the existing foundation. Real LLM/HeyGen
access, usable credits and an explicitly approved test allowance remain unresolved.
Asset search/download and Studio-template integration are missing; live rendering/storage
require implementation beyond inserting credentials into the existing mock-only services.
Do not resume legacy Step 26 analytics or expand paused Meta mocks as the next task.
