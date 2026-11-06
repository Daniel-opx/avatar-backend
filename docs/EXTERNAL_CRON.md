# Step 14 preparation — external free Cron (inactive)

Status: researched only. No account created, secret shared, remote Cron job configured or activated.
Step 13 still has a credential-rotation gate and an idle cold-start test to finish.

## Provider assessment, checked 2026-11-06

cron-job.org official FAQ says the service is free, supports custom request headers and POST,
and can invoke every minute. It documents a 30-second request timeout, 64-KiB response limit,
and storage of response history. Its API requires a separate account API key; the documented
management API default is 100 calls/day (not the execution schedule limit).

Two unresolved issues prevent choosing it automatically:

1. Render documents around one minute to wake a Free service, longer than the Cron FAQ timeout.
   A timed-out client does not prove a scheduler transaction did not commit. A later invocation
   must retry safely using the database's slot lock and unique index. No detached background
   request processing or guaranteed warm-instance availability should be assumed.
2. The provider FAQ explicitly says executor HTTPS certificate verification is not performed.
   Confirm current executor behavior with the provider, or select a provider that verifies TLS,
   before giving it a production credential. Do not infer secure identity checks from HTTPS alone.

Render Free also has monthly shared hours, bandwidth and build allowances. Bandwidth overage
can cause charges when a payment method is present; Free compute alone is not a blanket cost cap.
No plan, billing setting, payment method or resource quota was changed. Confirm account limits
before activation. The owner has authorized no added charges.

## Proposed request contract (provider independent)

- Method: POST.
- URL: `https://avatar-backend-65ep.onrender.com/internal/run-scheduler`.
- Header: `x-api-key` supplied privately using a fresh credential; never in a URL or repository.
- Body: empty; business configuration is read from PostgreSQL.
- Polling proposal: every 5 minutes, timezone Asia/Jerusalem. This is a proposal, not an enabled job.
- External job enabled: false. Database `schedule_config.enabled`: false.
- Verify TLS certificate and hostname. Never follow a redirect to send the credential elsewhere.
- Response recording: disable where possible; disabled endpoint currently includes configuration.
- Allow cold-start time with a provider supporting at least 120 seconds, or explicitly test/document
  a supported later retry policy. Use bounded retries for transport/5xx/429, not tight loops.
- Treat 401/403 as configuration errors; 409 as a schedule-configuration problem.
- A lost response is ambiguous: later retry is safe; never clear a slot or insert a manual duplicate.
- Keep the external service separate from business recurrence; never encode daily/weekly rules there.

## Acceptance still outstanding

Choose a TLS-verifying provider compatible with Free cold-start delays and zero extra charges;
establish private account access; rotate the exposed key; configure one disabled job; authorize
a one-off test while DB scheduling remains disabled; verify authenticated response, duplicate
behavior, failure reporting and cold-start retry through that provider. Leave recurring execution
disabled even after testing. No Step 14 integration is claimed complete from these notes.

## Official sources

- https://cron-job.org/en/faq/
- https://docs.cron-job.org/rest-api.html
- https://render.com/docs/free
- https://render.com/docs/health-checks
- https://render.com/docs/deploys
- https://expressjs.com/en/guide/behind-proxies/
