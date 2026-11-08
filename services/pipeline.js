const { createProcessing } = require('./processing');
const { createContentService } = require('./content');
const { createOpenAI } = require('./llm-provider');
const { createAssetService } = require('./assets');
function createPipeline(pool = require('../db/pool'), env = process.env) {
  const liveAllowed = env.CONTENT_LIVE_ENABLED === 'true';
  const providers = {};
  if (liveAllowed && env.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const content = createContentService(pool,{ providers,liveAllowed });
  // Step 17 stays mock-only; real storage/voice adapters are not registered here.
  const assets = createAssetService(pool);
  return { content, assets, processing: createProcessing(pool,{ content: content.handler, assets: assets.handler }) };
}
module.exports = { createPipeline };
