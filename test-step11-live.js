// Explicit, manual integration test. Creates TWO labelled test jobs.
// Run only with the external Cron disconnected and the local server running.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const pool = require('./db/pool');
let stage = 'checking API_KEY';

async function main() {
  let saved;
  const topic = `Step 11 integration test ${Date.now()}`;
  const call = async () => {
    const response = await fetch('http://localhost:3000/internal/run-scheduler', {
      method: 'POST', headers: { 'x-api-key': process.env.API_KEY }
    });
    const body = await response.json();
    assert.ok(response.ok, `Scheduler returned HTTP ${response.status}; restart the local server and check its terminal output`);
    return body;
  };
  try {
    assert.ok(process.env.API_KEY, 'API_KEY must be configured');
    stage = 'checking that database scheduling is disabled';
    const current = (await pool.query('SELECT * FROM public.schedule_config WHERE id = 1')).rows[0];
    assert.equal(current?.enabled, false, 'Run only while scheduling is disabled');
    // Check server/auth before changing any configuration.
    stage = 'checking the disabled endpoint response';
    assert.equal((await call()).status, 'disabled', 'Expected the Step 11 endpoint to return disabled');
    saved = current;
    stage = 'configuring the temporary recurring test';
    await pool.query(
      `UPDATE public.schedule_config SET enabled = TRUE, frequency = 'daily',
       interval_count = 2, local_run_time = '09:00',
       next_run_at = clock_timestamp() - interval '1 minute', default_topic = $1
       WHERE id = 1`, [topic]
    );
    stage = 'checking eight overlapping scheduler requests';
    // Drain every request before restoring configuration, even on failure.
    const settled = await Promise.allSettled(Array.from({ length: 8 }, call));
    const failed = settled.find(result => result.status === 'rejected');
    if (failed) throw failed.reason;
    const results = settled.map(result => result.value);
    console.log('Concurrent response statuses:', results.map(result => result.status).join(', '));
    assert.equal(results.filter(r => r.status === 'created').length, 1, 'Expected exactly one created response');
    assert.equal(results.filter(r => r.status === 'not_due').length, 7, 'Expected seven not_due responses');
    stage = 'checking retry and recurring next_run_at';
    assert.equal((await call()).status, 'not_due');
    const recurring = (await pool.query('SELECT * FROM public.schedule_config WHERE id = 1')).rows[0];
    assert.equal(recurring.enabled, true);
    assert.ok(new Date(recurring.next_run_at) > new Date());
    stage = 'checking one-time scheduling';
    await pool.query(
      `UPDATE public.schedule_config SET frequency = 'once',
       next_run_at = clock_timestamp() - interval '2 minutes' WHERE id = 1`
    );
    assert.equal((await call()).status, 'created');
    assert.equal((await call()).status, 'disabled');
    const once = (await pool.query('SELECT enabled, next_run_at FROM public.schedule_config WHERE id = 1')).rows[0];
    assert.equal(once.enabled, false);
    assert.equal(once.next_run_at, null);
    stage = 'checking the two retained test jobs';
    const jobs = await pool.query('SELECT id FROM public.jobs WHERE topic = $1', [topic]);
    assert.equal(jobs.rowCount, 2);
    console.log('PASS: overlapping requests, retry, recurring advancement, and one-time behavior');
    console.log(`Two test jobs retained with topic: ${topic}`);
  } finally {
    try {
      if (saved) {
        const previousStage = stage;
        stage = 'restoring original disabled configuration';
        await pool.query(
          `UPDATE public.schedule_config SET enabled = $1, frequency = $2,
           timezone = $3, next_run_at = $4, default_topic = $5,
           interval_count = $6, local_run_time = $7, updated_at = $8 WHERE id = 1`,
          [saved.enabled, saved.frequency, saved.timezone, saved.next_run_at,
            saved.default_topic, saved.interval_count, saved.local_run_time, saved.updated_at]
        );
        console.log('Original disabled configuration restored.');
        stage = previousStage;
      }
    } finally { await pool.end(); }
  }
}

main().catch(error => {
  console.error(`Step 11 integration test failed during: ${stage}`);
  console.error('Error code:', error.code || error.name);
  if (error.code === 'ERR_ASSERTION') {
    console.error(error.message);
    console.error('Expected:', error.expected, 'Actual:', error.actual);
  }
  process.exitCode = 1;
});
