const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('./middleware/apiKeyAuth');
const { validateEnvironment } = require('./config');

test('scheduler-only key cannot read/create jobs or access other internal paths', () => {
  const previous = { API_KEY: process.env.API_KEY, SCHEDULER_API_KEY: process.env.SCHEDULER_API_KEY };
  const admin = 'owner-test-key-'.repeat(3);
  const scheduler = 'scheduler-test-key-'.repeat(3);
  process.env.API_KEY = admin;
  process.env.SCHEDULER_API_KEY = scheduler;
  function invoke(middleware, key, path, method) {
    let passed = false;
    const res = { status(code) { this.code = code; return this; }, json() {} };
    middleware({ path, method, get() { return key; } }, res, () => { passed = true; });
    return { passed, code: res.code };
  }
  try {
    for (const path of ['/run-scheduler', '/run-scheduler/']) {
      assert.equal(invoke(auth.scheduler, scheduler, path, 'POST').passed, true);
    }
    for (const [path, method] of [['/run-scheduler', 'GET'], ['/other', 'POST'], ['/run-scheduler/extra', 'POST']]) {
      assert.equal(invoke(auth.scheduler, scheduler, path, method).code, 401);
    }
    for (const method of ['GET', 'POST']) assert.equal(invoke(auth, scheduler, '/', method).code, 401);
    assert.equal(invoke(auth.scheduler, admin, '/run-scheduler', 'POST').passed, true);
    assert.equal(invoke(auth, admin, '/', 'GET').passed, true);
    assert.equal(invoke(auth.scheduler, 'wrong', '/run-scheduler', 'POST').code, 401);
    delete process.env.SCHEDULER_API_KEY;
    assert.equal(invoke(auth.scheduler, scheduler, '/run-scheduler', 'POST').code, 401);
    assert.equal(invoke(auth.scheduler, admin, '/run-scheduler', 'POST').passed, true);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('scheduler key is optional, separate and validated without echoing credentials', () => {
  const env = { DATABASE_URL: 'postgres://user:password@localhost/db', API_KEY: 'a'.repeat(32) };
  assert.doesNotThrow(() => validateEnvironment(env));
  assert.doesNotThrow(() => validateEnvironment({ ...env, SCHEDULER_API_KEY: 's'.repeat(32) }));
  assert.throws(() => validateEnvironment({ ...env, SCHEDULER_API_KEY: env.API_KEY }), /must differ/);
  assert.throws(() => validateEnvironment({ ...env, SCHEDULER_API_KEY: 'short' }), /32 characters/);
});

test('HTTP routing admits scheduler key only to the disabled scheduler POST', async () => {
  const pool = require('./db/pool');
  const { createApp } = require('./app');
  const previous = { API_KEY: process.env.API_KEY, SCHEDULER_API_KEY: process.env.SCHEDULER_API_KEY };
  const originalConnect = pool.connect;
  const owner = 'owner-http-test-key-'.repeat(2);
  const scheduler = 'scheduler-http-test-key-'.repeat(2);
  process.env.API_KEY = owner;
  process.env.SCHEDULER_API_KEY = scheduler;
  let acquired = 0;
  pool.connect = async () => {
    acquired++;
    return { async query(sql) {
      return sql.includes('FOR UPDATE') ? { rowCount: 1, rows: [{ enabled: false }] } : {};
    }, release() {} };
  };
  const server = createApp({ logger() {}, render: false }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [path, method] of [['/jobs', 'GET'], ['/jobs', 'POST'], ['/internal/other', 'POST'], ['/internal/run-scheduler', 'GET']]) {
      const r = await fetch(base + path, { method, headers: { 'x-api-key': scheduler } });
      assert.equal(r.status, 401);
    }
    assert.equal(acquired, 0);
    for (const key of [scheduler, owner]) {
      const r = await fetch(base + '/internal/run-scheduler', { method: 'POST', headers: { 'x-api-key': key } });
      assert.equal(r.status, 200);
      assert.equal((await r.json()).status, 'disabled');
    }
    assert.equal(acquired, 2);
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.connect = originalConnect;
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});
