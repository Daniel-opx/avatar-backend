// Local simulation only. Never registered in the production Express application.
require('dotenv').config({ quiet: true });
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pool = require('../db/pool');
const { createContentService } = require('../services/content');
const { createAssetService } = require('../services/assets');
const { composePipeline } = require('../services/pipeline');
const { createRenderService } = require('../services/rendering');
const { createMockHeyGen } = require('../services/heygen-mock');
const { createCompletionService } = require('../services/completion');
const { createMockVideoStore } = require('../test-support/mock-video-store');

async function main() {
  const schema = `mock_demo_${randomUUID().replaceAll('-', '')}`;
  const query = (sql, values) => pool.query(sql.replaceAll('public.', `${schema}.`), values);
  let mockCalls = 0;
  let schemaCreated = false;
  let report;
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    schemaCreated = true;
    // Structure only; no real topics, scripts, jobs or credentials are copied.
    await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for (const migration of ['20261106073647_durable_processing.sql', '20261108184837_versioned_content.sql', '20261108191748_asset_preparation.sql', '20261108193747_render_requests.sql', '20261108200903_webhook_media.sql']) {
      await query(readFileSync(path.join(__dirname, '../supabase/migrations', migration), 'utf8'));
    }
    await query('UPDATE public.processing_config SET enabled=true');
    await query(`UPDATE public.content_config SET enabled=true,provider='openai',
      model='mock-only-no-model-call',max_requests=1`);
    await query("UPDATE public.asset_config SET enabled=true,avatar_id='mock-avatar',voice_id='mock-voice'");
    await query('UPDATE public.render_config SET enabled=true,max_submissions=1,poll_after_seconds=5');
    await query('UPDATE public.completion_config SET enabled=true');
    const jobId = (await query("INSERT INTO public.jobs(topic) VALUES('הדגמה מדומה בלבד') RETURNING id")).rows[0].id;
    const content = createContentService(pool, { schema, liveAllowed: true, providers: {
      // Only this local function is called; no real provider adapter is constructed.
      openai: { async generate() {
        mockCalls++;
        return { model: 'mock-only-no-model-call', usage: null, requestId: 'mock-request', content: {
          language: 'he', script: 'זוהי הדגמה מדומה של תכנון תוכן בעברית. התוכן דורש בדיקה אנושית.',
          caption: 'הדגמה בלבד — לא לפרסום', hashtags: ['#הדגמה'],
          visual_plan: [{ description: 'דמות מדומה מול רקע פשוט', on_screen_text: 'הדגמה בלבד', duration_seconds: 15 }],
          claims: [], metadata: { tone: 'נעים', audience: 'בודקי המערכת', review_notes: ['תוכן מדומה, ללא וידאו אמיתי'] },
        } };
      } },
    } });
    const assets = createAssetService(pool,{schema,allowPreparation:true});
    let mockSubmissions=0;let callbackId;
    const provider=createMockHeyGen({transport:{mode:'mock',async request(url,options){
      if(options.method==='POST'){mockSubmissions++;callbackId=JSON.parse(options.body).callback_id;}
      return new Response(JSON.stringify({data:{video_id:'mock_demo_video',callback_id:callbackId,status:options.method==='POST'?'waiting':'completed'}}));
    }}});
    const rendering=createRenderService(pool,{schema,allowMock:true,provider});
    const secret=randomBytes(32).toString('hex');
    const completion=createCompletionService(pool,{schema,allowMock:true,secret,provider,store:createMockVideoStore()});
    const worker=composePipeline(pool,{content,assets,rendering,completion},{schema}).processing;
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(await worker.runOne());
    assert.equal(steps.at(-1).status, 'waiting');
    // Advance only the isolated mock poll clock instead of waiting for a provider.
    await query('UPDATE public.job_processing SET next_attempt_at=clock_timestamp() WHERE job_id=$1', [jobId]);
    await query('UPDATE public.render_requests SET next_action_at=clock_timestamp() WHERE job_id=$1',[jobId]);
    steps.push(await worker.runOne());
    assert.equal(steps.at(-1).status, 'waiting');
    assert.equal((await query('SELECT status FROM public.jobs WHERE id=$1',[jobId])).rows[0].status,'rendering');
    assert.equal((await completion.issueReview(jobId)).status,'unavailable');
    const raw=Buffer.from(JSON.stringify({event_type:'avatar_video.success',event_data:{video_id:'mock_demo_video',callback_id:callbackId}}));
    assert.equal((await completion.receive(raw,createHmac('sha256',secret).update(raw).digest('hex'))).status,'accepted');
    await query('UPDATE public.job_processing SET next_attempt_at=clock_timestamp() WHERE job_id=$1',[jobId]);
    steps.push(await worker.runOne());
    assert.equal(steps.at(-1).status,'succeeded');
    const history = await content.history(jobId);
    const job = (await query('SELECT status,heygen_video_id,ghl_post_id FROM public.jobs WHERE id=$1', [jobId])).rows[0];
    assert.equal(mockCalls, 1);
    assert.equal(history.versions.length, 1);
    assert.equal(job.status, 'ready_for_review');
    assert.equal(job.heygen_video_id, null);
    assert.equal(job.ghl_post_id, null);
    assert.equal(mockSubmissions,1);
    const renderHistory=await rendering.history(jobId);
    assert.equal(renderHistory.requests[0].external_video_id,'mock_demo_video');
    const grant=await completion.issueReview(jobId);assert.equal(grant.status,'ready');
    const review=await completion.readReview(grant.url.split('/').at(-1));assert.equal(review.status,'ready');
    report = { mode: 'MOCK_ONLY', steps, mock_llm_calls: mockCalls,
      mock_webhook_accepted:true,private_mock_media_retained:true,expiring_review_link_verified:true,
      review_fixture_bytes:review.bytes.length,playable_video:false,
      mock_render_submissions:mockSubmissions,persisted_mock_video_id:renderHistory.requests[0].external_video_id,
      real_provider_calls: 0, real_video_generated: false, published: false,
      simulated_job_status: job.status, production_configuration_changed: false };
  } finally {
    // schema is a fixed prefix plus a generated UUID, never a caller-supplied identifier.
    if (schemaCreated) await pool.query(`DROP SCHEMA ${schema} CASCADE`);
    await pool.end();
  }
  console.log(JSON.stringify({ ...report, disposable_schema_removed: true }, null, 2));
}
main().catch(error => {
  console.error(JSON.stringify({ mode: 'MOCK_ONLY', error: 'Mock demonstration failed', code: error.code || 'CHECK_FAILED' }));
  process.exitCode = 1;
});
