# Step 22 — exact-version review

Provides a backend approval workflow for signed-in team members. The chosen notification
channel is an **in-app inbox**, now also shown in the Step 23 dashboard.
Step 24 adds only a simulated GHL journal; mock publication never changes actual job publication
status or bypasses the database approval guard. See [GHL_PUBLISHING.md](GHL_PUBLISHING.md).
No WhatsApp/email integration, account purchase, external notification or public post is sent.

Current generation remains mock-only. Simulated decisions are recorded but never change a
job into a publishable status. Real identities, actual video inspection and real-account
acceptance remain pending; mock approval does not authorize live publication or spending.

## Review flow

1. An operator/admin requests review of a `ready_for_review` job. The server snapshots the
   current content revision, displayed script/visual plan, caption/hashtags/package, render
   request payload and retained video identity/checksum/metadata. It computes a canonical
   SHA256 fingerprint and creates notifications for active reviewers/admins.
2. A reviewer/admin fetches the request and associated text, then obtains the existing
   protected video-review link using their session and CSRF header. A callback or shared
   server key cannot act as the human reviewer.
3. The reviewer submits approve, reject or request-revision with the fingerprint they saw,
   their comment and a UUID idempotency key. The server rechecks current identity, role,
   session and snapshot in the decision transaction. Modified text/video cannot reuse the
   old approval. Stale pending requests become superseded.
4. One append-only decision records reviewer ID, action, comment and database timestamp.
   Retries with the same key/body replay that decision; conflicting or competing actions
   cannot overwrite it. Operators/admins receive an in-app decision notification.
5. For a rejected/revision-requested video, an operator/admin queues one replacement using
   a fresh topic/brief and idempotency key. The same job gets the next content revision;
   old content, asset/render journals, decisions and audit history remain. Old review grants
   are revoked. Current checkpoints reset for the new version, which requires new generation
   and a fresh review. Existing budgets/disabled flags are not raised or enabled.

Only exact current retained content can be approved. The displayed script/visual plan must
agree with the saved content package. Snapshots do not use transient download URLs as video
identity. Reviewer responses omit private object paths and render internals. A historical
decision can remain approved for its old snapshot while `current=false` prevents reuse.

## API (all require a human session; mutations also require CSRF)

| Method and path | Body / result |
| --- | --- |
| `POST /jobs/:jobId/approvals` | `{ "request_key":"<uuid>" }`; returns request ID, state and snapshot hash |
| `GET /jobs/:jobId/approvals` | Versioned request/decision history |
| `GET /jobs/:jobId/approvals/:requestId` | Text/media summary, fingerprint and whether it is current |
| `POST /jobs/:jobId/video/review` | Existing expiring private review link; disabled in production today |
| `POST /jobs/:jobId/approvals/:requestId/decisions` | UUID `request_key`, `action`, `expected_hash`, optional `comment` |
| `POST /jobs/:jobId/approvals/:requestId/revise` | UUID `request_key` and replacement `topic` |
| `GET /jobs/:jobId/approval-gate` | Current approval status and explicit publication denial |
| `GET /team/notifications` | Current person's own inbox |
| `POST /team/notifications/:requestId/:kind/read` | Marks only that person's notification read |

Decision `action` values: `approved`, `rejected`, `revision_requested`. Comments are limited
to 4,000 characters. `kind` is `review_requested` or `decision`. Reuse the same UUID only
for a retry of the identical operation. Every mock decision includes `publication_authorized:false`.

## Publication gate and limits

No publisher exists or is enabled. A database trigger also refuses inserts/updates into
`scheduled`/`published` status or a populated GHL post ID. This does not change the business
scheduler: it creates draft jobs with scheduled timestamps as before. The approval-gate
service recomputes the current snapshot; even an approved mock snapshot returns `MOCK_MEDIA`
and cannot publish. A future real publisher must implement the real-media approval check
inside its publication reservation *before* any external API action. This milestone does
not claim an external service can be controlled after posting has already occurred.

All existing render/storage adapters remain mock-only. Their fixture is not a playable
video. Real retention needs immutable object/version semantics and account-backed checksum,
permissions and media verification. Real approval/publication support must be implemented
and authorized after those prerequisites; changing an API key alone does not bypass the gate.

## Verification

`npm run demo:mock` runs the shared five-stage mock generation flow, creates simulated
operator/reviewer sessions, records one simulated approval, checks publication is denied,
and verifies logout revocation. No real person approved the fixture. Tokens are not printed;
the disposable schema is removed. Production flags, accounts and jobs remain unchanged.

Database tests cover session/role/CSRF boundaries, concurrent retries and competing decisions,
stale text/media, rejected-content denial, notification privacy and replacement generation
through a new version with fresh approval. See [TEAM_ACCESS.md](TEAM_ACCESS.md) for commands
and real-account prerequisites. Live human review of actual media remains unverified.
The CLI-generated approval migration is `supabase/migrations/20261109053341_video_approvals.sql`,
applied once through the Supabase connector and aligned to that hosted ledger version.
Full regression: 151 passed; final focused checks: 12 passed; simulated approval demo passed.
Application source `f253012` deployed on the existing Render Free service. Live unauthenticated
approval/inbox requests returned 401; no actual reviewer, decision or notification was created.
