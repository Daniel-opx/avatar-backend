const { randomUUID } = require('node:crypto');
const { StepError, backoff } = require('./processing');
const { ProviderError } = require('./llm-provider');
const { validateContent } = require('./content-schema');

function createContentService(pool, { providers = {}, liveAllowed = false, schema = 'public' } = {}) {
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
  const fail = (code, options) => { throw new StepError(code, options); };
  async function prepare({ jobId, revision, leaseToken }) {
    return tx(async query => {
      const job = await query(`SELECT j.topic,p.* FROM public.jobs j JOIN public.job_processing p ON p.job_id=j.id
        WHERE j.id=$1 AND j.status='draft' AND p.stage='content' AND p.content_revision=$2
        AND p.state='running' AND p.lease_token=$3 AND p.lease_until>clock_timestamp()
        FOR UPDATE OF p,j`, [jobId, revision, leaseToken]);
      if (!job.rowCount) fail('CONTENT_STALE');
      const prior = (await query('SELECT * FROM public.content_requests WHERE job_id=$1 AND revision=$2 FOR UPDATE',
        [jobId,revision])).rows[0];
      if (prior?.state === 'succeeded') {
        const saved = await query('SELECT package FROM public.content_versions WHERE job_id=$1 AND revision=$2', [jobId,revision]);
        if (!saved.rowCount) fail('CONTENT_MISSING_VERSION', { reconcile: true });
        return { saved: saved.rows[0].package };
      }
      if (prior && ['running','needs_reconciliation'].includes(prior.state)) fail('CONTENT_UNCERTAIN', { reconcile: true });
      if (prior?.state === 'failed') fail('CONTENT_REQUEST_FAILED');
      if (prior) {
        const due = await query('SELECT clock_timestamp()>=$1::timestamptz AS due',[prior.next_attempt_at]);
        if (prior.attempts>=3 || !due.rows[0].due) fail('CONTENT_RETRY_NOT_DUE');
      }
      const config = (await query('SELECT * FROM public.content_config WHERE id=1 FOR UPDATE')).rows[0];
      if (!liveAllowed || !config?.enabled) fail('CONTENT_DISABLED');
      const provider = prior?.provider || config.provider;
      if (!providers[provider]) fail('PROVIDER_UNCONFIGURED');
      if (!config.model && !prior) fail('MODEL_UNCONFIGURED');
      if (config.requests_used >= config.max_requests) fail('CONTENT_REQUEST_LIMIT');
      const promptVersion = prior?.prompt_version || config.prompt_version;
      const prompt = (await query('SELECT instructions FROM public.content_prompts WHERE version=$1', [promptVersion])).rows[0];
      if (!prompt) fail('PROMPT_UNCONFIGURED');
      const input = prior?.input_snapshot || {
        topic: job.rows[0].topic, verified_facts: config.verified_facts,
        instructions: prompt.instructions, max_output_tokens: config.max_output_tokens,
        input_rate: config.input_usd_per_million, output_rate: config.output_usd_per_million,
      };
      if (typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length>500 ||
          !Array.isArray(input.verified_facts) || input.verified_facts.length>20 ||
          !input.verified_facts.every(f => typeof f==='string' && f.trim() && f.length<=1000)) fail('INVALID_CONTENT_INPUT');
      const token = randomUUID();
      let request;
      if (prior) {
        request = (await query(`UPDATE public.content_requests SET state='running', token=$2,
          attempts=attempts+1,error_code=NULL,finished_at=NULL WHERE id=$1 RETURNING *`, [prior.id,token])).rows[0];
      } else {
        request = (await query(`INSERT INTO public.content_requests(job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
          VALUES($1,$2,'running',$3,$4,$5,$6,$7) RETURNING *`,
        [jobId,revision,token,provider,config.model,promptVersion,input])).rows[0];
      }
      await query('UPDATE public.content_config SET requests_used=requests_used+1 WHERE id=1');
      await query('INSERT INTO public.content_calls(token,request_id,attempt) VALUES($1,$2,$3)', [token,request.id,request.attempts]);
      return { request, input };
    });
  }
  function metrics(result, input) {
    const u = result?.usage;
    const usage = u && [u.input,u.output].every(v => Number.isSafeInteger(v) && v>=0 && v<=2147483647) ? u : null;
    const cost = usage && input.input_rate != null && input.output_rate != null
      ? (usage.input*Number(input.input_rate)+usage.output*Number(input.output_rate))/1000000 : null;
    return { usage, cost, requestId: typeof result?.requestId === 'string' ? result.requestId.slice(0,200) : null,
      model: typeof result?.model === 'string' ? result.model.slice(0,100) : null };
  }
  async function generate(context) {
    const prepared = await prepare(context);
    if (prepared.saved) return { revision: context.revision, package: prepared.saved };
    const { request, input } = prepared;
    const start = Date.now();
    let result;
    let error;
    const timeout = AbortSignal.timeout(8000);
    const signal = context.signal ? AbortSignal.any([context.signal,timeout]) : timeout;
    try {
      result = await providers[request.provider].generate({ model: request.model, instructions: input.instructions,
        input: { topic: input.topic, verified_facts: input.verified_facts },
        maxOutputTokens: input.max_output_tokens, signal });
      if (signal.aborted) throw new ProviderError('PROVIDER_TIMEOUT', { uncertain: true });
      if (!validateContent(result.content,input.verified_facts)) throw new ProviderError('INVALID_CONTENT', result);
    } catch (e) {
      error = e instanceof ProviderError ? e : new ProviderError('PROVIDER_UNCERTAIN', { uncertain: true });
    }
    const m = metrics(error || result,input);
    const state = error ? error.uncertain ? 'needs_reconciliation' :
      error.retryable && request.attempts<3 ? 'retry_wait' : 'failed' : 'succeeded';
    await tx(async query => {
      const current = await query("SELECT id FROM public.content_requests WHERE id=$1 AND token=$2 AND state='running' FOR UPDATE",
        [request.id,request.token]);
      if (!current.rowCount) fail('CONTENT_UNCERTAIN', { reconcile: true });
      await query(`UPDATE public.content_calls SET state=$2, provider_request_id=$3,resolved_model=$4,
        input_tokens=$5,output_tokens=$6,estimated_cost_usd=$7,error_code=$8,duration_ms=$9,
        finished_at=clock_timestamp() WHERE token=$1`,
      [request.token,state,m.requestId,m.model,m.usage?.input ?? null,m.usage?.output ?? null,m.cost,
        error?.code || null,Math.min(2147483647,Date.now()-start)]);
      if (!error) {
        await query('INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,$2,$3,$4)',
          [context.jobId,context.revision,request.id,result.content]);
      }
      await query(`UPDATE public.content_requests SET state=$2,error_code=$3,finished_at=clock_timestamp(),
        next_attempt_at=clock_timestamp()+($4::integer * interval '1 second') WHERE id=$1`,
      [request.id,state,error?.code || null,backoff(request.attempts)]);
    });
    if (error) fail(error.code, { transient: state==='retry_wait', reconcile: state==='needs_reconciliation' });
    return { revision: context.revision, package: result.content };
  }
  async function regenerate(jobId, requestKey) {
    return tx(async query => {
      const job = (await query(`SELECT j.status,p.* FROM public.jobs j JOIN public.job_processing p ON j.id=p.job_id
        WHERE j.id=$1 FOR UPDATE OF p,j`, [jobId])).rows[0];
      if (!job) return { status: 'not_found' };
      const prior = (await query('SELECT revision FROM public.content_regenerations WHERE job_id=$1 AND request_key=$2', [jobId,requestKey])).rows[0];
      if (prior) return { status: 'queued', revision: prior.revision, replay: true };
      const uncertain = await query(`SELECT id FROM public.content_requests WHERE job_id=$1 AND revision=$2
        AND state IN ('running','needs_reconciliation')`, [jobId,job.content_revision]);
      if (job.status!=='draft' || uncertain.rowCount ||
          !['queued','retry_wait','failed'].includes(job.state) ||
          !(job.stage==='content' || (job.stage==='assets' && job.state==='queued' && job.attempts===0))) return { status: 'conflict' };
      const revision = job.content_revision+1;
      await query(`UPDATE public.job_processing SET content_revision=$2,stage='content',state='queued',
        attempts=0,last_error=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE job_id=$1`, [jobId,revision]);
      await query("DELETE FROM public.job_checkpoints WHERE job_id=$1 AND stage='content'", [jobId]);
      await query('UPDATE public.jobs SET script=NULL,visual_plan=NULL,updated_at=clock_timestamp() WHERE id=$1',[jobId]);
      await query('INSERT INTO public.content_regenerations(job_id,request_key,revision) VALUES($1,$2,$3)', [jobId,requestKey,revision]);
      await query("INSERT INTO public.job_processing_events(job_id,event) VALUES($1,'content_regeneration_queued')", [jobId]);
      return { status: 'queued', revision };
    });
  }
  async function history(jobId) {
    const results = await Promise.all([
      pool.query(q('SELECT revision,package,created_at FROM public.content_versions WHERE job_id=$1 ORDER BY revision'),[jobId]),
      pool.query(q(`SELECT r.id,r.revision,r.provider,r.model,r.prompt_version,r.state,r.error_code,
        c.attempt,c.state AS call_state,c.provider_request_id,c.resolved_model,c.input_tokens,c.output_tokens,
        c.estimated_cost_usd,c.duration_ms,c.started_at,c.finished_at FROM public.content_requests r
        LEFT JOIN public.content_calls c ON c.request_id=r.id WHERE r.job_id=$1 ORDER BY r.revision,c.attempt`),[jobId]),
    ]);
    return { versions: results[0].rows, calls: results[1].rows };
  }
  const handler = {
    retrySafe: true, // Durable journal prevents resubmitting an accepted/uncertain request.
    async isAvailable(query) {
      if (!liveAllowed) return false;
      const cfg = (await query('SELECT enabled,provider,model,requests_used,max_requests FROM public.content_config WHERE id=1')).rows[0];
      return Boolean(cfg?.enabled && cfg.model && providers[cfg.provider] && cfg.requests_used<cfg.max_requests);
    },
    run: generate,
    async commit(query,row,output) {
      const version = (await query('SELECT package FROM public.content_versions WHERE job_id=$1 AND revision=$2',
        [row.job_id,row.content_revision])).rows[0];
      if (!version || output.revision!==row.content_revision) fail('CONTENT_MISSING_VERSION');
      const updated = await query(`UPDATE public.jobs SET script=$2,visual_plan=$3::jsonb,
        updated_at=clock_timestamp() WHERE id=$1 AND status='draft'`,
      [row.job_id,version.package.script,JSON.stringify(version.package.visual_plan)]);
      if (!updated.rowCount) fail('CONTENT_STALE');
    },
  };
  return { handler, generate, regenerate, history };
}
module.exports = { createContentService };
