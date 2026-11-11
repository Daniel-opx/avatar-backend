# Legacy roadmap — superseded 2026-11-11

Historical reference only. The owner adopted [PLATFORM_ROADMAP.md](PLATFORM_ROADMAP.md)
as the active outcome-based Step 0–12 plan after reviewing the original architecture.
Step numbers and execution instructions below describe the previous plan; do not resume
them as current instructions. Existing safety, spending and approval restrictions remain.

# MASTER DEVELOPMENT INSTRUCTIONS — AI Avatar Automation System

Execution update from owner, 2026-11-08: continue in **mock-only mode**, with no additional
provider spending. Real LLM API account/model/credentials/budget and funded HeyGen API video
access remain prerequisites for live acceptance. Keep those tests pending and label mocks
clearly; do not activate automation, upgrade plans or purchase credits. See
[mock development policy](MOCK_DEVELOPMENT.md) and [current checklist](../PROJECT_STATUS.md).
Scope update on 2026-11-09: owner resumed development in two-step batches, beginning with
Steps 21–22, followed by Steps 23–24 (dashboard and mock GHL publishing). This supersedes
the Step 20 feature pause. The no-additional-spending policy
and separate approval gates for real accounts, publishing, advertising and activation remain.

## Your role

You are the lead software engineer responsible for completing an existing AI Avatar marketing automation platform.

You have access to the project's source code through Codex Desktop.

**Your objective is to take the existing working backend from Step 11 through to a complete, secure, tested, and deployable application.**

Do not rebuild the existing project. Extend it incrementally.

You are authorized to inspect files, write code, create folders, install necessary dependencies, run local commands, execute tests, diagnose failures, and correct implementation issues.

Work through the development milestones below in order.

Do not ask me to manually execute commands you can safely execute yourself.

Do not claim that a milestone passed unless you actually verified it.

---

# PART I — PRODUCT REQUIREMENTS

## 1. Product vision

Build an automated system for producing, reviewing, publishing, and optimizing AI Avatar marketing videos.

The intended workflow is:

1. A scheduler determines when new content should be generated.
2. A job is created in PostgreSQL.
3. An LLM generates Hebrew marketing content, including a video script, caption, hashtags, and visual plan.
4. The system prepares any required assets and optionally generates voice audio.
5. HeyGen generates a video featuring an AI avatar.
6. HeyGen notifies our backend when rendering finishes.
7. The resulting video is submitted to a human manager for approval.
8. The manager approves, rejects, or requests changes.
9. Approved content is scheduled or published through GHL or Meta.
10. The system collects performance metrics.
11. AI analyzes performance and proposes improvements.
12. Significant publishing and paid-marketing decisions require explicit human approval.

The system must preserve a complete history of jobs, approvals, publishing operations, and important actions.

## 2. Authoritative requirements

The project has an original Hebrew architecture/planning document titled "ארכיטקטורה מלאה למערכת האווטר".

Find and inspect that document if available in the project.

Use it as the product requirements baseline, alongside these instructions.

If you discover a material conflict, document the conflict and ask for a decision before implementing that particular behavior.

Do not invent business requirements that are absent from both sources.

## 3. Existing technology decisions

- Backend: Node.js and Express.
- Language: JavaScript using CommonJS unless an incremental migration is clearly justified.
- Database: Supabase PostgreSQL.
- Hosting: Render Free Web Service.
- Scheduler: External free Cron service.
- Scheduler invocation: Authenticated HTTP POST.
- LLM: OpenAI or Anthropic, with a provider abstraction.
- Video generation: HeyGen API.
- Optional text-to-speech: ElevenLabs.
- Organic publishing: GoHighLevel Social Planner.
- Paid marketing: Meta Marketing API.
- Approval: Human-in-the-loop.
- Timezone: Asia/Jerusalem.
- Initial users: The owner and a small internal team.
- Development environment: Windows, Codex Desktop, Git/GitHub.

Avoid unnecessary paid infrastructure and avoid overengineering for an initially small internal system.

However, do not sacrifice fundamental data integrity, security, recoverability, or operational safety solely to stay on a free tier.

If the chosen free infrastructure cannot reliably support a requirement, explain the limitation and propose practical alternatives rather than silently weakening the requirement.

