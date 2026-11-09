# Step 24 — mock GHL organic publishing

No live adapter, OAuth registration, Private Integration token or actual social account is
activated. Production registers no provider; environment credentials cannot enable posting.
The database starts disabled, with zero submission allowance and no accounts.

Official references checked 2026-11-09: [Create post](https://marketplace.gohighlevel.com/docs/ghl/social-planner/create-post/),
[Get post](https://marketplace.gohighlevel.com/docs/ghl/social-planner/get-post/),
[authorization scopes](https://marketplace.gohighlevel.com/docs/Authorization/Scopes/).
Create uses POST `/social-media-posting/{locationId}/posts`; GET with `/{id}` reads status.
Both document `Version:v3` and sub-account Bearer authentication via OAuth/Private Integration.
Required post scopes are `socialplanner/post.write` and `socialplanner/post.readonly`.
Actual account permissions, plan access, connected accounts and platform acceptance are unverified.

The controlled adapter models one standard Facebook video post per account. Approved caption
and hashtags become `summary`; media is video/mp4 with a fixed `media.mock.invalid` HTTPS
reference. Future ISO dates map to scheduling. Text is bounded and dynamic substitutions
are rejected to avoid changing approved copy. Only an injected `mode:mock` transport is
accepted, with a dummy Bearer header and no fallback HTTP client. Real tokens are not read.

## Approval and reliability

Admin/operator submission rechecks the human session, role and exact current approved
snapshot under database locks. Missing, pending, rejected or stale approvals cannot submit.
A private journal is unique per approval/account. Immutable payload, fingerprint, mock
location and timestamps persist before the adapter call; a serialized allowance bounds work.

Retries return the saved request, including after an original scheduled time has passed.
Lost reservation acknowledgement, timeout or uncertain creation never triggers a blind
resubmission. No GHL idempotency header or guarantee was established or invented. Known
saved mock IDs can be polled with bounded checks, backoff and stale-response fencing.
Unknown outcomes need operator investigation. No automatic publication worker is added.

Only `mock_` external IDs are accepted. They never populate jobs.ghl_post_id or actual
scheduled/published job status. Responses include `real_post_created:false`; the dashboard
labels simulations. Step 22's publication guard remains intact. Historical submission status
does not approve changed content. Real publishing remains unauthorized and unavailable.

## API

Team sessions are required; writes also require CSRF. Server owner/scheduler keys cannot
substitute for human access.

- `GET /team/publishing/accounts`: mock availability and configured mock account choices.
- `GET /team/jobs/:id/publishing`: sanitized journal.
- `POST /team/jobs/:id/publishing`: UUID request_key, approval_id, account_id, optional schedule_date.
- `POST /team/jobs/:id/publishing/:requestId/reconcile`: known-ID status check.

Before live work, verify the actual GHL account/API permissions and connected Facebook ID,
appropriate server credential/scopes and private secret storage/rotation. Private Integration
is a documented candidate, not a configured connection. Do not paste credentials into chat,
Git or browser JavaScript. No private endpoints are used.

Real LLM/HeyGen funding, immutable retained video, accessible media lifetime (especially for
scheduled posts), actual human review and explicit publication authorization remain required.
A future live publisher must reserve approved immutable content before external I/O and
handle edits/cancellation during in-flight requests. Mocks do not prove GHL atomicity,
retry guarantees or real acceptance. A real adapter requires separate implementation/verification.

Tests cover approval/role/CSRF denial, concurrent retries, scheduled reconciliation, read
failures, unknown writes and lost database acknowledgement. Commands: [DASHBOARD.md](DASHBOARD.md).
