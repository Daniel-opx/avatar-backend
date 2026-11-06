const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trigger } = require('./scripts/trigger-scheduler');
const key = 'test-only-placeholder-'.repeat(2);
const reply = (status, payload) => ({ status, async json() { return payload; }, body: { async cancel() {} } });

test('health mode sends no secret and validates TLS through the normal HTTPS client', async () => {
  const result = await trigger({ apiKey: key, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://avatar-backend-65ep.onrender.com/health');
    assert.deepEqual(options.headers, {});
    assert.equal(options.redirect, 'error');
    return reply(200, { status: 'ok' });
  } });
  assert.equal(result.status, 'ok');
});

test('scheduler request uses private header and excludes response contents', async () => {
  const result = await trigger({ mode: 'scheduler', apiKey: key, fetchImpl: async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['x-api-key'], key);
    assert.equal(options.redirect, 'error');
    assert.ok(!url.includes(key));
    return reply(200, { status: 'disabled', configuration: { default_topic: 'private business data' } });
  } });
  assert.equal(result.status, 'disabled');
  assert.ok(!JSON.stringify(result).includes('private business data'));
});

test('cold-start/transient errors use bounded retries without raw exception details', async () => {
  const delays = [];
  let calls = 0;
  const result = await trigger({ sleep: async ms => delays.push(ms), fetchImpl: async () => {
    calls++;
    if (calls === 1) throw new Error(key);
    if (calls === 2) return reply(503);
    return reply(200, { status: 'ok' });
  } });
  assert.equal(result.attempts, 3);
  assert.deepEqual(delays, [5000, 10000]);
});

test('authentication and configuration errors fail immediately', async () => {
  for (const status of [401, 403, 409]) {
    let calls = 0;
    await assert.rejects(trigger({ fetchImpl: async () => { calls++; return reply(status); } }), new RegExp(`HTTP ${status}`));
    assert.equal(calls, 1);
  }
});

test('transport/429/5xx retries stop and never echo secrets', async () => {
  for (const status of [null, 429, 500]) {
    let calls = 0;
    await assert.rejects(trigger({ sleep: async () => {}, fetchImpl: async () => {
      calls++;
      if (status === null) throw new Error(key);
      return reply(status);
    } }), error => !error.message.includes(key) && /bounded retries/.test(error.message));
    assert.equal(calls, 3);
  }
});

test('malformed responses and unexpectedly active schedules fail closed', async () => {
  await assert.rejects(trigger({ fetchImpl: async () => ({ status: 200, async json() { throw new Error(key); } }) }), /invalid JSON/);
  await assert.rejects(trigger({ fetchImpl: async () => reply(200, { status: 'unknown' }) }), /unexpected application status/);
  await assert.rejects(trigger({ mode: 'scheduler', apiKey: key,
    fetchImpl: async () => reply(201, { status: 'created' }) }), /Expected disabled/);
  await assert.rejects(trigger({ mode: 'scheduler' }), /configured privately/);
});