## 4. Current project location

`C:\Users\דניאל\Desktop\ghl backend`

Inspect the existing directory and Git repository.

Expected files include:

- `server.js`
- `db/pool.js`
- `middleware/apiKeyAuth.js`
- `routes/jobs.js`
- `routes/internal.js`
- `scheduler.test.js`
- `test-step11-live.js`
- `migrations/011_recurring_schedules.sql`

Do not assume this list is exhaustive.

## 5. Confirmed completed work

Steps 1–11 have been completed.

The application already has:

- A working Express server.
- A working Supabase PostgreSQL connection.
- `GET /health`.
- `POST /jobs`.
- `GET /jobs`.
- `POST /internal/run-scheduler`.
- API-key authentication.
- A `jobs` table.
- A `schedule_config` table.
- Configurable one-time, daily, and weekly schedules.
- `interval_count` between 1 and 365.
- `local_run_time`.
- Jerusalem timezone handling, including DST.
- One overdue scheduling slot processed per invocation.
- Gradual recovery of missed executions.
- PostgreSQL transaction-based job creation.
- `SELECT ... FOR UPDATE` concurrency control.
- Uniqueness protection on `jobs.scheduler_slot_at`.
- Scheduling disabled by default.

The Step 11 report confirmed:

- Six automated tests passed.
- Five PostgreSQL DST checks passed.
- Eight overlapping requests created exactly one job.
- The seven remaining requests returned `not_due`.
- Retries created no duplicate jobs.
- One-time and recurring behavior worked.
- Original disabled configuration was restored.
- Two labelled integration-test jobs remain in the database.

Treat these as the reported baseline, but verify actual code and test behavior before proceeding.

---

# PART II — GENERAL EXECUTION RULES

## Rule 1 — Incremental development

Work through Steps 12–30 sequentially.

For every step:

1. Inspect the relevant existing code.
2. Identify the smallest appropriate implementation.
3. Make the required changes.
4. Write or update tests.
5. Run those tests.
6. Fix failures.
7. Review the resulting diff.
8. Document what was completed.
9. Proceed to the next step when its acceptance criteria are satisfied.

Avoid making unrelated changes.

A step may introduce multiple files when they form one coherent feature.

## Rule 2 — Autonomous local development

You are authorized to:

- Create and edit source files.
- Create SQL migrations.
- Install necessary dependencies.
- Execute local Node.js commands.
- Run test suites and linters.
- Use disposable test databases or isolated schemas.
- Diagnose and fix local errors.
- Update development documentation.

Do these yourself instead of repeatedly asking me to execute commands.

## Rule 3 — Approval boundaries

Ask for explicit approval before:

- Purchasing services or enabling paid plans.
- Spending money through production APIs beyond an approved test budget.
- Launching paid advertisements.
- Publishing content to real public channels.
- Deleting or destructively modifying real user or business data.
- Making irreversible production changes.
- Rotating or revoking live credentials without a coordinated rollout.
- Changing core business requirements.
- Enabling unattended production automation.
- Using or revealing sensitive customer data in external services.

You may prepare and test those integrations using mocks or approved sandbox/test environments.

Do not confuse permission to develop autonomously with permission to publish publicly or spend money.

## Rule 4 — Never expose secrets

Keep API keys, database credentials, session tokens, webhook secrets, and OAuth secrets out of:

- Git commits.
- Frontend bundles.
- Logs.
- Test fixtures.
- Documentation examples using real values.
- Responses containing credential contents.

Use environment variables and secure server-side storage.

Do not overwrite `.env`.

An API key was previously pasted into a conversation. Treat it as potentially compromised and plan a controlled rotation before public deployment.

## Rule 5 — Database migrations

All schema changes must use versioned, repeatable migration files.

Never rely exclusively on manual Supabase dashboard modifications.

Migrations should be safe against existing data, and rollback or recovery procedures should be documented.

Use database transactions when possible.

Never run destructive integration tests against real production data.

## Rule 6 — Maintain architectural coherence

Prefer:

- Small modules with clear responsibilities.
- Provider adapters for external APIs.
- Idempotent operations.
- Explicit state transitions.
- Durable database state.
- Parameterized SQL.
- Structured logging.
- Centralized error handling.
- Testable pure functions.

