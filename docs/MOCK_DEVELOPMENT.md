# Mock-only development decision — 2026-11-08

The owner authorized continued development using mocks, with no additional provider
spending. This is the current execution policy until explicitly changed by the owner.
Continue implementation and controlled testing in roadmap order; do not treat a pending
live-account test as permission to enable a provider or as evidence that the integration works.
Updated scope on 2026-11-09: owner resumed roadmap work in two-step batches, starting with
Steps 21–22. The earlier Step 20 feature pause is superseded. No provider spending, real
generation, publication or advertising is authorized by this scope change.

## Outstanding live prerequisites

- **LLM brain:** select a real API provider/model, configure a private server API key,
  confirm usable API billing/credits, and obtain an explicit test spending allowance.
  The owner's $20 ChatGPT membership is not a backend API budget. OpenAI is an optional
  implemented adapter, not an activated account. Real Hebrew output/quality, model access,
  latency, quotas and costs remain unverified.
- **HeyGen videos:** retain the owner's free web account; no upgrade or purchase is
  authorized. Real video automation still needs suitable API access/permissions, chosen
  avatar/voice, funded API video credits and an explicitly approved rendering budget.
  Do not assume free web-plan video allowances cover backend API calls. Recheck the actual
  account and current API pricing before any live generation.
- **External voice:** keep optional TTS disabled. Do not add ElevenLabs or another paid
  voice service unless needed and separately authorized.
- **Launch:** human approval, publication, advertising and recurring activation remain
  separate decisions. Mock success authorizes none of them.

Keep scheduling, processing and content generation disabled in production. Do not change
`.env`, Render credentials, database activation flags or provider request allowances to run
mocks. Mock adapters belong only in tests/local demonstration code, never the production
provider registry. Never present simulated IDs, content, assets or review states as real output.

## Repeatable mock walkthrough

```powershell
Set-Location 'C:\Users\דניאל\Desktop\ghl backend'
npm run demo:mock
```

This uses the existing PostgreSQL connection, creates a uniquely named disposable schema,
copies table structure without business data, and runs controlled content, asset and render
handlers through the real durable engine. Only the disposable configuration is enabled.
It simulates submission/polling and stops at a simulated human-review state. It creates no
real video, makes no LLM/HeyGen/TTS requests, publishes nothing, and drops its schema afterward.
The asset stage now uses Step 17's real metadata/manifest service with simulated configuration;
the rendering stage now uses Step 18's request journal and HTTP-contract mock adapter.
Step 19 also verifies a signed simulated callback, retention of labeled in-memory fixture
bytes and an expiring review grant. No bearer token is printed. The fixture is not a playable
video and is removed after the demo. See [COMPLETION.md](COMPLETION.md).
Step 20 uses the shared pipeline composition and adds a separate retention invocation before
the job can reach review; see [PIPELINE.md](PIPELINE.md).
No sample video file is produced. Real storage/media,
avatar permissions and provider generation remain unverified; see [ASSETS.md](ASSETS.md).
The mock video ID is retained only in the disposable render journal, never as a real
jobs.heygen_video_id. See [RENDERING.md](RENDERING.md) for submission/restart guarantees and limits.
If interrupted, a disposable `mock_demo_<uuid>` schema may need targeted cleanup after its
ownership/name is verified. Never delete `public` or clean schemas by wildcard.

For the broader regression suite with controlled providers:

```powershell
$env:RUN_DB_TESTS = '1'
try { npm test } finally { Remove-Item Env:RUN_DB_TESTS -ErrorAction SilentlyContinue }
```

Record mocked and live evidence separately in [PROJECT_STATUS.md](../PROJECT_STATUS.md).
Run the database demo and full suite sequentially: isolated schemas still share the existing
database connection allowance. The test command serializes files while retaining concurrent
requests inside each reliability test. Do not buy additional database capacity for the demo.
Step 16's live acceptance remains pending; continue mock preparation without marking it
live-verified. Steps 17 onward keep their own implementation and acceptance checklist.
