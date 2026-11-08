const { createProcessing } = require('./processing');
const { createContentService } = require('./content');
const { createOpenAI } = require('./llm-provider');
const { createAssetService } = require('./assets');
const { createRenderService } = require('./rendering');
const { createCompletionService } = require('./completion');
function createPipeline(pool = require('../db/pool'), env = process.env) {
  const liveAllowed = env.CONTENT_LIVE_ENABLED === 'true';
  const providers = {};
  if (liveAllowed && env.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const content = createContentService(pool,{ providers,liveAllowed });
  // Step 17 stays mock-only; real storage/voice adapters are not registered here.
  const assets = createAssetService(pool);
  // Mock transports exist only in tests/demo; credentials cannot enable rendering here.
  const rendering = createRenderService(pool);
  const completion = createCompletionService(pool);
  return { content, assets, rendering, completion, processing: createProcessing(pool,{
    content: content.handler, assets: assets.handler, render: rendering.handler }) };
}
module.exports = { createPipeline };
