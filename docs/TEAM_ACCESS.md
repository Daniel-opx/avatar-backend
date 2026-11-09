# Step 21 — team access

Uses the existing project's Supabase Auth, with the pinned official `@supabase/auth-js`
client, rather than a new password database or enterprise identity service. Password sign-in
is verified using `getUser`; role claims in user-editable metadata are ignored. Roles come
from private `team_members` rows. There is no public signup or automatic team enrollment.

Current production state: **sign-in inactive**, first administrator registered on 2026-11-09
after owner supplied an existing confirmed Auth user UUID. Bootstrap audit recorded; no
password, credential or activation setting changed. The user UUID/email are not copied into Git.
Account-backed login acceptance is pending. Tests use simulated identities and real isolated
PostgreSQL tables, not real Supabase accounts. No paid authentication feature is used.

## Roles and authentication boundaries

| Capability | Administrator | Operator | Reviewer |
| --- | --- | --- | --- |
| Read jobs, scripts, video metadata and history | Yes | Yes | Yes |
| Create/regenerate jobs, run/retry/cancel processing | Yes | Yes | No |
| Issue a protected video-review link | Yes | Yes | Yes |
| Request review or queue a replacement version | Yes | Yes | No |
| Approve/reject/request revisions | Yes | No | Yes |
| Manage team roles and read the audit log | Yes | No | No |
| Read notifications | Own inbox | Own inbox | Own inbox |

This is a single-team application: enrolled members share the team's jobs, not separate
per-user workspaces. Role changes take effect on the next request; approval decisions
recheck membership and session validity inside their database transaction.

The existing server owner `x-api-key` remains compatible with existing job/internal routes.
It is not a human identity and cannot submit approval decisions or manage the team.
The separate scheduler key retains only its scheduler endpoint. Team cookies cannot call
`/internal/*`; human processing controls use `/team/*`. No owner/scheduler key goes into
frontend JavaScript. Public health, raw-signature webhooks and expiring bearer review
links retain their existing purposes; issuing a review link requires authorized access.

## Sessions

`POST /auth/login` accepts JSON email/password, signs into the configured Supabase project,
then checks its managed session and active membership. Only a new random 256-bit opaque
backend cookie reaches the browser; upstream access/refresh tokens are discarded, not
stored or returned. The cookie is HttpOnly, host-only, SameSite=Strict and Secure on Render.
Only SHA256 token/CSRF hashes are stored. App sessions expire after at most 30 minutes,
bounded by the verified upstream JWT expiry. Re-login is required; no refresh loop is added.

Every authenticated request checks membership, local expiry/revocation and the corresponding
`auth.sessions` row, including its `not_after` limit. Local logout revokes the backend session
immediately, preventing re-use. Provider sign-out/account deletion also prevents access when
its session row is removed. A readable same-site CSRF cookie supplies `x-csrf-token` for
state-changing requests; the server verifies its hash and checks browser Origin. Login
requires JSON and matching Origin, and HTTPS in production. Login attempts are limited to
10 per 15 minutes per process; the existing global request cap still applies.

`POST /auth/logout` clears cookies; `GET /auth/me` returns ID and current role, without tokens.
Login/logout, membership changes, job-operation attempts and approval actions are audited.
Audit records are append-only through the app, not tamper-proof against the database owner.
Application logs omit passwords, cookies, tokens, headers and request bodies.

Team IDs logically reference Supabase user UUIDs. Enrollment verifies `auth.users` exists;
there is deliberately no deletion-blocking FK to the managed user table, so account deletion
can revoke access while old audit actor IDs remain intact. Team removal uses disable rather
than deleting audit identities. The last enabled, existing administrator cannot be demoted
or disabled through the app. External account deletion may require owner-assisted recovery.

## Real-account setup — not executed

The first administrator is already registered; do not rerun bootstrap. Sign-in still needs
the private Render configuration below and a real-account verification. The remaining setup
instructions document the initial process for recovery/reference, not permission to add another admin.
Use an existing, confirmed Supabase Auth email/password user. This backend does not create
accounts, send invitations, reset passwords or change Supabase signup/email settings.
Find the user UUID under the project → Authentication → Users. A Supabase Dashboard login
or organization member is not automatically an application Auth user.

Privately configure the existing Render service with:

- `TEAM_AUTH_ENABLED=true`
- `SUPABASE_URL=https://<project-ref>.supabase.co` (no trailing slash)
- `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`

No service-role key is needed. `.env` was not changed. Missing/invalid configuration keeps
sign-in disabled. The app-session limit is enforced by our own table, not a paid Supabase
session-settings feature. No plan upgrade is authorized.

To register the first administrator from an authorized local terminal:

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
node scripts/bootstrap-team-admin.js '<existing-supabase-auth-user-uuid>' --confirm-first-admin
```

The script uses the existing private database connection, verifies the user, refuses to run
once a team exists, and records bootstrap in the audit log. It never changes activation flags.
Later members use `PUT /team/members/:userUuid` with `{ "role":"reviewer", "enabled":true }`,
an administrator cookie and CSRF header. Adding someone is an explicit access-grant action.

Human controls: `POST /team/processing/run`, `POST /team/jobs/:id/retry`,
`POST /team/jobs/:id/cancel`, `GET /team/jobs/:id/history`. Administrative endpoints are
`GET /team/members` and `GET /team/audit`. Step 23 now supplies the Hebrew/RTL dashboard
and login UI; see [DASHBOARD.md](DASHBOARD.md). Real sign-in remains inactive. Proposed
Render settings are prepared, not applied: [AUTH_ACTIVATION_REVIEW.md](AUTH_ACTIVATION_REVIEW.md).

## Verification

```powershell
$env:RUN_DB_TESTS='1'
try { npm run test:team-approvals:db } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
# After the suite has finished:
npm run demo:mock
```

Run database checks/demo sequentially to fit the existing connection allowance. All six new
tables are RLS-enabled with PUBLIC/anon/authenticated privileges revoked; browser clients
use Express and cannot query the private tables through Supabase Data API.
The CLI-generated team migration is `supabase/migrations/20261109053326_team_access.sql`,
applied once through the Supabase connector and aligned to that hosted ledger version.
Full regression: 151 passed. Final focused team/approval checks: 12 passed; updated mock
demo passed. Account-backed authentication remains unverified and inactive.
Application source `f253012` deployed on the existing Render Free service on 2026-11-09.
Live health/readiness returned 200; team/account endpoints rejected anonymous requests with
401 and sign-in returned 503 inactive. No real member or credential was configured.

References checked 2026-11-09: [password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword),
[verified user lookup](https://supabase.com/docs/reference/javascript/auth-getuser),
[Supabase session IDs and revocation](https://supabase.com/docs/guides/auth/sessions).
