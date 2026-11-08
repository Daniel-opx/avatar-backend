// Local simulation only. Never registered in the production Express application.
require('dotenv').config({ quiet: true });
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const pool = require('../db/pool');
const { createContentService } = require('../services/content');
const { createProcessing, PendingStep } = require('../services/processing');

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
    for (const migration of ['20261106073647_durable_processing.sql', '20261108184837_versioned_content.sql']) {
      await query(readFileSync(path.join(__dirname, '../supabase/migrations', migration), 'utf8'));
    }
    await query('UPDATE public.processing_config SET enabled=true');
    await query(`UPDATE public.content_config SET enabled=true,provider='openai',
      model='mock-only-no-model-call',max_requests=1`);
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
    const worker = createProcessing(pool, {
      content: content.handler,
      assets: { retrySafe: true, async run() {
        return { mode: 'mock', avatar_id: 'mock-avatar', voice_id: 'mock-voice', external_tts: false };
      } },
      render: { retrySafe: true, async run({ progress }) {
        if (!progress) return new PendingStep({ mode: 'mock', operation_id: 'mock-render' }, 5);
        assert.equal(progress.operation_id, 'mock-render');
        return { mode: 'mock', external_video_id: 'mock-video', video_url: null, real_video_generated: false };
      } },
    }, schema);
    const steps = [];
    for (let i = 0; i < 3; i++) steps.push(await worker.runOne());
    assert.equal(steps.at(-1).status, 'waiting');
    // Advance only the isolated mock poll clock instead of waiting for a provider.
    await query('UPDATE public.job_processing SET next_attempt_at=clock_timestamp() WHERE job_id=$1', [jobId]);
    steps.push(await worker.runOne());
    assert.equal(steps.at(-1).status, 'succeeded');
    const history = await content.history(jobId);
    const job = (await query('SELECT status,heygen_video_id,ghl_post_id FROM public.jobs WHERE id=$1', [jobId])).rows[0];
    assert.equal(mockCalls, 1);
    assert.equal(history.versions.length, 1);
    assert.equal(job.status, 'ready_for_review');
    assert.equal(job.heygen_video_id, null);
    assert.equal(job.ghl_post_id, null);
    report = { mode: 'MOCK_ONLY', steps, mock_llm_calls: mockCalls,
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
