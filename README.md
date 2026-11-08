# avatar-backend

Node.js/Express backend for the AI Avatar automation system, using Supabase PostgreSQL.

Development resumed for Step 16 on 2026-11-08. Steps 1–15 are complete; Step 16's
content-generation implementation passes database/mocked tests; the provider remains undecided.
Latest application source deployed to the existing Render Free service: `8c708a7`.
Scheduling and processing remain disabled; GitHub Actions supports manual tests only.
No generation, publishing, advertising, or paid provider integration is enabled.

- [Project status and verification evidence](PROJECT_STATUS.md)
- [Full development roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Deployment and recovery](docs/DEPLOYMENT.md)
- [External scheduler](docs/EXTERNAL_CRON.md)
- [Durable processing and test commands](docs/PROCESSING.md)
- [Hebrew content generation, versions and provider safeguards](docs/CONTENT.md)

Run locally with `npm ci` then `npm start`. Configure credentials privately in `.env`;
see the deployment guide. Run `npm test` for local checks; opt-in PostgreSQL test
instructions are in the processing/content guides. Last complete run: 76 passed, zero failures/skips.