Do not turn the application into a collection of unrelated scripts.

Do not introduce unnecessary microservices or costly infrastructure.

## Rule 7 — Verify current external APIs

Before implementing external integrations, review current official documentation for:

- Render.
- Supabase.
- OpenAI or Anthropic.
- HeyGen.
- ElevenLabs.
- GoHighLevel.
- Meta Graph/Marketing APIs.
- The selected external Cron provider.

Verify authentication, endpoint availability, permissions, webhook signatures, pagination, rate limits, costs, and supported functionality.

Do not invent API routes or assume that outdated examples still work.

Record relevant API versions and documentation references.

## Rule 8 — Preserve and report progress

Maintain a `PROJECT_STATUS.md` file that includes:

- Completed milestones.
- Current implementation state.
- Test results.
- Environment variables required.
- Remaining work.
- Known risks.
- Decisions requiring user input.

After each milestone, update the report.

If a phase requires unavailable credentials or external approval, implement and test everything possible with mocks, record the blocker, and continue with independent tasks where safe.

Do not mark real external integration as complete based solely on mock tests.

---

# PART III — IMPLEMENTATION MILESTONES

# STEP 12 — Scheduler reliability and recovery testing

## Goal

Verify the production safety of the recurring scheduler implemented in Step 11.

Do not simply repeat tests that already passed.

## Tasks

1. Inspect the scheduler implementation and its SQL transactions.
2. Review existing automated tests.
3. Add tests for failures at critical transaction stages.
4. Verify rollback when job insertion fails.
5. Verify rollback when updating `next_run_at` fails.
6. Verify recovery after database connection failures.
7. Verify behavior under repeated requests and concurrency.
8. Test timezone boundaries, including DST transitions.
9. Verify one-time schedule behavior remains intact.
10. Test the established gradual catch-up policy.
11. Confirm that scheduler errors return meaningful HTTP responses.
12. Ensure failed operations do not leave partially committed state.

Use deterministic clocks or injectable time dependencies where appropriate.

## Acceptance criteria

- One job maximum per scheduled slot.
- Concurrent requests cannot create duplicates.
- Failed transactions roll back completely.
- Retries are safe.
- Recurring schedules advance correctly.
- Tests are automated and reproducible.
- Existing behavior remains intact.

**Deliverable:** Reliable, tested scheduling subsystem.

---

# STEP 13 — Production hardening and Render deployment

## Goal

Prepare the existing Express backend for secure public hosting.

## Tasks

1. Inspect current Render configuration.
2. Audit dependencies and supported Node.js versions.
3. Add a clear deployment configuration.
4. Validate mandatory environment variables on startup.
5. Configure appropriate TLS certificate verification for PostgreSQL.
6. Rotate the previously exposed API key through a coordinated process.
7. Confirm secrets remain outside Git.
8. Add appropriate security middleware and request-size limits.
9. Add request validation and consistent error handling.
10. Apply appropriate rate limits, especially to authenticated and webhook endpoints.
11. Separate liveness and database-readiness checks.
12. Configure trusted proxy behavior correctly for Render.
13. Support graceful shutdown and database pool cleanup.
14. Establish structured application logging.
15. Verify that production routes requiring authentication are protected.
16. Deploy the backend to Render after confirming the target service and obtaining approval for production changes.
17. Test the deployed endpoints over HTTPS.

Avoid introducing a public API explorer or administrative interface without authentication.

## Acceptance criteria

- The deployed service starts successfully.
- Environment configuration is correct.
- HTTPS endpoints work.
- Unauthorized requests are rejected.
- Authenticated requests work.
- Database communication works securely.
- Logs contain no secrets.
- The service survives restarts without data loss.

**Deliverable:** Secure backend deployed to Render.

---

# STEP 14 — External free Cron integration

## Goal

Automate invocation of the scheduler without using Render's paid Cron Jobs.

## Tasks

1. Research a reliable external free Cron provider.
2. Confirm it supports scheduled HTTPS POST requests and authentication headers.
3. Verify free-tier restrictions and timeout behavior.
4. Choose a suitable polling frequency.
5. Configure the request:

   `POST /internal/run-scheduler`

