const { createProcessing, PendingStep, StepError } = require('./processing');
const { createContentService } = require('./content');
const { createOpenAI } = require('./llm-provider');
const { createAssetService } = require('./assets');
const { createRenderService } = require('./rendering');
const { createCompletionService } = require('./completion');
function composePipeline(pool,{content,assets,rendering,completion},{schema='public'}={}) {
  const render={
    retrySafe:true,
    async isAvailable(run){
      return await rendering.handler.isAvailable(run)&&await completion.isAvailable(run);
    },
    async run(context){
      if(!context.progress?.awaiting_media){
        const output=await rendering.handler.run(context);
        if(output instanceof PendingStep)return output;
        // Persist completion before retention: each invocation performs one short operation.
        return new PendingStep({...output,awaiting_media:true},5);
      }
      const output=context.progress;
      const result=await completion.reconcile(output.render_request_id,{signal:context.signal,promote:false});
      if(result.status==='ready'){
        const {awaiting_media,...saved}=output;
        return {...saved,review_link_available:true};
      }
      if(['busy','not_due','waiting','queued','stale'].includes(result.status))return new PendingStep(output,30);
      throw new StepError(result.status==='disabled'?'MEDIA_DISABLED':'MEDIA_RETENTION_FAILED');
    },
    async commit(run,row,output){
      await rendering.handler.commit(run,row,output);
      const media=await run(`SELECT 1 FROM public.video_media WHERE render_request_id=$1 AND state='ready'`,[output.render_request_id]);
      if(!media.rowCount)throw new StepError('MEDIA_NOT_READY');
    },
  };
  return {content,assets,rendering,completion,processing:createProcessing(pool,{
    content:content.handler,assets:assets.handler,render,
  },schema)};
}
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
  return composePipeline(pool,{content,assets,rendering,completion});
}
module.exports = { createPipeline, composePipeline };
