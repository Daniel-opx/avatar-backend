// External trigger only: PostgreSQL owns every business recurrence decision.
const BASE_URL = 'https://avatar-backend-65ep.onrender.com';
const schedulerStatuses = new Set(['disabled', 'not_due', 'created', 'already_processed']);

async function trigger({ mode = 'health', apiKey, expectDisabled = true,
  fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxAttempts = 3, timeoutMs = 120000 } = {}) {
  if (!['health', 'scheduler'].includes(mode)) throw new Error('Unsupported trigger mode');
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('Invalid retry limit');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid request timeout');
  if (mode === 'scheduler' && (typeof apiKey !== 'string' || apiKey.trim().length < 32)) {
    throw new Error('SCHEDULER_API_KEY must be configured privately (at least 32 characters)');
  }
  const start = Date.now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetchImpl(BASE_URL + (mode === 'health' ? '/health' : '/internal/run-scheduler'), {
        method: mode === 'health' ? 'GET' : 'POST',
        headers: mode === 'health' ? {} : { 'x-api-key': apiKey.trim() },
        redirect: 'error', signal: AbortSignal.timeout(timeoutMs)
      });
    } catch {
      // Do not log raw provider exceptions: they can contain request headers.
      if (attempt === maxAttempts) throw new Error('Trigger transport failed after bounded retries');
      await sleep(attempt * 5000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      await response.body?.cancel();
      if (attempt === maxAttempts) throw new Error(`Trigger failed with HTTP ${response.status} after bounded retries`);
      await sleep(attempt * 5000);
      continue;
    }
    if (response.status !== 200 && response.status !== 201) {
      await response.body?.cancel();
      throw new Error(`Trigger rejected with HTTP ${response.status}; check configuration`);
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error('Trigger returned an invalid JSON response'); }
    const valid = mode === 'health' ? payload?.status === 'ok' : schedulerStatuses.has(payload?.status);
    if (!valid) throw new Error('Trigger returned an unexpected application status');
    if (mode === 'scheduler' && expectDisabled && payload.status !== 'disabled') {
      throw new Error('Expected disabled scheduling; review the database configuration before further testing');
    }
    // Never return/log job content, schedule configuration, request headers or keys.
    return { mode, status: payload.status, httpStatus: response.status, attempts: attempt, elapsedMs: Date.now() - start };
  }
}

if (require.main === module) {
  trigger({ mode: process.env.SCHEDULER_MODE || 'health', apiKey: process.env.SCHEDULER_API_KEY })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { trigger };