6. Supply the API key securely.
7. Implement appropriate timeout and retry behavior.
8. Ensure the external Cron service does not decide business scheduling rules.
9. Verify duplicate protection under repeated invocations.
10. Test execution after a Render cold start.
11. Verify the missed-run catch-up behavior.
12. Document Cron configuration and recovery procedures.

The external Cron should only trigger the backend.

PostgreSQL remains the source of truth for whether a job is due.

## Acceptance criteria

- External Cron can reach the authenticated endpoint.
- No unauthorized requests are accepted.
- Scheduled jobs are created only when due.
- Repeated triggers do not duplicate jobs.
- Cold starts are handled as reliably as the chosen infrastructure permits.
- The schedule can be disabled without changing Cron configuration.

Keep real recurring execution disabled until authorized.

**Deliverable:** Configured and verified external scheduling mechanism.

---

# STEP 15 — Durable job processing and lifecycle management

## Goal

Build a reliable mechanism that moves jobs through the production pipeline.

Creating a row in `jobs` must not automatically mean that the video has been generated.

## Tasks

1. Inspect the current job schema and status values.
2. Define valid lifecycle transitions.
3. Introduce a job-processing service.
4. Separate job creation from execution.
5. Persist processing attempts and error history.
6. Implement safe job claiming and leases where appropriate.
7. Prevent concurrent workers from processing the same job.
8. Implement controlled retries and exponential backoff.
9. Distinguish permanent failures from temporary failures.
10. Recover jobs interrupted by process restarts.
11. Provide manual retry and cancellation operations.
12. Make workflow steps idempotent.
13. Define clear timeout and recovery behavior for long-running external operations.
14. Add tests for transitions, failures, and restarts.

Evaluate whether Render Free can reliably host the required processing model.

Do not depend on an in-memory background task continuing after an HTTP response if the platform cannot guarantee its execution.

Prefer durable checkpoints and short resumable processing steps.

## Acceptance criteria

- Every job has a well-defined state.
- Restarts do not silently lose work.
- Duplicate processing is prevented.
- Failed operations can be retried safely.
- Job history is inspectable.
- Long-running operations do not require keeping one HTTP request open.

**Deliverable:** Durable job-processing engine.

---

# STEP 16 — LLM content-generation integration

## Goal

Generate Hebrew marketing content automatically for each video job.

## Tasks

1. Create an abstraction for LLM providers.
2. Support at least one configured provider, such as OpenAI or Anthropic.
3. Keep provider keys on the server.
4. Define structured generation outputs containing:
   - Hebrew video script.
   - Short caption.
   - Relevant hashtags.
   - Visual production plan.
   - Optional creative metadata.
5. Use schema validation for generated output.
6. Save generation results in PostgreSQL.
7. Handle malformed responses.
8. Handle rate limits and transient errors.
9. Implement bounded retries.
10. Track model, generation time, token usage, and estimated cost where supported.
11. Make prompts configurable and versioned.
12. Maintain proper Hebrew language and marketing tone.
13. Avoid unsupported factual advertising claims.
14. Add unit and integration tests with mocked provider responses.

Provide the ability to regenerate content without losing previous versions.

## Acceptance criteria

- A job can produce a valid structured Hebrew content package.
- Output is stored and retrievable.
- Errors are handled without corrupting the job.
- Costs and provider requests can be monitored.
- Generation is repeatable and testable.

**Deliverable:** Working AI script and creative-plan generation.

---

# STEP 17 — Creative assets and optional voice generation

## Goal

Prepare the materials required for video rendering.

## Tasks

1. Define an asset model.
2. Determine what HeyGen requires for the chosen avatar workflow.
3. Support media references and metadata.
4. Validate file types, sizes, and accessible URLs.
5. Add storage integration where required.
6. Implement optional ElevenLabs text-to-speech through a provider adapter.
7. Allow voice generation to remain disabled when HeyGen's built-in voice is sufficient.
8. Store asset metadata and processing status.
9. Handle expired asset URLs and failed uploads.
10. Add cleanup and retention policies.
11. Test the pipeline without requiring paid generation calls.

