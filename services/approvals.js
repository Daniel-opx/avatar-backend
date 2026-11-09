const {digest}=require('./webhook-auth');
const {uuid}=require('./supabase-auth');
const {AccessError}=require('./team');
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const fingerprint=value=>digest(canonical(value));
function createApprovalService(pool,team,{schema='public'}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',schema+'.');
  async function tx(work){const c=await pool.connect();let broken;const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(rollback){broken=rollback;}throw e.code==='23505'?new AccessError(409):e;}finally{c.release(broken);}
  }
  const lock=async(run,jobId)=>(await run(`SELECT p.*,j.status AS job_status FROM public.job_processing p JOIN public.jobs j ON j.id=p.job_id
    WHERE p.job_id=$1 FOR UPDATE OF p,j`,[jobId])).rows[0];
  const snapshot=async(run,id)=>(await run('SELECT public.approval_snapshot($1) AS snapshot',[id])).rows[0]?.snapshot;
  const publicSnapshot=s=>s?{job_id:s.job_id,revision:s.revision,topic:s.topic,script:s.script,visual_plan:s.visual_plan,
    content:s.content,render_request_id:s.render_request_id,media:{mode:s.media.mode,sha256:s.media.sha256,
      size_bytes:s.media.size_bytes,mime_type:s.media.mime_type,duration_seconds:s.media.duration_seconds}}:null;
  async function human(run,actor,roles){return team.authorize(run,actor,roles);}
  async function request(actor,jobId,key){
    if(!uuid(jobId)||!uuid(key))throw new AccessError(400);
    jobId=jobId.toLowerCase();key=key.toLowerCase();
    return tx(async run=>{
      await human(run,actor,['admin','operator']);const job=await lock(run,jobId);
      if(!job)throw new AccessError(404);
      if(job.stage!=='review'||job.state!=='succeeded'||!['ready_for_review','approved'].includes(job.job_status))throw new AccessError(409);
      const s=await snapshot(run,jobId);if(s?.ready!==true||s.media.mode!=='mock')throw new AccessError(409);
      const hash=fingerprint(s);
      const prior=(await run('SELECT id,job_id,snapshot_hash,state FROM public.approval_requests WHERE id=$1',[key])).rows[0];
      if(prior){if(prior.job_id!==jobId||prior.snapshot_hash!==hash)throw new AccessError(409);return {...prior,replay:true,publication_authorized:false};}
      const same=(await run('SELECT id,state FROM public.approval_requests WHERE job_id=$1 AND revision=$2 AND snapshot_hash=$3',[jobId,job.content_revision,hash])).rows[0];
      if(same)return {...same,snapshot_hash:hash,replay:true,publication_authorized:false};
      await run("UPDATE public.approval_requests SET state='superseded' WHERE job_id=$1 AND state IN ('pending','approved')",[jobId]);
      await run(`INSERT INTO public.approval_requests(id,job_id,revision,render_request_id,snapshot,snapshot_hash,requested_by)
        VALUES($1,$2,$3,$4,$5,$6,$7)`,[key,jobId,job.content_revision,s.render_request_id,s,hash,actor.id]);
      await run(`INSERT INTO public.approval_notifications(request_id,recipient_id,kind)
        SELECT $1,id,'review_requested' FROM public.team_members WHERE enabled AND role IN ('admin','reviewer') ON CONFLICT DO NOTHING`,[key]);
      await team.audit(run,actor,'approval_requested',jobId,{request_id:key,revision:job.content_revision,snapshot_hash:hash});
      return {id:key,state:'pending',snapshot_hash:hash,mode:'mock',publication_authorized:false};
    });
  }
  async function list(actor,jobId){
    if(!uuid(jobId))throw new AccessError(400);
    return tx(async run=>{await human(run,actor,['admin','operator','reviewer']);
      return (await run(`SELECT a.id,a.revision,a.state,a.mode,a.snapshot_hash,a.created_at,a.replacement_revision,
        d.reviewer_id,d.action,d.comment,d.created_at AS reviewed_at FROM public.approval_requests a
        LEFT JOIN public.approval_decisions d ON d.request_id=a.id WHERE a.job_id=$1 ORDER BY a.created_at DESC LIMIT 50`,[jobId])).rows;
    });
  }
  async function detail(actor,jobId,id){
    if(!uuid(jobId)||!uuid(id))throw new AccessError(400);
    return tx(async run=>{await human(run,actor,['admin','operator','reviewer']);
      const a=(await run('SELECT * FROM public.approval_requests WHERE id=$1 AND job_id=$2',[id,jobId])).rows[0];if(!a)throw new AccessError(404);
      const current=await snapshot(run,jobId);
      return {id:a.id,state:a.state,mode:a.mode,snapshot_hash:a.snapshot_hash,snapshot:publicSnapshot(a.snapshot),
        current:current?.ready===true&&fingerprint(current)===a.snapshot_hash,publication_authorized:false};
    });
  }
  async function decide(actor,jobId,id,{request_key:key,action,expected_hash:hash,comment=''}={}){
    if(![jobId,id,key].every(uuid)||!['approved','rejected','revision_requested'].includes(action)
      ||typeof hash!=='string'||!/^[a-f0-9]{64}$/.test(hash)||typeof comment!=='string'||comment.length>4000)throw new AccessError(400);
    jobId=jobId.toLowerCase();id=id.toLowerCase();key=key.toLowerCase();
    return tx(async run=>{
      await human(run,actor,['admin','reviewer']);const job=await lock(run,jobId);if(!job)throw new AccessError(404);
      const a=(await run('SELECT * FROM public.approval_requests WHERE id=$1 AND job_id=$2 FOR UPDATE',[id,jobId])).rows[0];if(!a)throw new AccessError(404);
      const prior=(await run('SELECT * FROM public.approval_decisions WHERE request_id=$1 OR decision_key=$2',[id,key])).rows;
      if(prior.length){const d=prior[0];if(prior.length!==1||d.request_id!==id||d.decision_key!==key||d.reviewer_id!==actor.id||d.action!==action||d.comment!==comment||hash!==a.snapshot_hash)throw new AccessError(409);
        const current=await snapshot(run,jobId);
        return {id,state:d.action,replay:true,current:current?.ready===true&&fingerprint(current)===a.snapshot_hash,mode:'mock',publication_authorized:false};}
      if(a.state!=='pending'||a.snapshot_hash!==hash||job.stage!=='review'||job.state!=='succeeded'
        ||job.job_status!=='ready_for_review')throw new AccessError(409);
      const current=await snapshot(run,jobId);
      if(current?.ready!==true||fingerprint(current)!==hash){
        await run("UPDATE public.approval_requests SET state='superseded' WHERE id=$1",[id]);
        await team.audit(run,actor,'stale_approval_blocked',jobId,{request_id:id});return {id,state:'superseded',publication_authorized:false};
      }
      await run(`INSERT INTO public.approval_decisions(request_id,decision_key,reviewer_id,action,comment) VALUES($1,$2,$3,$4,$5)`,[id,key,actor.id,action,comment]);
      await run('UPDATE public.approval_requests SET state=$2 WHERE id=$1',[id,action]);
      await run(`INSERT INTO public.approval_notifications(request_id,recipient_id,kind)
        SELECT $1,id,'decision' FROM public.team_members WHERE enabled AND role IN ('admin','operator') ON CONFLICT DO NOTHING`,[id]);
      await team.audit(run,actor,'approval_'+action,jobId,{request_id:id,snapshot_hash:hash});
      // Mock review is auditable but can never move the real job into a publishable status.
      return {id,state:action,mode:'mock',publication_authorized:false};
    });
  }
  async function revise(actor,jobId,id,{request_key:key,topic}={}){
    if(![jobId,id,key].every(uuid)||typeof topic!=='string'||!topic.trim()||topic.length>500)throw new AccessError(400);
    jobId=jobId.toLowerCase();id=id.toLowerCase();key=key.toLowerCase();
    topic=topic.trim();return tx(async run=>{
      await human(run,actor,['admin','operator']);const job=await lock(run,jobId);if(!job)throw new AccessError(404);
      const a=(await run('SELECT * FROM public.approval_requests WHERE id=$1 AND job_id=$2 FOR UPDATE',[id,jobId])).rows[0];if(!a)throw new AccessError(404);
      if(a.replacement_revision){if(a.revision_key!==key||a.revision_topic_hash!==digest(topic))throw new AccessError(409);
        return {revision:a.replacement_revision,state:'queued',replay:true};}
      if(!['rejected','revision_requested'].includes(a.state)||job.content_revision!==a.revision||job.stage!=='review'
        ||job.state!=='succeeded'||job.job_status!=='ready_for_review')throw new AccessError(409);
      const revision=a.revision+1;
      await run(`UPDATE public.approval_requests SET replacement_revision=$2,revision_key=$3,revision_topic_hash=$4 WHERE id=$1`,[id,revision,key,digest(topic)]);
      await run("UPDATE public.approval_requests SET state='superseded' WHERE job_id=$1 AND state IN ('approved','pending')",[jobId]);
      await run('UPDATE public.review_grants SET revoked_at=clock_timestamp() WHERE render_request_id=$1 AND revoked_at IS NULL',[a.render_request_id]);
      await run('DELETE FROM public.job_checkpoints WHERE job_id=$1',[jobId]);
      await run(`UPDATE public.job_processing SET content_revision=$2,stage='content',state='queued',attempts=0,
        lease_token=NULL,lease_until=NULL,last_error=NULL,next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE job_id=$1`,[jobId,revision]);
      await run("UPDATE public.jobs SET topic=$2,script=NULL,visual_plan=NULL,status='draft',updated_at=clock_timestamp() WHERE id=$1",[jobId,topic]);
      await run("INSERT INTO public.job_processing_events(job_id,event) VALUES($1,'approval_revision_queued')",[jobId]);
      await team.audit(run,actor,'approval_revision_queued',jobId,{request_id:id,revision});return {revision,state:'queued'};
    });
  }
  async function notifications(actor){return tx(async run=>{await human(run,actor,['admin','operator','reviewer']);
    return (await run(`SELECT n.request_id,n.kind,n.created_at,n.read_at,a.job_id,a.revision,a.state,a.mode
      FROM public.approval_notifications n JOIN public.approval_requests a ON a.id=n.request_id
      WHERE n.recipient_id=$1 ORDER BY n.created_at DESC LIMIT 100`,[actor.id])).rows;
  });}
  async function markRead(actor,id,kind){if(!uuid(id)||!['review_requested','decision'].includes(kind))throw new AccessError(400);
    return tx(async run=>{await human(run,actor,['admin','operator','reviewer']);
      await run('UPDATE public.approval_notifications SET read_at=COALESCE(read_at,clock_timestamp()) WHERE request_id=$1 AND recipient_id=$2 AND kind=$3',[id,actor.id,kind]);
      return {status:'read'};
    });
  }
  async function publicationGate(actor,jobId){return tx(async run=>{
    await human(run,actor,['admin','operator']);const current=await snapshot(run,jobId);
    const a=current?.ready===true?(await run("SELECT id,state FROM public.approval_requests WHERE job_id=$1 AND snapshot_hash=$2 AND state='approved'",[jobId,fingerprint(current)])).rows[0]:null;
    return {approved_snapshot:Boolean(a),publication_authorized:false,reason:a?'MOCK_MEDIA':'CURRENT_APPROVAL_REQUIRED'};
  });}
  return {request,list,detail,decide,revise,notifications,markRead,publicationGate};
}
module.exports={createApprovalService,fingerprint};
