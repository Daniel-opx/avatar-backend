const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./app');
const { validateEnvironment, databaseOptions } = require('./config');

test('startup validates configuration without echoing credentials', () => {
  assert.throws(() => validateEnvironment({}), /DATABASE_URL is required/);
  assert.throws(() => validateEnvironment({ DATABASE_URL: 'secret-invalid-value' }), /PostgreSQL URL/);
  const env = { DATABASE_URL: 'postgres://user:password@localhost/db', API_KEY: 'x'.repeat(32) };
  assert.deepEqual(validateEnvironment(env), { port: 3000 });
  assert.throws(() => validateEnvironment({ ...env, PORT: '-1' }), /PORT/);
  assert.throws(() => validateEnvironment({ ...env, NODE_ENV: 'production', API_KEY: 'short' }), /32 characters/);
  const options = databaseOptions({ ...env, DATABASE_URL: env.DATABASE_URL + '?sslmode=no-verify' });
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.equal(new URL(options.connectionString).searchParams.has('sslmode'), false);
  const cert = new (require('node:crypto').X509Certificate)(options.ssl.ca);
  assert.equal(cert.ca, true);
  assert.equal(cert.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.equal(databaseOptions({ ...env, DATABASE_CA_CERT: 'override\\ncertificate' }).ssl.ca, 'override\ncertificate');
});

test('HTTP authentication, body limits, readiness, logs and rate limits', async () => {
  const previousKey = process.env.API_KEY;
  process.env.API_KEY = 'test-only-key';
  const logs = [];
  let unavailable = false;
  const app = createApp({ logger: line => logs.push(line), render: false, rateLimitMax: 10,
    pool: { async query() { if (unavailable) throw new Error('secret database details'); return { rows: [] }; } } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const health = await fetch(url + '/health');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('x-powered-by'), null);
    assert.ok(health.headers.get('content-security-policy'));
    assert.ok(health.headers.get('x-request-id'));
    for (const path of ['/jobs', '/internal/run-scheduler']) {
      assert.equal((await fetch(url + path, { method: 'POST' })).status, 401);
    }
    const headers = { 'x-api-key': 'test-only-key', 'content-type': 'application/json' };
    assert.equal((await fetch(url + '/jobs', { method: 'POST', headers, body: '{}' })).status, 400);
    assert.equal((await fetch(url + '/jobs', { method: 'POST', headers, body: '{' })).status, 400);
    assert.equal((await fetch(url + '/jobs', { method: 'POST', headers, body: JSON.stringify({ topic: 'x'.repeat(40000) }) })).status, 413);
    assert.equal((await fetch(url + '/ready')).status, 200);
    unavailable = true;
    const ready = await fetch(url + '/ready');
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: 'unavailable' });
    for (let i = 0; i < 4; i++) await fetch(url + '/missing');
    assert.equal((await fetch(url + '/jobs')).status, 429);
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.ok(!logs.join('\n').includes('test-only-key'));
    assert.ok(!logs.join('\n').includes('secret database details'));
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previousKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previousKey;
  }
});