Do not assume that a separate TTS step is required for every HeyGen rendering workflow.

## Acceptance criteria

- Every rendering job can identify its required assets.
- Optional voice generation can be enabled or disabled.
- Asset errors are recoverable.
- Stored content is protected from unauthorized access.

**Deliverable:** Video-ready asset preparation subsystem.

---

# STEP 18 — HeyGen API integration

## Goal

Create AI Avatar videos using HeyGen.

## Tasks

1. Inspect current HeyGen API documentation.
2. Determine the appropriate video-generation API and account permissions.
3. Implement a HeyGen provider adapter.
4. Support configured avatar and voice selections.
5. Convert saved scripts and visual plans into valid HeyGen requests.
6. Submit rendering requests asynchronously.
7. Store HeyGen video IDs and relevant metadata.
8. Prevent duplicate paid generation requests.
9. Handle API errors, quotas, rate limits, and credits.
10. Track rendering attempts and costs where possible.
11. Support testing using mocked API responses.
12. Run a real low-cost rendering test only after credentials and spending authorization are available.

## Acceptance criteria

- A valid job can initiate rendering.
- The external video ID is persisted.
- Repeated processing does not accidentally submit duplicate renders.
- API failures are handled safely.
- The implementation reflects current HeyGen documentation.

**Deliverable:** Functional HeyGen rendering integration.

---

# STEP 19 — HeyGen webhooks and video storage

## Goal

Process asynchronous rendering results.

## Tasks

1. Implement the required HeyGen webhook endpoint.
2. Validate authenticity using the mechanism supported by the current HeyGen API.
3. Reject unauthenticated or malformed webhook events.
4. Store received event IDs or equivalent deduplication identifiers.
5. Process duplicate webhook deliveries idempotently.
6. Handle rendering success.
7. Handle rendering failure.
8. Support out-of-order or delayed events safely.
9. Persist completed video metadata.
10. Copy completed media to controlled storage when needed for reliable retention.
11. Generate accessible review links with appropriate access controls.
12. Implement reconciliation or status polling for missed callbacks if supported.
13. Test duplicate, delayed, invalid, and failure events.

Do not expose untrusted webhook payloads directly to internal state transitions.

## Acceptance criteria

- Completed renderings are recorded correctly.
- Duplicate callbacks have no harmful effects.
- Invalid callbacks are rejected.
- Failed renderings are recoverable.
- Media remains accessible for authorized review.

**Deliverable:** Reliable asynchronous video completion workflow.

---

# STEP 20 — Complete AI video-generation pipeline

## Goal

Connect scheduling, job processing, LLM generation, asset preparation, and HeyGen into a single functioning workflow.

## Tasks

1. Connect each production stage.
2. Define the required job status transitions.
3. Persist outputs between stages.
4. Track attempts and durations.
5. Handle stage-specific errors.
6. Support cancellation and retries.
7. Support resumable processing after restarts.
8. Add a manual trigger for testing.
9. Implement end-to-end integration tests.
10. Verify that successful jobs reach `ready_for_review`.

The video pipeline must stop before publication.

## Acceptance criteria

- One authorized job can proceed from creation to completed video.
- The generated script and video are stored or referenced.
- Each stage is traceable.
- Failures are recoverable.
- No content is published without approval.

**Deliverable:** End-to-end AI Avatar video generation.

---

# STEP 21 — Team authentication and authorization

## Goal

Replace or supplement the temporary shared-key approach with appropriate team access controls.

## Tasks

1. Evaluate Supabase Auth or another suitable authentication solution.
2. Implement team user identities.
3. Define minimal roles, such as administrator, reviewer, and operator.
4. Enforce permissions in backend endpoints.
5. Keep internal service authentication separate from human login.
6. Ensure API keys are never exposed in frontend JavaScript.
7. Implement secure sessions and logout.
8. Restrict access to videos, scripts, job history, and configuration.
9. Audit important user actions.
10. Test permission boundaries.

Do not introduce unnecessary enterprise identity infrastructure.

## Acceptance criteria

- Team members authenticate securely.
- Permissions are enforced server-side.
- Unauthenticated users cannot access sensitive endpoints.
- Internal Cron authentication remains separate.

