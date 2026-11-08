const { createProcessing } = require('./processing');
const { createContentService } = require('./content');
const { createOpenAI } = require('./llm-provider');
function createPipeline(pool = require('../db/pool'), env = process.env) {
  const liveAllowed = env.CONTENT_LIVE_ENABLED === 'true';
  const providers = {};
  if (liveAllowed && env.OPENAI_API_KEY) providers.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const content = createContentService(pool,{ providers,liveAllowed });
  return { content, processing: createProcessing(pool,{ content: content.handler }) };
}
module.exports = { createPipeline };
