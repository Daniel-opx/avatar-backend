# avatar-backend

Node.js/Express backend for the AI Avatar automation system, using Supabase PostgreSQL.

Development resumed for Step 16 on 2026-11-08. Steps 1–15 are complete; Step 16's
content-generation implementation passes database/mocked tests; the provider remains undecided.
Step 17 asset preparation passes mock/database checks, with external voice disabled by default.
Step 18 mock rendering has a tested durable submission/poll journal; live verification is deferred.
Step 19 adds mock authenticated callbacks, deduplication, retained media metadata and expiring
review links. Production completion remains disabled; real media/account verification is pending.
Step 20 connects those services through retention to human review. Owner resumed Steps 21–22:
team access and version-bound approval. The first real administrator is registered; sign-in
remains inactive pending private Render Auth configuration. Simulated approval cannot publish content.
Latest application source deployed to the existing Render Free service: `f253012`.
Scheduling and processing remain disabled; GitHub Actions supports manual tests only.
No generation, publishing, advertising, or paid provider integration is enabled.
Current owner decision: continue with mocks only and no additional spending. Real LLM API
access/budget and HeyGen API video credits/budget are still required before live automation.

- [Project status and verification evidence](PROJECT_STATUS.md)
- [Full development roadmap](docs/DEVELOPMENT_ROADMAP.md)
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

Run locally with `npm ci` then `npm start`. Configure credentials privately in `.env`;
see the deployment guide. Run `npm test` for local checks; opt-in PostgreSQL test
instructions are in the processing/content/asset/rendering/completion/pipeline guides.
Full regression: 151 passed, zero failures/skips.
Run `npm run demo:mock` for a disposable simulated walkthrough; no real video is generated.