**Deliverable:** Secure team-access system.

---

# STEP 22 — Human video approval workflow

## Goal

Allow the manager or designated reviewer to approve or reject generated videos before publication.

## Tasks

1. Model approval requests in the database.
2. Support approval, rejection, and revision requests.
3. Preserve who reviewed a video and when.
4. Preserve reviewer comments.
5. Support replacing a rejected video with a new version.
6. Prevent stale approvals from authorizing modified content.
7. Send notifications to the designated manager.
8. Implement an approval channel using the supported integration selected by the team.
9. Consider WhatsApp or an in-app dashboard, as described in the original architecture.
10. Ensure approval actions are authenticated.
11. Prevent duplicate approval events.
12. Make approval a mandatory gate before publishing.

If WhatsApp is selected, verify provider availability, templates, permissions, and costs first.

## Acceptance criteria

- Reviewers can inspect the actual video and associated text.
- Approve, reject, and request-revision actions work.
- Decisions are auditable.
- Rejected content cannot publish.
- Modified content requires fresh approval.

**Deliverable:** End-to-end human approval system.

---

# STEP 23 — Team dashboard and scheduling controls

## Goal

Provide a practical interface for managing the system without relying on PowerShell or direct SQL queries.

## Tasks

Build a lightweight web dashboard suitable for a small internal team.

Include:

1. Secure login.
2. Overview of current jobs.
3. Job status and error details.
4. Script and caption preview.
5. Video preview.
6. Approval and rejection controls.
7. Manual job creation.
8. Retry and cancellation where authorized.
9. Schedule configuration management.
10. Enable/disable scheduling.
11. Next scheduled execution display.
12. Publication status.
13. Basic operational metrics.
14. Useful filtering and search.

Use a simple frontend stack appropriate to the existing repository.

Avoid heavy frameworks or unnecessary dependencies unless they materially improve maintainability.

Support Hebrew text and right-to-left display where relevant.

## Acceptance criteria

- Authorized teammates can operate the essential workflow through the browser.
- Schedule changes do not require manual SQL.
- Jobs and video reviews are accessible.
- Errors are understandable.
- Sensitive data is protected.

**Deliverable:** Functional internal application dashboard.

---

# STEP 24 — GHL organic publishing

## Goal

Publish or schedule approved organic content through GoHighLevel where supported.

## Tasks

1. Inspect current GHL API documentation and account permissions.
2. Confirm which Social Planner operations are publicly supported by the API.
3. Implement OAuth or the appropriate authorization method.
4. Securely store connection information.
5. Support the relevant connected social accounts.
6. Map approved videos, captions, and hashtags to supported publishing operations.
7. Support scheduling when available.
8. Record external post IDs and statuses.
9. Handle failures and retries.
10. Avoid duplicate publishing.
11. Record publication timestamps.
12. Reconcile status with the external platform where possible.
13. Add sandbox or mock testing.

If the required Social Planner operation is not officially supported, document that limitation and propose supported alternatives. Do not invent private endpoints.

## Acceptance criteria

- Approved content can be submitted through a supported GHL workflow.
- Unapproved content is blocked.
- Duplicate posts are prevented.
- Publication status is tracked.
- Integration limitations are documented.

**Deliverable:** Organic content publishing integration.

---

# STEP 25 — Meta paid publishing and campaigns

## Goal

Support approved paid marketing operations through Meta's official APIs.

## Tasks

1. Inspect current Meta Marketing API requirements.
2. Identify required Meta permissions, access tokens, and account setup.
3. Implement a provider adapter.
4. Support the relevant advertising assets and campaign structures.
5. Validate campaign configuration.
6. Support draft or paused creation where appropriate.
7. Require explicit human approval for activation.
8. Require explicit approval for budgets and material budget changes.
9. Record external campaign, ad set, creative, and ad identifiers.
10. Prevent duplicate campaign operations.
11. Implement rate-limit handling and retries.
12. Track costs and operational errors.
13. Test with mocks or approved test environments first.

Never launch or increase the spend of a real paid campaign without explicit authorization.

## Acceptance criteria

- The system can prepare supported Meta advertising operations.
- Required account permissions are documented.
- Paid activation is approval-gated.
- Campaign operations are auditable.
- Retry behavior is safe.

