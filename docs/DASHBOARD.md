# Step 23 — team dashboard

Open `/dashboard/` on the Express/Render service; `/` redirects there. Plain HTML/CSS/JS,
Hebrew and RTL, without a frontend framework, CDN, build pipeline or embedded server key.
The public login shell contains no business data. Existing cookie sessions, CSRF headers
and server roles protect all APIs. UI visibility supplements, not replaces, authorization.

Features: job creation/search/status filters, operational counts, scripts/captions/hashtags,
processing history, review decisions and replacement versions, protected video preview and
each person's notifications. Mock media is labeled and never presented as playable video.
Actual publication metrics count jobs marked published, not simulated journal records.

Admin-only `PUT /team/schedule` saves PostgreSQL configuration with an opaque version to
prevent lost updates. Frequency, interval and local run time reuse Step 11's Jerusalem/DST
behavior. The first run accepts an ISO timestamp with offset or Z; display uses Jerusalem.
Production activation remains locked. Disabled settings can be saved, and existing scheduling
can be turned off; generation/provider budgets cannot be enabled by this UI. External Cron
and the manual-only GitHub workflow remain separate and unchanged.

Untrusted text uses `textContent`. CSP allows same-origin scripts/styles. No credentials
are stored in browser storage; only UUID operation keys persist there for retry identity.
The session remains HttpOnly; writes use the existing CSRF cookie/header. A 401 clears the
visible workspace and returns to login. There is no background polling loop.

Real sign-in remains inactive pending [the prepared settings review](AUTH_ACTIVATION_REVIEW.md).
The first administrator is registered. No real password was used in browser QA.

## Preview and tests

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
npm run preview:dashboard
```

Use the printed localhost URL and simulated `admin@mock.invalid` / `demo-only` credentials
only in that preview. It creates a disposable schema without copying business rows. Type
`stop` or Ctrl+C in an interactive terminal to clean up; it also expires after 30 minutes.
Automation tools must use an open terminal stdin (`tty=true`). A forcibly terminated preview
may require verified cleanup of its exact generated schema; never drop schemas by wildcard.

Browser QA verified simulated login, RTL workspace, script/review controls, simulated GHL
submission and logout. Native confirmation dialogs were replaced by an inline review
acknowledgement. No actual person approved content and no real social post was created.
The final inline checkbox/approval interaction and logout were also verified in a fresh
disposable preview after aligning the migration filename with the hosted ledger.

```powershell
$env:RUN_DB_TESTS='1'
try { npm run test:dashboard:db } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

Run preview and database suites sequentially. Tests use real isolated PostgreSQL with
controlled identities/providers. Real account sign-in, video preview and publishing remain unverified.
