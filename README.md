# avatar-backend

Node.js/Express backend for the AI Avatar automation system, using Supabase PostgreSQL.

The owner adopted a new [outcome-based Step 0–12 roadmap](docs/PLATFORM_ROADMAP.md) on
2026-11-11, based on the [original architecture](https://files.instinct.com/uol1rj37gm3r).
The target is the full platform: real branded Hebrew videos, Cron/chat initiation, human review,
GHL organic publishing and Meta-based recommendations/approved campaign operations.
HeyGen renders; GHL owns the organic calendar; Meta owns advertising reporting. Our backend
coordinates them rather than building competing platform products.

Current position: **Step 0, account readiness and production choices**. Reuse the working
backend/scheduler/durable processing foundation. Next delivery gates are an accepted real
avatar/voice pilot and real content → sourced creative → template rendering → playable video.
There is currently no Pexels/Pixabay integration, real Studio-template pipeline or verified
real-video output. Existing content/render/storage/review/publishing services have mock/test
evidence; inserting credentials alone will not make the mock-only services production-ready.

The minimal RTL dashboard and disabled GHL/Meta mock modules are retained. Further dashboard,
reporting-product and downstream mock expansion is deferred. The first administrator is
registered, but real sign-in remains inactive. Legacy Step 25 source/schema are tested; source
deployment remains pending after Render's management dashboard failed to load.
Latest application source deployed to the existing Render Free service: `7021c2c`.
Dashboard: https://avatar-backend-65ep.onrender.com/dashboard/ (real sign-in still inactive).
Scheduling and processing remain disabled; GitHub Actions supports manual tests only.
No generation, publishing, advertising, or paid provider integration is enabled.
Current owner decision: continue with mocks only and no additional spending. Real LLM API
access/budget and HeyGen API video credits/budget are still required before live automation.

- [Project status and verification evidence](PROJECT_STATUS.md)
- [Active platform roadmap — Steps 0–12](docs/PLATFORM_ROADMAP.md)
- [Superseded development roadmap — historical reference](docs/DEVELOPMENT_ROADMAP.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)
- [External scheduler](docs/EXTERNAL_CRON.md)
- [Durable processing and test commands](docs/PROCESSING.md)
- [Hebrew content generation, versions and provider safeguards](docs/CONTENT.md)
- [Mock-only policy, outstanding account budgets and local demo](docs/MOCK_DEVELOPMENT.md)
- [Private asset manifests, validation and optional mock voice](docs/ASSETS.md)
- [Mock HeyGen rendering, duplicate protection and polling](docs/RENDERING.md)
- [Mock callbacks, private retention and protected review](docs/COMPLETION.md)
- [Small end-to-end mock pipeline and manual demo](docs/PIPELINE.md)
- [Team identities, roles, sessions and setup](docs/TEAM_ACCESS.md)
- [Exact-version approvals, replacement videos and inbox notifications](docs/APPROVALS.md)
- [Team dashboard and local preview](docs/DASHBOARD.md)
- [Mock GHL publishing contract and live prerequisites](docs/GHL_PUBLISHING.md)
- [Mock Meta campaigns, budget reviews and activation lock](docs/META_ADVERTISING.md)
- [Prepared sign-in settings — not activated](docs/AUTH_ACTIVATION_REVIEW.md)

Run locally with `npm ci` then `npm start`. Configure credentials privately in `.env`;
see the deployment guide. Run `npm test` for local checks; opt-in PostgreSQL test
instructions are in the processing/content/asset/rendering/completion/pipeline guides.
Full regression: 175 passed, zero failures/skips.
Run `npm run demo:mock` for a disposable simulated walkthrough; no real video is generated.
