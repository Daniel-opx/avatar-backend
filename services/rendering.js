const {randomUUID}=require('node:crypto');
const {StepError,PendingStep,backoff}=require('./processing');
const {buildAvatarRequest,RenderError,videoId}=require('./heygen-mock');

function createRenderService(pool,{schema='public',allowMock=false,provider=null}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',`${schema}.`);
  const query=(s,v)=>pool.query(q(s),v);
  const fail=(code,options)=>{throw new StepError(code,options);};
  async function tx(work){
    const c=await pool.connect();let broken;
    const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(rollback){broken=rollback;}throw e;}
    finally{c.release(broken);}
  }
  const pending=row=>new PendingStep({mode:'mock',render_request_id:row.id,external_video_id:row.external_video_id,
    real_video_generated:false},row.poll_after_seconds);
  const completed=row=>({mode:'mock',render_request_id:row.id,external_video_id:row.external_video_id,
    revision:row.revision,real_video_generated:false,review_link_available:false});
  async function prepare(context){
    if(!allowMock || provider?.mode!=='mock')fail('RENDER_DISABLED');
    return tx(async run=>{
      const job=(await run(`SELECT p.* FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id
        WHERE p.job_id=$1 AND p.content_revision=$2 AND p.stage='render' AND p.state='running'
        AND p.lease_token=$3 AND p.lease_until>clock_timestamp() AND j.status IN ('draft','rendering')
        FOR UPDATE OF p,j`,[context.jobId,context.revision,context.leaseToken])).rows[0];
      if(!job)fail('RENDER_STALE');
      const cfg=(await run('SELECT * FROM public.render_config WHERE id=1 FOR UPDATE')).rows[0];
      if(!cfg?.enabled || cfg.mode!=='mock')fail('RENDER_DISABLED');
      let row=(await run('SELECT * FROM public.render_requests WHERE job_id=$1 AND revision=$2 FOR UPDATE',
        [context.jobId,context.revision])).rows[0];
      if(row?.state==='completed')return {action:'completed',row};
      if(row && ['submitting','needs_reconciliation'].includes(row.state))fail('RENDER_UNCERTAIN',{reconcile:true});
      if(row?.state==='failed')fail('RENDER_REQUEST_FAILED');
      if(row){
        const due=(await run('SELECT $1::timestamptz<=clock_timestamp() AS due',[row.next_action_at])).rows[0].due;
        if(!due)return {action:'wait',row};
      }
      const token=randomUUID();
      const action=row?.external_video_id?'poll':'submit';
      if(action==='submit'){
        if(cfg.submissions_used>=cfg.max_submissions)fail('RENDER_SUBMISSION_LIMIT');
        if(row && row.submission_attempts>=3)fail('RENDER_ATTEMPT_LIMIT');
        if(!row){
          const manifest=(await run('SELECT manifest FROM public.asset_manifests WHERE job_id=$1 AND revision=$2',
            [context.jobId,context.revision])).rows[0];
          if(!manifest)fail('ASSET_MANIFEST_MISSING');
          const payload=buildAvatarRequest(manifest.manifest,cfg);
          const requestId=randomUUID();
          payload.callback_id=requestId;
          row=(await run(`INSERT INTO public.render_requests(job_id,revision,state,token,payload,max_polls,poll_after_seconds,id)
            VALUES($1,$2,'submitting',$3,$4,$5,$6,$7) RETURNING *`,
          [context.jobId,context.revision,token,payload,cfg.max_polls,cfg.poll_after_seconds,requestId])).rows[0];
        }else{
          row=(await run(`UPDATE public.render_requests SET state='submitting',token=$2,
            submission_attempts=submission_attempts+1,error_code=NULL,updated_at=clock_timestamp()
            WHERE id=$1 RETURNING *`,[row.id,token])).rows[0];
        }
        await run('UPDATE public.render_config SET submissions_used=submissions_used+1 WHERE id=1');
      }else{
        if(row.polls>=row.max_polls)fail('RENDER_POLL_LIMIT',{reconcile:true});
        if(row.state==='polling')await run(`UPDATE public.render_calls SET outcome='interrupted',finished_at=clock_timestamp()
          WHERE token=$1 AND outcome='running'`,[row.token]);
        row=(await run(`UPDATE public.render_requests SET state='polling',token=$2,polls=polls+1,
          updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[row.id,token])).rows[0];
      }
      await run('INSERT INTO public.render_calls(token,request_id,action) VALUES($1,$2,$3)',[token,row.id,action]);
      return {action,row};
    });
  }
  async function processOne(context){
    let prepared;
    try{prepared=await prepare(context);}catch(e){
      if(e instanceof RenderError)fail(e.code);throw e;
    }
    if(prepared.action==='completed')return completed(prepared.row);
    if(prepared.action==='wait')return pending(prepared.row);
    const {row,action}=prepared;
    const signal=context.signal?AbortSignal.any([context.signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000);
    let result;let error;const started=Date.now();
    try{
      result=action==='submit'?await provider.submit({payload:row.payload,idempotencyKey:row.id,signal}):
        await provider.poll({externalId:row.external_video_id,signal});
      if(signal.aborted)throw new RenderError('HEYGEN_TIMEOUT',{uncertain:action==='submit',retryable:action==='poll'});
      if(action==='submit'?!videoId(result?.externalId):!['waiting','pending','processing','completed','failed'].includes(result?.status)){
        throw new RenderError('HEYGEN_INVALID_RESPONSE',{uncertain:action==='submit',retryable:action==='poll'});
      }
    }catch(e){error=e instanceof RenderError?e:new RenderError('HEYGEN_UNCERTAIN',{
      uncertain:action==='submit',retryable:action==='poll'});}
    let state;
    if(error){
      state=error.uncertain?'needs_reconciliation':error.retryable?
        action==='submit'?(row.submission_attempts<3?'retry_wait':'failed'):
          row.poll_failures<2?'pending':'needs_reconciliation':'failed';
    }else state=action==='submit'?'pending':result.status==='completed'?'completed':result.status==='failed'?'failed':'pending';
    const stored=await tx(async run=>{
      // Keep lock order consistent with prepare and worker completion.
      await run('SELECT p.job_id FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id WHERE p.job_id=$1 FOR UPDATE OF p,j',[context.jobId]);
      const current=(await run(`SELECT * FROM public.render_requests WHERE id=$1 AND token=$2
        AND state IN ('submitting','polling') FOR UPDATE`,[row.id,row.token])).rows[0];
      if(!current)return null;
      const code=error?.code || (state==='failed'?'HEYGEN_RENDER_FAILED':null);
      const updated=(await run(`UPDATE public.render_requests SET state=$2,
        external_video_id=COALESCE($3,external_video_id),error_code=$4,
        poll_failures=CASE WHEN $5 THEN poll_failures+1 ELSE 0 END,
        next_action_at=clock_timestamp()+($6::integer*interval '1 second'),updated_at=clock_timestamp()
        WHERE id=$1 RETURNING *`,[row.id,state,action==='submit'&&!error?result.externalId:null,code,
        action==='poll'&&Boolean(error),error?Math.max(backoff(action==='submit'?row.submission_attempts:row.poll_failures+1),error.retryAfterSeconds||0):row.poll_after_seconds])).rows[0];
      await run(`UPDATE public.render_calls SET outcome=$2,error_code=$3,http_status=$4,
        provider_request_id=$5,duration_ms=$6,finished_at=clock_timestamp() WHERE token=$1`,
      [row.token,state,code,(error||result)?.httpStatus||null,
        typeof(error||result)?.requestId==='string'?(error||result).requestId.slice(0,200):null,
        Math.min(2147483647,Date.now()-started)]);
      if(action==='submit'&&!error){
        // A mock ID belongs only in the mock request journal, never jobs.heygen_video_id.
        await run(`UPDATE public.jobs SET status='rendering',updated_at=clock_timestamp() WHERE id=$1
          AND status='draft' AND EXISTS(SELECT 1 FROM public.job_processing
          WHERE job_id=$1 AND content_revision=$2 AND stage='render')`,[context.jobId,context.revision]);
      }
      return updated;
    });
    if(!stored)return pending(row); // A newer poll owns the journal; old worker is fenced by its lease.
    if(state==='needs_reconciliation')fail(error?.code||'RENDER_UNCERTAIN',{reconcile:true});
    if(state==='failed')fail(error?.code||'HEYGEN_RENDER_FAILED');
    if(state==='retry_wait')fail(error.code,{transient:true});
    return state==='completed'?completed(stored):pending(stored);
  }
  async function history(jobId){
    const [requests,calls]=await Promise.all([
      query(`SELECT id,revision,mode,state,external_video_id,submission_attempts,polls,poll_failures,
        next_action_at,error_code,created_at,updated_at FROM public.render_requests WHERE job_id=$1 ORDER BY revision`,[jobId]),
      query(`SELECT c.* FROM public.render_calls c JOIN public.render_requests r ON r.id=c.request_id
        WHERE r.job_id=$1 ORDER BY c.started_at,c.token`,[jobId]),
    ]);return {requests:requests.rows,calls:calls.rows};
  }
  const handler={retrySafe:true,
    async isAvailable(run){if(!allowMock||provider?.mode!=='mock')return false;
      const cfg=(await run('SELECT enabled,mode FROM public.render_config WHERE id=1')).rows[0];
      return Boolean(cfg?.enabled&&cfg.mode==='mock');},
    run:processOne,
    async commit(run,row,output){
      const saved=(await run("SELECT id,external_video_id FROM public.render_requests WHERE job_id=$1 AND revision=$2 AND state='completed'",
        [row.job_id,row.content_revision])).rows[0];
      if(!saved || output.mode!=='mock' || output.render_request_id!==saved.id || output.external_video_id!==saved.external_video_id)fail('RENDER_STALE');
      const job=await run("SELECT id FROM public.jobs WHERE id=$1 AND status IN ('draft','rendering') FOR UPDATE",[row.job_id]);
      if(!job.rowCount)fail('RENDER_STALE');
    },
  };
  return {processOne,history,handler};
}
module.exports={createRenderService};
