# Prepared sign-in settings — review only

Prepared at the owner's request on 2026-11-09. **Not applied or activated.** The existing
first administrator is unchanged; no new identity or role is proposed.

| Existing Render service variable | Proposed value/source |
| --- | --- |
| TEAM_AUTH_ENABLED | `true` |
| SUPABASE_URL | `https://gstxqjoydxeravcefjit.supabase.co` (verified via connector) |
| SUPABASE_PUBLISHABLE_KEY | Existing `sb_publishable_…` from this project's API Keys, entered privately |

The key value is not copied into this document, Git or chat. No password, owner API_KEY,
database URL, scheduler key or provider key needs to change. The administrator would use
their confirmed application Auth email/password at `/dashboard/`, not a Dashboard/org login.

Activation would allow that registered administrator to access authorized team operations.
It would not enable LLM/HeyGen, GHL publishing, advertising, scheduling, Cron recurrence or
request allowances. Those remain gated. Login still requires an enabled team membership,
the verified managed Auth session, opaque cookie, CSRF and server role checks.

Activation and real-account login verification remain pending explicit confirmation and
private configuration. No actual account login is claimed by the mock UI tests.
See [TEAM_ACCESS.md](TEAM_ACCESS.md) for the setup details.

The Supabase advisor currently reports leaked-password protection disabled. This was not
changed, and no paid feature was enabled. Review the actual account's available protection
before live-user acceptance: [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
