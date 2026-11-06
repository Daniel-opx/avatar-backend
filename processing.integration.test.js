require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { createProcessing, StepError, PendingStep, backoff } = require('./services/processing');
const pool = require('./db/pool');

test('durable processing against isolated PostgreSQL tables', {
  skip: process.env.RUN_DB_TESTS !== '1', timeout: 120000,
}, async t => {
  const schema = `step15_test_${randomUUID().replaceAll('-', '')}`;
  const sql = (query, values) => pool.query(query.replaceAll('public.', `${schema}.`), values);
  let job;
  const safe = run => ({ retrySafe: true, run });
  const service = handlers => createProcessing(pool, handlers, schema);
  const reset = async () => {
    await sql('TRUNCATE public.jobs CASCADE');
    job = (await sql("INSERT INTO public.jobs(topic) VALUES('isolated Step 15 test') RETURNING id")).rows[0].id;
    await sql('UPDATE public.processing_config SET enabled=true');
    return job;
  };
  const state = async () => (await sql('SELECT * FROM public.job_processing WHERE job_id=$1', [job])).rows[0];
  const due = () => sql("UPDATE public.job_processing SET next_attempt_at=now()-interval '1 second'");
  const expire = () => sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE state='running'");
  try {
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    const migration = readFileSync('supabase/migrations/20261106073647_durable_processing.sql', 'utf8');
    await sql(migration);
    await t.test('new jobs enroll atomically; disabled engine performs no work', async () => {
      await reset();
      await sql('UPDATE public.processing_config SET enabled=false');
      const s = service({ content: safe(() => { throw new Error('must not execute'); }) });
      assert.equal((await s.runOne()).status, 'disabled');
      assert.equal((await state()).attempts, 0);
      await assert.rejects(sql('INSERT INTO public.job_processing(job_id) VALUES($1)', [job]), { code: '23505' });
      await sql('UPDATE public.processing_config SET enabled=true');
      assert.equal((await service({}).runOne()).status, 'unconfigured');
      assert.equal((await state()).attempts, 0);
    });
    await t.test('overlapping workers execute each stage once and persist review checkpoints', async () => {
      await reset();
      const keys = [];
      const handler = safe(async ({ operationKey }) => { keys.push(operationKey); return { test: true }; });
      const s = service({ content: handler, assets: handler, render: handler });
      for (let i = 0; i < 3; i++) await Promise.all(Array.from({ length: 8 }, () => s.runOne()));
      assert.equal((await state()).state, 'succeeded');
      assert.equal(keys.length, 3);
      assert.equal(new Set(keys).size, 3);
      const history = await s.history(job);
      assert.equal(history.checkpoints.length, 3);
      assert.equal(history.attempts.filter(a => a.outcome === 'succeeded').length, 3);
      assert.equal((await sql('SELECT status FROM public.jobs WHERE id=$1', [job])).rows[0].status, 'ready_for_review');
      assert.equal((await s.runOne()).status, 'idle');
    });
    await t.test('transient retries back off and stop at maximum; manual retry retains audit', async () => {
      await reset();
      const s = service({ content: safe(() => { throw new StepError('RATE_LIMIT', { transient: true }); }) });
      for (let i=1; i<=3; i++) {
        const result = await s.runOne();
        assert.equal(result.status, i<3 ? 'retry_wait' : 'failed');
        if (i<3) {
          assert.equal((await s.runOne()).status, 'idle');
          const row = await state();
          const seconds = (row.next_attempt_at - row.updated_at) / 1000;
          assert.ok(seconds >= backoff(i)-1 && seconds <= backoff(i)+1);
          await due();
        }
      }
      assert.equal((await s.control(job, 'retry')).status, 'queued');
      assert.equal((await s.history(job)).attempts.length, 3);
      assert.equal((await s.history(job)).events.at(-1).event, 'retry');
    });
    await t.test('permanent failure does not automatically retry', async () => {
      await reset();
      const s = service({ content: safe(() => { throw new StepError('INVALID_CONTENT'); }) });
      assert.equal((await s.runOne()).status, 'failed');
      await due();
      assert.equal((await s.runOne()).status, 'idle');
    });
    await t.test('long external work saves a submission checkpoint and resumes by polling after restart', async () => {
      await reset();
      let submitted = 0;
      const handler = safe(({ progress }) => {
        if (!progress) { submitted++; return new PendingStep({ externalId: 'mock-operation' }, 5); }
        assert.equal(progress.externalId, 'mock-operation');
        return { video: 'mock-result' };
      });
      assert.equal((await service({ content: handler }).runOne()).status, 'waiting');
      assert.equal((await state()).attempts, 0);
      assert.equal((await service({ content: handler }).runOne()).status, 'idle');
      await due();
      const restarted = service({ content: handler });
      assert.equal((await restarted.runOne()).status, 'advanced');
      assert.equal(submitted, 1);
      assert.equal((await restarted.history(job)).checkpoints[0].completed, true);
    });
    await t.test('timed out unsafe requests abort and require reconciliation', async () => {
      await reset();
      let aborted = false;
      const s = service({ content: { run: ({ signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
      }) } });
      assert.equal((await s.runOne()).status, 'needs_reconciliation');
      assert.equal(aborted, true);
      assert.equal((await state()).last_error, 'STEP_TIMEOUT');
    });
    await t.test('restart recovers safe expired lease; old worker cannot overwrite it', async () => {
      await reset();
      const handlers = { content: safe(() => ({ ok: true })) };
      const first = service(handlers);
      const old = await first.claim();
      await expire();
      const restarted = service(handlers);
      assert.equal((await restarted.runOne()).status, 'idle');
      assert.equal((await state()).state, 'retry_wait');
      await due();
      const newClaim = await restarted.claim();
      assert.notEqual(old.row.lease_token, newClaim.row.lease_token);
      assert.equal((await first.finish(old.row, { stale: true })).status, 'stale');
      assert.equal((await restarted.finish(newClaim.row, { fresh: true })).status, 'advanced');
      assert.equal((await restarted.history(job)).attempts[0].error_code, 'LEASE_EXPIRED');
    });
    await t.test('uncertain external operation is quarantined after restart and cannot be manually retried', async () => {
      await reset();
      const s = service({ content: { run: () => ({}) } });
      await s.claim();
      await expire();
      await service({}).runOne();
      assert.equal((await state()).state, 'needs_reconciliation');
      assert.equal((await s.control(job,'retry')).status, 'conflict');
      assert.equal((await s.control(job,'cancel')).status, 'conflict');
    });
    await t.test('unexpected provider errors are sanitized and require reconciliation', async () => {
      await reset();
      const s = service({ content: { run: () => { throw new Error('secret provider response'); } } });
      assert.equal((await s.runOne()).status, 'needs_reconciliation');
      assert.equal((await state()).last_error, 'STEP_FAILED');
      assert.ok(!JSON.stringify(await s.history(job)).includes('secret provider'));
    });
    await t.test('cancellation is audited, prevents work, and refuses running jobs', async () => {
      await reset();
      const s = service({ content: safe(() => ({})) });
      assert.equal((await s.control(job,'cancel')).status, 'cancelled');
      assert.equal((await s.runOne()).status, 'idle');
      assert.equal((await s.history(job)).events.at(-1).event, 'cancel');
      await reset();
      await s.claim();
      assert.equal((await s.control(job,'cancel')).status, 'conflict');
    });
    await t.test('checkpoint and advancement roll back together on database failure', async () => {
      await reset();
      const s = service({ content: safe(() => ({})) });
      const c = await s.claim();
      await sql("ALTER TABLE public.job_processing ADD CONSTRAINT injected CHECK (stage='content')");
      await assert.rejects(s.finish(c.row, { saved: false }), { code: '23514' });
      assert.equal((await s.history(job)).checkpoints.length, 0);
      assert.equal((await state()).state, 'running');
      await sql('ALTER TABLE public.job_processing DROP CONSTRAINT injected');
      assert.equal((await s.finish(c.row, { saved: true })).status, 'advanced');
    });
    await t.test('lost commit acknowledgement preserves the claim and committed checkpoint', async () => {
      await reset();
      let loseAck = true;
      const unreliable = {
        query: pool.query.bind(pool),
        async connect() {
          const c = await pool.connect();
          return {
            async query(text, values) {
              const result = await c.query(text, values);
              if (text === 'COMMIT' && loseAck) {
                loseAck = false;
                throw Object.assign(new Error('injected acknowledgement loss'), { code: 'ECONNRESET' });
              }
              return result;
            },
            release: error => c.release(error),
          };
        },
      };
      const handlers = { content: safe(() => ({ ok: true })) };
      const flaky = createProcessing(unreliable, handlers, schema);
      await assert.rejects(flaky.claim(), { code: 'ECONNRESET' });
      assert.equal((await state()).state, 'running');
      const restarted = service(handlers);
      assert.equal((await restarted.claim()).status, 'idle');
      await expire();
      await restarted.runOne();
      await due();
      const claimed = await restarted.claim();
      loseAck = true;
      await assert.rejects(flaky.finish(claimed.row, { committed: true }), { code: 'ECONNRESET' });
      assert.equal((await state()).stage, 'assets');
      assert.equal((await restarted.history(job)).checkpoints.length, 1);
      assert.equal((await restarted.runOne()).status, 'idle');
    });
    await t.test('new tables deny direct anon/authenticated access and have RLS', async () => {
      const tables = await pool.query(`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 AND c.relkind='r' AND c.relname<>'jobs'`, [schema]);
      assert.equal(tables.rows.length, 5);
      assert.ok(tables.rows.every(r => r.relrowsecurity));
      const grants = await pool.query(`SELECT has_table_privilege('anon',$1,'SELECT') AS anon,
        has_table_privilege('authenticated',$1,'SELECT') AS authenticated`, [`${schema}.job_checkpoints`]);
      assert.deepEqual(grants.rows[0], { anon: false, authenticated: false });
    });
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
