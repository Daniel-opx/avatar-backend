# Step 25 — paused Meta campaigns, mock only

Implemented on 2026-11-11. This is a provider boundary and isolated campaign-preparation
workflow, not a live Meta connection. It has no real access-token setting, network transport,
advertising account or activation implementation. No real campaign or charge is created.
Real LLM/HeyGen API accounts, credits and approved test budgets are still outstanding.

## Contract research and limits

Meta's documentation pages returned 429/unavailable during this review. The current official
Meta SDK source was successfully inspected instead:

- [SDK setup and authorization](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/README.md)
- [Versioned Graph API base](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/api.js)
  currently declares v26.0. The mock pins that value; it is not live-account acceptance.
- [Ad account edges](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad-account.js)
  expose campaigns, adsets, adcreatives and ads.
- [Campaign fields/objectives](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/campaign.js),
  [ad-set budget/targeting](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad-set.js),
  [creative](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad-creative.js)
  and [ad](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ad.js).

The supported mock is deliberately small: OUTCOME_TRAFFIC, one Facebook feed video creative,
IL adult targeting, fixed ILS currency, a positive integer lifetime budget in mock agorot,
explicit start/end timestamps with offsets, and at most 30 days. There is no generic raw Graph
payload input. Mock account/Page/video IDs and `https://example.invalid/offer` are mandatory.
Campaign/adset/ad creation always requests PAUSED; creatives are non-delivering assets.
An existing mock video handle is used; actual upload, Page permissions, thumbnail requirements,
currency/minimum-budget rules, targeting eligibility and creative review remain unverified.
This template does not cover regulated/special-category ads or arbitrary objectives.

Before a live implementation, verify a registered Meta app with Marketing API access,
the actual business/ad account and Page assignments, token type/lifetime and least-privilege
permissions. `ads_management` is the permission to verify for writes; `ads_read` for read-only
work, and Page/business permissions only where the selected operations require them.
App review/access tier, business verification, permitted asset access, 2FA, token storage,
app-secret proof, billing/currency and actual account spend caps must be checked against
the account and current [Meta authorization documentation](https://developers.facebook.com/docs/marketing-api/overview/authorization/).
Those requirements are a pending checklist, not a claim that any account was inspected or
that unavailable documentation was verified. No token should be pasted into chat or Git.

## Approval and journal behavior

Content must have a current matching approval before drafting and before each preparation
step. The immutable draft hash binds all settings, including budget, destination, targeting,
Page/video handles and schedule. Only an individually authenticated admin can record exact-hash
budget review. Operators can propose and prepare but cannot approve budgets or activation.
Material changes create a new immutable draft and require new review; no in-place budget edit.

Activation review is separate, admin-only, and allowed only after all four components are
prepared without unresolved status errors. It records a **mock review**, never authority to
spend. `/activate` always returns 503 `activation_locked`, even after both reviews. No role,
environment key or database flag alone can activate real advertising.

Each manual preparation call reserves one operation before adapter I/O. Unique draft-stage
and provider-ID constraints, row locks and token fencing prevent duplicate stage creation.
A stage may progress while another overlapping caller completes; each stage is still created
at most once. Restarting a service resumes from stored successful IDs. Unknown creation
outcomes, including timeouts, malformed responses and throttling, stop without resubmission.
Missing IDs require manual reconciliation; names are never used to guess a matching object.
This conservative behavior does not assume undocumented Meta idempotency guarantees.

Known-ID inspection is read-only: no sooner than the stored due time, at most three checks,
with bounded Retry-After backoff (30–3600 seconds). Errors are stored as sanitized codes;
raw upstream messages and credentials are excluded. No automatic timers/Cron are added.
Budget amounts and component operations/reviews are audited. `real_spend_minor: 0` describes
the mock, not measured Meta Insights; actual cost collection belongs to Step 26.

## Private API

All paths below require a team cookie; POST also requires the existing CSRF header. Owner
and scheduler API keys cannot substitute for individual campaign/budget reviewers.

| Method/path | Access and purpose |
| --- | --- |
| POST `/team/jobs/:job/meta/drafts` | admin/operator; UUID request_key, approval_id, spec |
| GET `/team/meta/drafts/:id` | team; immutable settings, reviews, component journal |
| POST `/team/meta/drafts/:id/reviews/budget` | admin; UUID request_key, expected_hash, confirmation `APPROVE_MOCK_BUDGET` |
| POST `/team/meta/drafts/:id/reviews/activation` | admin; same fields, confirmation `REVIEW_MOCK_ACTIVATION` |
| POST `/team/meta/drafts/:id/prepare` | admin/operator; one paused component per call |
| POST `/team/meta/drafts/:id/operations/:operation/reconcile` | admin/operator; known-ID read only |
| POST `/team/meta/drafts/:id/activate` | admin; always locked, no external request |

Production configuration defaults disabled, zero drafts and zero budget ceiling. All four
tables use RLS and revoke PUBLIC/anon/authenticated privileges. The adapter must be explicitly
injected as mock code as well as enabled in an isolated fixture. No production adapter is registered.
There are no new dashboard controls in this step; existing dashboard edits are outside its scope.

## Repeatable verification

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
node --test meta.test.js
$env:RUN_DB_TESTS='1'
try { npm run test:meta:db } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

The opt-in suite creates a disposable schema with generated identities and synthetic content,
runs real PostgreSQL transactions against mock providers, then removes only that fixture.
Run it sequentially with other DB suites/previews because the Free pooler has limited clients.
Live Meta account/creative acceptance, real campaign creation, human budget approval and
activation are not claimed by these tests.

Final regression on 2026-11-11: 175 passed, zero failures/skips, including 14 final Meta test
records. Migration `20261111125826_mock_meta_campaigns.sql` is applied with disabled defaults.
Render source deployment is pending because the dashboard remained on Loading; no deploy
was triggered. No real campaign, advertising spend or provider API call occurred.
