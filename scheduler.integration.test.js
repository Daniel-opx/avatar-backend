// Opt in: RUN_DB_TESTS=1. All writes target a uniquely named disposable schema.
require('dotenv').config({ quiet: true });
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const express = require('express');
const pool = require('./db/pool');
const router = require('./routes/internal');
const auth = require('./middleware/apiKeyAuth');

test('scheduler reliability against isolated PostgreSQL tables', {
  skip: process.env.RUN_DB_TESTS !== '1', timeout: 120000
}, async t => {
  const schema = `step12_test_${randomUUID().replaceAll('-', '')}`;
  const originalConnect = pool.connect.bind(pool);
  const admin = await originalConnect();
  const previousKey = process.env.API_KEY;
  const testKey = randomUUID();
  process.env.API_KEY = testKey;
  let server;
  let fault;
  const now = new Date('2026-12-01T10:00:00Z');
  const originalLog = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    // Copy structure, constraints, and unique indexes; never copy business rows.
    await admin.query(`CREATE SCHEMA ${schema}`);
    await admin.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    await admin.query(`CREATE TABLE ${schema}.schedule_config (LIKE public.schedule_config INCLUDING ALL)`);
    await t.test('Step 11 migration can be safely repeated on isolated tables', async () => {
      const sql = require('node:fs').readFileSync('migrations/011_recurring_schedules.sql', 'utf8')
        .replaceAll('public.schedule_config', `${schema}.schedule_config`);
      await admin.query(sql);
      await admin.query(sql);
    });
    pool.connect = async () => {
      if (fault === 'connect') { fault = null; throw Object.assign(new Error('injected'), { code: 'ECONNRESET' }); }
      const client = await originalConnect();
      return {
        async query(sql, params) {
          if (sql.includes('clock_timestamp()')) return { rows: [{ now }] };
          const match = (fault === 'insert' && sql.includes('INSERT INTO')) ||
            (fault === 'update' && sql.includes('UPDATE public.schedule_config')) ||
            (fault === 'begin' && sql === 'BEGIN');
          if (match) { fault = null; return client.query('SELECT 1 / 0'); }
          if (fault === 'commit_before' && sql === 'COMMIT') {
            fault = null;
            await client.query('ROLLBACK');
            throw Object.assign(new Error('injected'), { code: 'ECONNRESET' });
          }
          const result = await client.query(sql.replaceAll('public.', `${schema}.`), params);
          if (fault === 'commit_after' && sql === 'COMMIT') {
            fault = null;
            throw Object.assign(new Error('commit acknowledgement lost'), { code: 'ECONNRESET' });
          }
          return result;
        },
        release(error) { client.release(error); }
      };
    };
    const app = express();
    app.use('/internal', auth, router);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/internal/run-scheduler`;
    async function call(key = testKey) {
      const r = await fetch(url, { method: 'POST', headers: { 'x-api-key': key } });
      return { status: r.status, body: await r.json() };
    }
    async function reset({ frequency = 'daily', slot = '2026-11-30T07:00:00Z', time = '09:00', interval = 1 } = {}) {
      await admin.query(`TRUNCATE ${schema}.jobs, ${schema}.schedule_config`);
      await admin.query(`INSERT INTO ${schema}.schedule_config
        (id, enabled, frequency, timezone, next_run_at, default_topic, interval_count, local_run_time)
        VALUES (1, TRUE, $1, 'Asia/Jerusalem', $2, 'Isolated Step 12 test', $3, $4)`,
      [frequency, slot, interval, time]);
    }
    async function state() {
      return {
        count: Number((await admin.query(`SELECT COUNT(*) FROM ${schema}.jobs`)).rows[0].count),
        config: (await admin.query(`SELECT * FROM ${schema}.schedule_config`)).rows[0]
      };
    }
    await t.test('authentication rejects a wrong key', async () => {
      assert.equal((await call('invalid')).status, 401);
    });
    for (const failure of ['connect', 'begin', 'insert', 'update', 'commit_before']) {
      await t.test(`${failure} failure leaves no partial state and retry recovers`, async () => {
        await reset();
        const before = await state();
        fault = failure;
        const response = await call();
        assert.equal(response.status, 500);
        assert.equal(response.body.code, 'SCHEDULER_FAILED');
        const after = await state();
        assert.equal(after.count, 0);
        assert.deepEqual(after.config, before.config);
        assert.equal((await call()).status, 201);
        assert.equal((await state()).count, 1);
      });
    }
    await t.test('lost COMMIT acknowledgement is safe to retry', async () => {
      await reset({ slot: '2026-12-01T07:00:00Z' });
      fault = 'commit_after';
      assert.equal((await call()).status, 500);
      assert.equal((await state()).count, 1);
      assert.equal((await call()).body.status, 'not_due');
      assert.equal((await state()).count, 1);
    });
    await t.test('concurrent catch-up creates one job per overdue slot', async () => {
      await reset({ slot: '2026-11-28T07:00:00Z' });
      const results = await Promise.all(Array.from({ length: 12 }, () => call()));
      assert.equal(results.filter(r => r.status === 201).length, 4);
      assert.equal(results.filter(r => r.body.status === 'not_due').length, 8);
      const duplicates = await admin.query(`SELECT scheduler_slot_at FROM ${schema}.jobs GROUP BY scheduler_slot_at HAVING COUNT(*) > 1`);
      assert.equal(duplicates.rowCount, 0);
      assert.equal((await state()).config.next_run_at.toISOString(), '2026-12-02T07:00:00.000Z');
    });
    await t.test('preexisting slot is consumed without another insert', async () => {
      await reset();
      await admin.query(`INSERT INTO ${schema}.jobs (topic,scheduler_slot_at) VALUES ('existing',$1)`, ['2026-11-30T07:00:00Z']);
      assert.equal((await call()).body.status, 'already_processed');
      assert.equal((await state()).count, 1);
      assert.equal((await state()).config.next_run_at.toISOString(), '2026-12-01T07:00:00.000Z');
    });
    await t.test('one-time failure rolls back; concurrent retries create exactly one job', async () => {
      for (const frequency of ['once', null]) {
        await reset({ frequency });
        fault = 'update';
        assert.equal((await call()).status, 500);
        assert.equal((await state()).count, 0);
        assert.equal((await state()).config.enabled, true);
        const results = await Promise.all(Array.from({ length: 6 }, () => call()));
        assert.equal(results.filter(r => r.status === 201).length, 1);
        const after = await state();
        assert.equal(after.count, 1);
        assert.equal(after.config.enabled, false);
        assert.equal(after.config.next_run_at, null);
      }
    });
    await t.test('due boundary is inclusive; future and disabled do no work', async () => {
      await reset({ slot: now.toISOString() });
      assert.equal((await call()).status, 201);
      await reset({ slot: '2026-12-01T10:00:01Z' });
      assert.equal((await call()).body.status, 'not_due');
      await admin.query(`UPDATE ${schema}.schedule_config SET enabled=FALSE`);
      assert.equal((await call()).body.status, 'disabled');
      assert.equal((await state()).count, 0);
    });
    const boundaries = [
      ['spring', '2026-03-26T07:00:00Z', '09:00', 1, 'daily', '2026-03-27T06:00:00.000Z'],
      ['autumn', '2026-10-24T06:00:00Z', '09:00', 1, 'daily', '2026-10-25T07:00:00.000Z'],
      ['spring gap', '2026-03-26T00:30:00Z', '02:30', 1, 'daily', '2026-03-27T00:30:00.000Z'],
      ['gap recovery', '2026-03-27T00:30:00Z', '02:30', 1, 'daily', '2026-03-27T23:30:00.000Z'],
      ['autumn repeated hour', '2026-10-23T22:30:00Z', '01:30', 1, 'daily', '2026-10-24T23:30:00.000Z'],
      ['weekly interval', '2026-03-20T07:00:00Z', '09:00', 2, 'weekly', '2026-04-03T06:00:00.000Z'],
      ['year boundary', '2025-12-31T07:00:00Z', '09:00', 1, 'daily', '2026-01-01T07:00:00.000Z']
    ];
    for (const [name, slot, time, interval, frequency, expected] of boundaries) {
      await t.test(`Jerusalem ${name}`, async () => {
        await reset({ slot, time, interval, frequency });
        assert.equal((await call()).status, 201);
        assert.equal((await state()).config.next_run_at.toISOString(), expected);
      });
    }
    assert.ok(errors.length > 0, 'failure injection exercised error reporting');
  } finally {
    console.error = originalLog;
    if (server) await new Promise(resolve => server.close(resolve));
    pool.connect = originalConnect;
    if (previousKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previousKey;
    // schema is a generated identifier, never a business schema or user input.
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { admin.release(); await pool.end(); }
  }
});