**Deliverable:** Meta paid-marketing integration.

---

# STEP 26 — Performance analytics

## Goal

Collect and display campaign and content performance.

## Tasks

1. Define an analytics data model.
2. Integrate supported Meta Insights endpoints.
3. Collect available organic metrics from supported providers.
4. Store time-series performance data.
5. Track metrics such as impressions, reach, engagement, clicks, spend, and conversions where available.
6. Normalize metric names without concealing source-specific differences.
7. Handle API pagination and date ranges.
8. Support incremental synchronization.
9. Avoid duplicate metric records.
10. Track when data was last updated.
11. Display metrics in the dashboard.
12. Respect account permissions and reporting delays.

Do not fabricate unavailable metrics.

## Acceptance criteria

- Supported metrics can be synchronized.
- Historical records are stored correctly.
- Dashboard reports use real source data.
- Missing metrics are clearly identified.
- Synchronization is resumable.

**Deliverable:** Performance analytics subsystem.

---

# STEP 27 — AI optimization recommendations

## Goal

Analyze marketing performance and suggest improvements.

## Tasks

1. Create an optimization analysis pipeline.
2. Provide relevant performance data to an LLM.
3. Generate recommendations for creative content, captions, posting schedules, and campaigns.
4. Require evidence and relevant metric references.
5. Store recommendations and their reasoning summaries.
6. Allow reviewers to approve or reject recommendations.
7. Separate recommendations from automatic actions.
8. Never silently modify campaign budgets.
9. Prevent unsupported causal claims based only on correlations.
10. Track which suggestions were implemented.
11. Compare subsequent results without overstating causality.
12. Support configurable analysis frequency.

Implement any hourly or daily monitoring requirements from the original planning document where practical.

## Acceptance criteria

- Recommendations are based on real available metrics.
- Team members can review suggestions.
- No paid changes are executed without approval.
- Recommendations are logged and traceable.

**Deliverable:** AI-assisted performance optimization.

---

# STEP 28 — Monitoring, audit logs, and alerts

## Goal

Make the application operationally manageable.

## Tasks

1. Implement structured logs.
2. Add correlation IDs for jobs and external requests.
3. Record meaningful lifecycle events.
4. Create durable audit records for important actions.
5. Monitor job processing failures.
6. Monitor scheduler execution.
7. Detect jobs stuck in intermediate states.
8. Detect repeated integration failures.
9. Detect missed webhook events where possible.
10. Add operational health reporting.
11. Configure useful notifications for serious failures.
12. Implement log retention and sensitive-data redaction.
13. Add basic usage and cost visibility.
14. Document incident response and recovery procedures.

Keep monitoring infrastructure simple and cost-conscious.

## Acceptance criteria

- Important failures are visible.
- Operators can identify which job failed and why.
- Credentials are absent from logs.
- Stuck operations can be identified and recovered.
- Critical actions are auditable.

**Deliverable:** Operational monitoring and recovery system.

---

# STEP 29 — End-to-end acceptance and security testing

## Goal

Verify the complete application before production activation.

## Tasks

Build and execute an acceptance test plan covering:

### Scheduling

- Recurring job creation.
- One-time job creation.
- DST transitions.
- Missed scheduled executions.
- Duplicate Cron calls.
- Concurrent scheduling requests.

### AI generation

- Successful Hebrew script generation.
- Invalid model responses.
- Provider timeouts.
- Retry handling.
- Cost and usage logging.

### HeyGen

- Successful rendering.
- Failed rendering.
- Duplicate webhook deliveries.
- Missing webhook events.
- Retry and recovery behavior.

### Approval

- Approve.
- Reject.
- Request changes.
- Modified-content reapproval.
- Unauthorized approval attempts.

### Publishing

- Approved content submission.
- Rejected content blocked.
- Duplicate publishing attempts.
- External API failures.
- Paid campaign approval requirements.

### Security

- Authentication.
- Authorization.
- Secret handling.
- Input validation.
- SQL injection protection.
- Webhook authenticity.
- Access to stored media.
- Rate limits.
- Dependency vulnerabilities.

### Infrastructure

