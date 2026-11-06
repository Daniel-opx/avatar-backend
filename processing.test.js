const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const auth = require('./middleware/apiKeyAuth');
const processingRouter = require('./routes/processing');
const { backoff } = require('./services/processing');

test('processing endpoints require owner key, validate IDs and redact failures', async () => {
  const saved = { API_KEY: process.env.API_KEY, SCHEDULER_API_KEY: process.env.SCHEDULER_API_KEY };
  process.env.API_KEY = 'test-owner';
  process.env.SCHEDULER_API_KEY = 'test-scheduler';
  let calls = 0;
  const app = express();
  app.use('/internal/processing', auth, express.json(), processingRouter({
    runOne: async () => { calls++; return { status: 'disabled' }; },
    history: async () => { throw new Error('private credential'); },
  }));
  const server = app.listen(0, '127.0.0.1');
  const errorLog = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}/internal/processing`;
    for (const key of ['', 'test-scheduler']) {
      assert.equal((await fetch(`${url}/run`, { method: 'POST', headers: { 'x-api-key': key } })).status, 401);
    }
    assert.equal(calls, 0);
    const headers = { 'x-api-key': 'test-owner' };
    assert.equal((await fetch(`${url}/run`, { method: 'POST', headers })).status, 200);
    assert.equal(calls, 1);
    assert.equal((await fetch(`${url}/bad-id/history`, { headers })).status, 400);
    const failure = await fetch(`${url}/00000000-0000-0000-0000-000000000000/history`, { headers });
    assert.equal(failure.status, 500);
    assert.ok(!(await failure.text()).includes('private credential'));
    assert.ok(!JSON.stringify(logs).includes('private credential'));
  } finally {
    console.error = errorLog;
    for (const [key,value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise(resolve => server.close(resolve));
  }
});
test('retry backoff is bounded', () => {
  assert.deepEqual([1,2,3,20].map(backoff), [30,60,120,3600]);
});
