const { test } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('./db/pool');
const router = require('./routes/internal');
const handler = router.stack.find(layer => layer.route).route.stack[0].handle;

async function invoke(overrides = {}, duplicate = false, failUpdate = false) {
  const config = { id: 1, enabled: true, frequency: 'daily', timezone: 'Asia/Jerusalem',
    next_run_at: '2026-01-01T07:00:00Z', default_topic: 'Test', interval_count: 3,
    local_run_time: '09:00:00', ...overrides };
  const queries = [];
  let released = false;
  const original = pool.connect;
  pool.connect = async () => ({
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('FOR UPDATE')) return { rowCount: 1, rows: [config] };
      if (sql.includes('clock_timestamp')) return { rows: [{ now: new Date('2026-01-02T10:00:00Z') }] };
      if (sql.includes('INSERT INTO')) return { rowCount: duplicate ? 0 : 1, rows: [{ id: 'test-job' }] };
      if (sql.includes('UPDATE') && failUpdate) throw new Error('simulated update failure');
      return { rows: [{ next_run_at: '2026-01-04T07:00:00Z' }] };
    },
    release() { released = true; }
  });
  const response = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  try { await handler({}, response); } finally { pool.connect = original; }
  assert.equal(released, true);
  return { response, queries };
}

test('daily interval advances the consumed slot atomically', async () => {
  const { response, queries } = await invoke();
  assert.equal(response.code, 201);
  assert.deepEqual(queries.find(q => q.sql.includes('RETURNING next_run_at')).params, [1, 3]);
  assert.ok(queries.some(q => q.sql.includes('FOR UPDATE')));
  assert.equal(queries.at(-1).sql, 'COMMIT');
});

test('weekly intervals are converted to calendar days', async () => {
  const { queries } = await invoke({ frequency: 'weekly', interval_count: 2 });
  assert.deepEqual(queries.find(q => q.sql.includes('RETURNING next_run_at')).params, [1, 14]);
});

test('legacy NULL frequency and once both disable after consuming a slot', async () => {
  for (const frequency of [null, 'once']) {
    const { response, queries } = await invoke({ frequency });
    assert.equal(response.body.next_run_at, null);
    assert.ok(queries.some(q => q.sql.includes('enabled = FALSE')));
  }
});

test('disabled, future, and invalid configurations never insert', async () => {
  for (const overrides of [{ enabled: false }, { next_run_at: '2099-01-01T00:00:00Z' },
    { frequency: 'unsupported' }, { interval_count: 0 }, { local_run_time: null }]) {
    const { queries } = await invoke(overrides);
    assert.ok(!queries.some(q => q.sql.includes('INSERT INTO')));
  }
});

test('existing slot advances without creating a duplicate', async () => {
  const { response, queries } = await invoke({}, true);
  assert.equal(response.body.status, 'already_processed');
  assert.ok(queries.some(q => q.sql.includes('RETURNING next_run_at')));
});

test('advance failure rolls back the job insert', async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { response, queries } = await invoke({}, false, true);
    assert.equal(response.code, 500);
    assert.equal(queries.at(-1).sql, 'ROLLBACK');
    assert.ok(!queries.some(q => q.sql === 'COMMIT'));
  } finally { console.error = originalError; }
});

test('rollback failure discards the connection and does not expose error contents', async () => {
  const originalConnect = pool.connect;
  const originalError = console.error;
  const failure = Object.assign(new Error('sensitive driver detail'), { code: 'ECONNRESET' });
  let discarded;
  const logs = [];
  pool.connect = async () => ({ async query() { throw failure; }, release(error) { discarded = error; } });
  console.error = (...args) => logs.push(args);
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  try {
    await handler({}, response);
    assert.equal(response.code, 500);
    assert.equal(discarded, failure);
    assert.ok(!JSON.stringify([logs, response.body]).includes('sensitive driver detail'));
  } finally { pool.connect = originalConnect; console.error = originalError; }
});