- Render cold starts.
- Server restarts.
- Database unavailability.
- Interrupted processing.
- External Cron retries.
- Credential rotation procedures.

Run both automated tests and a controlled end-to-end demonstration using approved credentials and test resources.

## Acceptance criteria

- No critical or high-severity unresolved security issues.
- No known duplicate-production defects.
- No unauthorized publishing path.
- Core workflows recover from expected failures.
- All essential automated tests pass.
- Real integration limitations are documented.
- An authorized end-to-end test completes successfully.

**Deliverable:** Production readiness assessment.

---

# STEP 30 — Production launch and final documentation

## Goal

Complete the application and prepare it for practical use by the team.

## Tasks

1. Review the results of Step 29.
2. Resolve remaining critical blockers.
3. Verify production environment variables.
4. Confirm database migrations are applied.
5. Confirm backup and recovery procedures.
6. Verify HTTPS and authentication.
7. Verify external integrations and credential validity.
8. Document all environment variables and required permissions.
9. Document the deployment process.
10. Document database migration procedures.
11. Document the scheduler configuration.
12. Document how to start, stop, and pause automation.
13. Document job retries and failed-job recovery.
14. Document approval and publishing procedures.
15. Document expected provider costs.
16. Document known free-tier limitations.
17. Prepare a short team user guide.
18. Prepare a technical architecture guide.
19. Prepare an operational runbook.
20. Produce a final completion report.

Keep real publishing and recurring automation disabled until I approve activation.

When authorized, activate components gradually:

1. Scheduler and job creation.
2. AI content generation.
3. Video rendering.
4. Human review.
5. Organic publishing.
6. Paid marketing, only with specific authorization.
7. Performance monitoring and recommendations.

Do not enable every external action at once.

## Acceptance criteria

The application is considered complete when:

- Authorized team members can use the dashboard.
- Scheduled or manually created jobs reach the generation pipeline.
- Hebrew content can be generated.
- HeyGen videos can be rendered.
- Videos can be reviewed and approved.
- Approved content can be published through supported integrations.
- Publication and performance data can be tracked.
- Optimization recommendations can be reviewed.
- Failures are observable and recoverable.
- Authentication and permissions are enforced.
- The system survives expected restarts and retries.
- Setup and operational documentation are complete.
- A controlled end-to-end demonstration succeeds.

**Deliverable:** Complete AI Avatar automation application.

---

# PART IV — HOW TO EXECUTE THIS PLAN

## At the beginning of each step

Report:

- Current milestone.
- Existing relevant implementation.
- Planned changes.
- Important dependencies or risks.

Then implement the step.

Do not ask for confirmation for ordinary local coding and testing.

## At the end of each step

Produce a concise report containing:

1. Step number and title.
2. What was implemented.
3. Files added or modified.
4. Database migrations applied.
5. Tests executed.
6. Tests passed and failed.
7. Known limitations.
8. External credentials or approvals still required.
9. Whether the acceptance criteria were met.
10. Next milestone.

Update `PROJECT_STATUS.md` accordingly.

Do not claim success from tests that were not actually executed.

## When credentials are missing

Do not hardcode placeholders in a way that falsely makes the integration appear functional.

Instead:

1. Implement the provider abstraction.
2. Implement mock or fixture-based tests.
3. Document the exact credentials and permissions needed.
4. Mark real integration verification as blocked.
5. Continue with independent work where possible.
6. Return to live verification when credentials become available.

## When a task is risky or requires payment

Implement everything safely possible before asking for approval.

Ask one concise question stating exactly what external action or expenditure requires authorization.

## When something breaks

Diagnose the failure, fix it, rerun the relevant tests, and document the correction.

Avoid asking me to debug routine Node.js, Express, SQL, or frontend problems manually.

## Final instruction

**Start now at Step 12.**

First inspect the current codebase and the completed Step 11 work.

Use this document as the master development roadmap.

Work sequentially, preserve existing functionality, and prioritize security, reliability, maintainability, and minimal operating costs.

Your goal is to complete the application, not merely produce a prototype.

Stop for decisions requiring credentials, spending, destructive production changes, or authorization of real publishing. Otherwise, carry out development and testing autonomously within the available environment.
