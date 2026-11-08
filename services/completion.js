const {randomUUID,randomBytes}=require('node:crypto');
const {verifySignature,normalizeEvent,digest}=require('./webhook-auth');
const {videoId}=require('./heygen-mock');
const {validReference,validMetadata,identifier}=require('./asset-validation');
const {backoff}=require('./processing');

function createCompletionService(pool,{schema='public',allowMock=false,secret=null,provider=null,store=null}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',`${schema}.`);
  const query=(s,v)=>pool.query(q(s),v);
  async function tx(work){
    const c=await pool.connect();let broken;
    const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const r=await work(run);await run('COMMIT');return r;}
    catch(e){try{await run('ROLLBACK');}catch(rollback){broken=rollback;}throw e;}
    finally{c.release(broken);}
  }
  async function receive(raw,signature){
    if(!allowMock)return {status:'disabled'};
    if(!verifySignature(raw,signature,secret))return {status:'unauthorized'};
    const event=normalizeEvent(raw);
    if(!event)return {status:'invalid'};
    if(event.unsupported)return {status:'ignored'};
    return tx(async run=>{
      const cfg=(await run('SELECT enabled,mode FROM public.completion_config WHERE id=1')).rows[0];
      if(!cfg?.enabled||cfg.mode!=='mock')return {status:'disabled'};
      const matches=(await run(`SELECT id,external_video_id FROM public.render_requests WHERE mode='mock'
        AND (external_video_id=$1 OR id=$2::uuid)`,[event.videoId,event.callbackId])).rows;
      if(matches.length>1 || matches.some(r=>(r.external_video_id&&r.external_video_id!==event.videoId)||
        (event.callbackId&&event.callbackId!==r.id)))return {status:'conflict'};
      const request=matches[0];
      const inserted=await run(`INSERT INTO public.webhook_events(dedupe_key,provider_event_id,external_video_id,
        event_type,render_request_id,body_sha256,state) VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING RETURNING dedupe_key`,[event.key,event.eventId,event.videoId,event.type,
        request?.id||null,event.bodyHash,request?'received':'unmatched']);
      if(!inserted.rowCount){
        const old=(await run('SELECT dedupe_key FROM public.webhook_events WHERE dedupe_key=$1 OR provider_event_id=$2',[event.key,event.eventId])).rows;
        return {status:old.some(r=>r.dedupe_key!==event.key)?'conflict':'duplicate'};
      }
      return {status:'accepted'};
    });
  }
  async function lockRequest(run,id){
    const ref=(await run('SELECT job_id FROM public.render_requests WHERE id=$1',[id])).rows[0];
    if(!ref)return null;
    const job=(await run(`SELECT p.*,j.status AS job_status FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id
      WHERE p.job_id=$1 FOR UPDATE OF p,j`,[ref.job_id])).rows[0];
    const request=(await run('SELECT * FROM public.render_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
    return {job,request};
  }
  async function reserve(id){
    return tx(async run=>{
      const locked=await lockRequest(run,id);if(!locked)return {status:'not_found'};
      const {job,request:r}=locked;
      if(job.content_revision!==r.revision || job.state==='cancelled' ||
        !['draft','rendering','ready_for_review','failed'].includes(job.job_status))return {status:'conflict'};
      const cfg=(await run('SELECT * FROM public.completion_config WHERE id=1')).rows[0];
      if(!cfg?.enabled||cfg.mode!=='mock')return {status:'disabled'};
      let externalId=r.external_video_id;
      if(!externalId){
        const candidates=(await run(`SELECT DISTINCT external_video_id FROM public.webhook_events
          WHERE render_request_id=$1 AND state='received'`,[id])).rows;
        if(candidates.length!==1)return {status:'needs_reconciliation'};
        externalId=candidates[0].external_video_id;
      }
      if(!videoId(externalId))return {status:'conflict'};
      await run('INSERT INTO public.video_media(render_request_id) VALUES($1) ON CONFLICT DO NOTHING',[id]);
      const media=(await run('SELECT *,lease_until>clock_timestamp() AS active,next_check_at>clock_timestamp() AS future FROM public.video_media WHERE render_request_id=$1 FOR UPDATE',[id])).rows[0];
      if(media.state==='ready'){
        await run(`UPDATE public.webhook_events SET state=CASE WHEN event_type='avatar_video.fail' THEN 'ignored' ELSE 'processed' END
          WHERE external_video_id=$1 AND state IN ('received','unmatched')`,[externalId]);
        return {status:'ready',mode:'mock',real_video_generated:false};
      }
      if(media.state==='running'&&media.active)return {status:'busy'};
      if(media.state==='failed'||media.attempts>=3||media.checks>=120)return {status:'retry_required'};
      if(media.future&&media.state!=='running')return {status:'not_due'};
      const token=randomUUID();
      await run(`UPDATE public.video_media SET state='running',token=$2,lease_until=clock_timestamp()+interval '30 seconds',
        attempts=attempts+1,checks=checks+1,updated_at=clock_timestamp() WHERE render_request_id=$1`,[id,token]);
      return {status:'reserved',id,token,externalId,request:r,config:cfg,attempt:media.attempts+1};
    });
  }
  async function settle(work,state,code,metadata=null){
    return tx(async run=>{
      const locked=await lockRequest(run,work.id);if(!locked)return {status:'stale'};
      const m=(await run(`SELECT * FROM public.video_media WHERE render_request_id=$1 AND state='running'
        AND token=$2 AND lease_until>clock_timestamp() FOR UPDATE`,[work.id,work.token])).rows[0];
      if(!m)return {status:'stale'};
      const {job,request}=locked;
      if(job.content_revision!==request.revision||job.state==='cancelled'){
        state='failed';code='MEDIA_JOB_CHANGED';metadata=null;
      }
      await run(`UPDATE public.video_media SET state=$2,token=NULL,lease_until=NULL,error_code=$3,
        attempts=CASE WHEN $2 IN ('ready','waiting') THEN 0 ELSE attempts END,
        next_check_at=clock_timestamp()+($4::integer*interval '1 second'),
        bucket=COALESCE($5,bucket),object_key=COALESCE($6,object_key),mime_type=COALESCE($7,mime_type),
        size_bytes=COALESCE($8,size_bytes),sha256=COALESCE($9,sha256),duration_seconds=COALESCE($10,duration_seconds),
        updated_at=clock_timestamp() WHERE render_request_id=$1`,[work.id,state,code,backoff(work.attempt),
        metadata?.bucket||null,metadata?.object_key||null,metadata?.mime_type||null,metadata?.size_bytes||null,
        metadata?.sha256||null,metadata?.durationSeconds??null]);
      if(state==='ready'){
        await run(`UPDATE public.webhook_events SET render_request_id=$2,state=CASE WHEN event_type='avatar_video.fail'
          THEN 'ignored' ELSE 'processed' END WHERE external_video_id=$1 AND state IN ('received','unmatched')`,[work.externalId,work.id]);
        if(work.promote!==false&&job.stage==='render'&&['draft','rendering','failed'].includes(job.job_status)){
          await run(`UPDATE public.job_attempts SET outcome='succeeded',finished_at=clock_timestamp()
            WHERE job_id=$1 AND stage='render' AND outcome='running'`,[job.job_id]);
          await run(`INSERT INTO public.job_checkpoints AS cp(job_id,stage,output,completed) VALUES($1,'render',$2,true)
            ON CONFLICT(job_id,stage) DO UPDATE SET output=EXCLUDED.output,completed=true,
            completed_at=clock_timestamp() WHERE NOT cp.completed`,[job.job_id,{mode:'mock',render_request_id:work.id,
            external_video_id:work.externalId,real_video_generated:false}]);
          await run(`UPDATE public.job_processing SET stage='review',state='succeeded',lease_token=NULL,lease_until=NULL,
            attempts=0,last_error=NULL,updated_at=clock_timestamp() WHERE job_id=$1`,[job.job_id]);
          await run("UPDATE public.jobs SET status='ready_for_review',updated_at=clock_timestamp() WHERE id=$1",[job.job_id]);
        }
        await run("INSERT INTO public.job_processing_events(job_id,event) VALUES($1,'mock_video_media_ready')",[job.job_id]);
      }
      return {status:state,mode:'mock',real_video_generated:false};
    });
  }
  async function reconcile(id,{signal:outerSignal,promote=true}={}){
    if(!allowMock||provider?.mode!=='mock'||store?.mode!=='mock')return {status:'disabled'};
    const work=await reserve(id);if(work.status!=='reserved')return work;
    work.promote=promote;
    const signal=outerSignal?AbortSignal.any([outerSignal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000);
    let detail;
    try{detail=await provider.inspect({externalId:work.externalId,signal});}
    catch{return settle(work,work.attempt<3?'queued':'failed','VIDEO_STATUS_UNAVAILABLE');}
    if(signal.aborted || detail?.externalId!==work.externalId ||
      !['waiting','pending','processing','completed','failed'].includes(detail?.status)||
      ((!work.request.external_video_id || detail.callbackId!=null)&&detail.callbackId!==work.id)){
      return settle(work,'failed','VIDEO_IDENTITY_MISMATCH');
    }
    const transition=await tx(async run=>{
      const locked=await lockRequest(run,id);if(!locked)return 'stale';
      const active=await run(`SELECT 1 FROM public.video_media WHERE render_request_id=$1 AND state='running'
        AND token=$2 AND lease_until>clock_timestamp() FOR UPDATE`,[id,work.token]);
      if(!active.rowCount || locked.job.state==='cancelled'||locked.job.content_revision!==locked.request.revision)return 'stale';
      const r=locked.request;
      if((r.state==='completed'&&detail.status!=='completed')||
        (r.state==='failed'&&r.error_code==='HEYGEN_RENDER_FAILED'&&detail.status!=='failed')){
        await run("UPDATE public.webhook_events SET state='conflict' WHERE render_request_id=$1 AND state='received'",[id]);
        return 'conflict';
      }
      const state=detail.status==='completed'?'completed':detail.status==='failed'?'failed':'pending';
      await run(`UPDATE public.render_requests SET state=$2,external_video_id=$3,token=$4,
        error_code=$5,updated_at=clock_timestamp() WHERE id=$1`,[id,state,work.externalId,randomUUID(),state==='failed'?'HEYGEN_RENDER_FAILED':null]);
      if(state==='failed'){
        await run("UPDATE public.webhook_events SET state='processed' WHERE render_request_id=$1 AND state='received'",[id]);
        if(locked.job.stage==='render'&&['draft','rendering'].includes(locked.job.job_status)){
          await run(`UPDATE public.job_attempts SET outcome='failed',error_code='HEYGEN_RENDER_FAILED',finished_at=clock_timestamp()
            WHERE job_id=$1 AND stage='render' AND outcome='running'`,[r.job_id]);
          await run(`UPDATE public.job_processing SET state='failed',lease_token=NULL,lease_until=NULL,
            last_error='HEYGEN_RENDER_FAILED',updated_at=clock_timestamp() WHERE job_id=$1`,[r.job_id]);
          await run("UPDATE public.jobs SET status='failed',updated_at=clock_timestamp() WHERE id=$1",[r.job_id]);
        }
      }
      return state;
    });
    if(transition==='stale')return {status:'stale'};
    if(transition==='conflict')return settle(work,'failed','VIDEO_TERMINAL_CONFLICT');
    if(transition==='failed')return settle(work,'failed','HEYGEN_RENDER_FAILED');
    if(transition==='pending')return settle(work,'waiting',null);
    const key=`renders/${id}.mp4`;
    let metadata;
    try{
      if(!identifier(work.config.private_bucket))throw new Error();
      metadata=await store.copy({externalId:work.externalId,bucket:work.config.private_bucket,object_key:key,
        operationKey:id,signal,maxBytes:work.config.max_bytes});
      const stat=await store.stat({bucket:work.config.private_bucket,object_key:key,signal});
      if(signal.aborted || !validReference(metadata)||metadata.bucket!==work.config.private_bucket||metadata.object_key!==key||
        !validMetadata('video',metadata)||metadata.mime_type!=='video/mp4'||Number(metadata.size_bytes)>work.config.max_bytes||
        stat.sha256!==metadata.sha256||Number(stat.size_bytes)!==Number(metadata.size_bytes)||stat.mime_type!=='video/mp4')throw new Error();
    }catch{return settle(work,work.attempt<3?'queued':'failed','MEDIA_STORAGE_UNAVAILABLE');}
    return settle(work,'ready',null,{...metadata,size_bytes:Number(metadata.size_bytes),
      durationSeconds:Number.isFinite(detail.durationSeconds)&&detail.durationSeconds>=0&&detail.durationSeconds<=1800?detail.durationSeconds:null});
  }
  async function issueReview(jobId){
    if(!allowMock)return {status:'disabled'};
    return tx(async run=>{
      const cfg=(await run('SELECT * FROM public.completion_config WHERE id=1')).rows[0];
      if(!cfg?.enabled)return {status:'disabled'};
      const row=(await run(`SELECT m.render_request_id FROM public.video_media m JOIN public.render_requests r ON r.id=m.render_request_id
        JOIN public.job_processing p ON p.job_id=r.job_id JOIN public.jobs j ON j.id=p.job_id
        WHERE r.job_id=$1 AND r.revision=p.content_revision AND r.state='completed' AND m.state='ready'
        AND p.state<>'cancelled' AND j.status IN ('ready_for_review','approved','scheduled','published')`,[jobId])).rows[0];
      if(!row)return {status:'unavailable'};
      const token=randomBytes(32).toString('base64url');
      const grant=await run(`INSERT INTO public.review_grants(token_hash,render_request_id,expires_at)
        VALUES($1,$2,clock_timestamp()+($3::integer*interval '1 second')) RETURNING expires_at`,[digest(token),row.render_request_id,cfg.review_ttl_seconds]);
      return {status:'ready',mode:'mock',real_video_generated:false,url:`/review/${token}`,expires_at:grant.rows[0].expires_at};
    });
  }
  async function readReview(token){
    if(!allowMock||store?.mode!=='mock')return {status:'disabled'};
    if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))return {status:'not_found'};
    const row=(await query(`SELECT m.* FROM public.review_grants g JOIN public.video_media m ON m.render_request_id=g.render_request_id
      JOIN public.render_requests r ON r.id=m.render_request_id JOIN public.job_processing p ON p.job_id=r.job_id
      WHERE g.token_hash=$1 AND g.expires_at>clock_timestamp() AND g.revoked_at IS NULL AND m.state='ready'
      AND r.state='completed' AND p.content_revision=r.revision AND p.state<>'cancelled'
      AND (SELECT enabled FROM public.completion_config WHERE id=1)`,[digest(token)])).rows[0];
    if(!row)return {status:'not_found'};
    try{
      const bytes=await store.read({bucket:row.bucket,object_key:row.object_key,signal:AbortSignal.timeout(8000)});
      if(!Buffer.isBuffer(bytes)||bytes.length!==row.size_bytes||digest(bytes)!==row.sha256)throw new Error();
      return {status:'ready',bytes,mime:'video/mp4',mode:'mock'};
    }catch{return {status:'unavailable'};}
  }
  async function retryMedia(jobId){
    if(!allowMock)return {status:'disabled'};
    return tx(async run=>{
      const cfg=(await run('SELECT enabled FROM public.completion_config WHERE id=1')).rows[0];
      if(!cfg?.enabled)return {status:'disabled'};
      const r=(await run(`SELECT r.id FROM public.render_requests r JOIN public.job_processing p ON p.job_id=r.job_id
        WHERE r.job_id=$1 AND r.revision=p.content_revision AND r.external_video_id IS NOT NULL
        AND r.state IN ('pending','polling','needs_reconciliation','completed') AND p.state<>'cancelled'`,[jobId])).rows[0];
      if(!r)return {status:'conflict'};
      const locked=await lockRequest(run,r.id);if(!locked)return {status:'not_found'};
      const updated=await run(`UPDATE public.video_media SET state='queued',attempts=0,checks=0,error_code=NULL,
        next_check_at=clock_timestamp(),token=NULL,lease_until=NULL WHERE render_request_id=$1
        AND (state<>'running' OR lease_until<=clock_timestamp()) RETURNING render_request_id`,[r.id]);
      if(!updated.rowCount)return {status:'conflict'};
      await run('UPDATE public.review_grants SET revoked_at=clock_timestamp() WHERE render_request_id=$1 AND revoked_at IS NULL',[r.id]);
      return {status:'queued',render_request_id:r.id};
    });
  }
  async function history(jobId){
    const [media,events]=await Promise.all([
      query(`SELECT m.render_request_id,r.revision,m.mode,m.state,m.attempts,m.checks,m.mime_type,m.size_bytes,
        m.sha256,m.duration_seconds,m.error_code,m.updated_at FROM public.video_media m JOIN public.render_requests r
        ON r.id=m.render_request_id WHERE r.job_id=$1 ORDER BY r.revision`,[jobId]),
      query(`SELECT e.event_type,e.state,e.received_at FROM public.webhook_events e JOIN public.render_requests r
        ON r.id=e.render_request_id WHERE r.job_id=$1 ORDER BY e.received_at`,[jobId]),
    ]);return {media:media.rows,events:events.rows};
  }
  async function isAvailable(run){
    if(!allowMock||provider?.mode!=='mock'||store?.mode!=='mock')return false;
    const cfg=(await run('SELECT enabled FROM public.completion_config WHERE id=1')).rows[0];
    return Boolean(cfg?.enabled);
  }
  return {receive,reconcile,issueReview,readReview,retryMedia,history,isAvailable};
}
module.exports={createCompletionService};
