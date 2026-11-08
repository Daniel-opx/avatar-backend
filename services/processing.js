const { randomUUID } = require('node:crypto');
const STAGES = ['content', 'assets', 'render', 'review'];
const backoff = attempt => Math.min(3600, 30 * 2 ** Math.min(attempt - 1, 10));
class StepError extends Error {
  constructor(code, { transient = false, uncertain = false, reconcile = false } = {}) {
    super('Processing step failed');
    this.code = /^[A-Z_]{1,60}$/.test(code) ? code : 'STEP_FAILED';
    this.transient = transient;
    this.uncertain = uncertain;
    this.reconcile = reconcile;
  }
}
class PendingStep {
  constructor(output, pollAfterSeconds = 30) {
    if (!Number.isInteger(pollAfterSeconds) || pollAfterSeconds < 5 || pollAfterSeconds > 3600) {
      throw new Error('Invalid poll delay');
    }
    this.output = output;
    this.pollAfterSeconds = pollAfterSeconds;
  }
}

function createProcessing(pool, handlers = {}, schema = 'public') {
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) throw new Error('Invalid schema');
  const q = sql => sql.replaceAll('public.', `${schema}.`);
  async function tx(work) {
    const c = await pool.connect();
    let broken;
    const query = (sql, values) => c.query(q(sql), values);
    try {
      await query('BEGIN');
      const result = await work(query);
      await query('COMMIT');
      return result;
    } catch (e) {
      try { await query('ROLLBACK'); } catch (rollback) { broken = rollback; }
      throw e;
    } finally { c.release(broken); }
  }
  async function settle(query, row, state, code) {
    await query(`UPDATE public.job_attempts SET finished_at=clock_timestamp(), outcome=$2,
      error_code=$3 WHERE token=$1 AND outcome='running'`, [row.lease_token, state, code]);
    await query(`UPDATE public.job_processing SET state=$2, last_error=$3,
      lease_token=NULL, lease_until=NULL, updated_at=clock_timestamp(),
      next_attempt_at=clock_timestamp()+($4::integer * interval '1 second') WHERE job_id=$1`,
    [row.job_id, state, code, backoff(row.attempts)]);
  }
  // Called on every enabled invocation, so a new process recovers durable leases.
  async function recover(query) {
    const expired = await query(`SELECT * FROM public.job_processing WHERE state='running'
      AND lease_until <= clock_timestamp() ORDER BY lease_until LIMIT 20 FOR UPDATE SKIP LOCKED`);
    for (const row of expired.rows) {
      const state = !row.retry_safe ? 'needs_reconciliation' :
        row.attempts < row.max_attempts ? 'retry_wait' : 'failed';
      await settle(query, row, state, 'LEASE_EXPIRED');
    }
  }
  async function claim() {
    return tx(async query => {
      // Shared lock allows parallel workers but serializes a configuration change.
      const cfg = await query('SELECT enabled FROM public.processing_config WHERE id=1 FOR SHARE');
      if (!cfg.rows[0]?.enabled) return { status: 'disabled' };
      await recover(query);
      const configured = [];
      for (const stage of STAGES) {
        if (typeof handlers[stage]?.run === 'function' &&
            (!handlers[stage].isAvailable || await handlers[stage].isAvailable(query))) configured.push(stage);
      }
      if (!configured.length) return { status: 'unconfigured' };
      const r = await query(`SELECT p.* FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id
        WHERE p.state IN ('queued','retry_wait') AND p.next_attempt_at<=clock_timestamp()
        AND p.attempts<p.max_attempts AND p.stage=ANY($1::text[])
        AND j.status IN ('draft','rendering')
        ORDER BY p.next_attempt_at,p.job_id LIMIT 1 FOR UPDATE OF p SKIP LOCKED`, [configured]);
      if (!r.rows.length) return { status: 'idle' };
      const row = r.rows[0];
      const token = randomUUID();
      const safe = handlers[row.stage].retrySafe === true;
      const updated = await query(`UPDATE public.job_processing SET state='running',
        attempts=attempts+1, retry_safe=$2, lease_token=$3,
        lease_until=clock_timestamp()+interval '30 seconds', updated_at=clock_timestamp()
        WHERE job_id=$1 RETURNING *`, [row.job_id, safe, token]);
      await query(`INSERT INTO public.job_attempts(token,job_id,stage,attempt) VALUES($1,$2,$3,$4)`,
        [token, row.job_id, row.stage, updated.rows[0].attempts]);
      const progress = await query(`SELECT output FROM public.job_checkpoints
        WHERE job_id=$1 AND stage=$2 AND NOT completed`, [row.job_id, row.stage]);
      return { status: 'claimed', row: updated.rows[0], progress: progress.rows[0]?.output };
    });
  }
  async function finish(row, output, failure) {
    return tx(async query => {
      const current = await query(`SELECT * FROM public.job_processing WHERE job_id=$1
        AND state='running' AND lease_token=$2 AND lease_until>clock_timestamp() FOR UPDATE`,
      [row.job_id, row.lease_token]);
      if (!current.rows.length) return { status: 'stale' };
      if (failure) {
        const state = failure.reconcile || (failure.uncertain && !row.retry_safe) ? 'needs_reconciliation' :
          failure.transient && row.retry_safe && row.attempts < row.max_attempts ? 'retry_wait' : 'failed';
        await settle(query, row, state, failure.code);
        return { status: state };
      }
      const pending = output instanceof PendingStep;
      if (!pending && handlers[row.stage]?.commit) await handlers[row.stage].commit(query,row,output);
      const next = pending ? row.stage : STAGES[STAGES.indexOf(row.stage) + 1];
      const checkpoint = await query(`INSERT INTO public.job_checkpoints AS cp(job_id,stage,output,completed)
        VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(job_id,stage) DO UPDATE
        SET output=EXCLUDED.output, completed=EXCLUDED.completed, completed_at=clock_timestamp()
        WHERE NOT cp.completed RETURNING job_id`,
      [row.job_id, row.stage, JSON.stringify(pending ? output.output : output), !pending]);
      if (!checkpoint.rowCount) throw new StepError('CHECKPOINT_CONFLICT');
      await query(`UPDATE public.job_attempts SET outcome=$2, finished_at=clock_timestamp()
        WHERE token=$1`, [row.lease_token, pending ? 'waiting' : 'succeeded']);
      await query(`UPDATE public.job_processing SET state=$2, stage=$3, attempts=0,
        lease_token=NULL, lease_until=NULL, last_error=NULL,
        next_attempt_at=clock_timestamp()+($4::integer * interval '1 second'),
        updated_at=clock_timestamp() WHERE job_id=$1`,
      [row.job_id, pending ? 'retry_wait' : next === 'review' ? 'succeeded' : 'queued', next,
        pending ? output.pollAfterSeconds : 0]);
      if (next === 'review') {
        await query(`UPDATE public.jobs SET status='ready_for_review', updated_at=clock_timestamp()
          WHERE id=$1 AND status IN ('draft','rendering')`, [row.job_id]);
      }
      return { status: pending ? 'waiting' : next === 'review' ? 'succeeded' : 'advanced', stage: next };
    });
  }
  async function runOne() {
    const claimed = await claim();
    if (claimed.status !== 'claimed') return claimed;
    const { row } = claimed;
    const controller = new AbortController();
    let timer;
    let output;
    let failure;
    try {
      // Providers must use short submit/poll operations, honour cancellation, and
      // enforce this stable key before declaring retrySafe. No long render waits.
      output = await Promise.race([
        Promise.resolve().then(() => handlers[row.stage].run({
          jobId: row.job_id, operationKey: `${row.job_id}:${row.stage}${row.stage==='content' && row.content_revision ? `:${row.content_revision}` : ''}`,
          signal: controller.signal, progress: claimed.progress,
          revision: row.content_revision, leaseToken: row.lease_token,
        })),
        new Promise((_, reject) => { timer = setTimeout(() => {
          reject(new StepError('STEP_TIMEOUT', { transient: true, uncertain: true })); controller.abort();
        }, 10000); }),
      ]);
      const serialized = JSON.stringify(output instanceof PendingStep ? output.output : output);
      if (serialized === undefined || serialized.length > 262144) {
        throw new StepError('INVALID_OUTPUT');
      }
    } catch (e) {
      // An unexpected adapter error cannot prove an external operation failed.
      failure = e instanceof StepError ? e : new StepError('STEP_FAILED', { uncertain: true });
    } finally { clearTimeout(timer); }
    return finish(row, output, failure);
  }
  async function control(jobId, action) {
    if (!['retry','cancel'].includes(action)) throw new Error('Invalid control action');
    return tx(async query => {
      const result = await query('SELECT * FROM public.job_processing WHERE job_id=$1 FOR UPDATE', [jobId]);
      const row = result.rows[0];
      if (!row) return { status: 'not_found' };
      const allowed = action === 'cancel' ? ['queued','retry_wait','failed'] : ['failed'];
      // Uncertain external outcomes must be reconciled; retry cannot bypass this.
      if (!allowed.includes(row.state) || (action === 'retry' && !row.retry_safe)) {
        return { status: 'conflict' };
      }
      await query(`UPDATE public.job_processing SET state=$2, attempts=0,
        next_attempt_at=clock_timestamp(), updated_at=clock_timestamp(), last_error=NULL WHERE job_id=$1`,
      [jobId, action === 'cancel' ? 'cancelled' : 'queued']);
      await query('INSERT INTO public.job_processing_events(job_id,event) VALUES($1,$2)', [jobId, action]);
      return { status: action === 'cancel' ? 'cancelled' : 'queued' };
    });
  }
  async function history(jobId) {
    const tables = [['job_processing','job_id'], ['job_attempts','started_at, token'],
      ['job_checkpoints','completed_at, stage'], ['job_processing_events','id']];
    const results = await Promise.all(tables.map(([table, order]) =>
      pool.query(q(`SELECT * FROM public.${table} WHERE job_id=$1 ORDER BY ${order}`), [jobId])));
    return Object.fromEntries(['processing','attempts','checkpoints','events'].map((key,i) => [key, results[i].rows]));
  }
  return { runOne, control, history, claim, finish };
}
module.exports = { createProcessing, StepError, PendingStep, backoff };
