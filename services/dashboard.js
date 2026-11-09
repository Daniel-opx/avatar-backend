const {AccessError}=require('./team');
function createDashboardService(pool,team,{schema='public',allowScheduleActivation=false}={}){
  if(!/^[a-z][a-z0-9_]*$/.test(schema))throw new Error('Invalid schema');
  const q=s=>s.replaceAll('public.',schema+'.');
  async function tx(work){const c=await pool.connect();let broken;const run=(s,v)=>c.query(q(s),v);
    try{await run('BEGIN');const result=await work(run);await run('COMMIT');return result;}
    catch(e){try{await run('ROLLBACK');}catch(r){broken=r;}throw e;}finally{c.release(broken);}
  }
  const scheduleSQL=`SELECT c.id,c.enabled,c.frequency,c.timezone,c.next_run_at,c.default_topic,c.interval_count,
    c.local_run_time,md5(row_to_json(c)::text) AS version FROM public.schedule_config c WHERE c.id=1`;
  async function overview(actor){return tx(async run=>{await team.authorize(run,actor,['admin','operator','reviewer']);
    const jobs=(await run(`SELECT j.id,j.topic,j.status,j.created_at,p.stage,p.state AS processing_state,p.last_error,
      p.content_revision,(SELECT state FROM public.approval_requests a WHERE a.job_id=j.id AND a.revision=p.content_revision
        ORDER BY created_at DESC LIMIT 1) AS review_state,
      (SELECT state FROM public.publishing_requests r WHERE r.job_id=j.id ORDER BY created_at DESC LIMIT 1) AS mock_publication_state
      FROM public.jobs j LEFT JOIN public.job_processing p ON p.job_id=j.id ORDER BY j.created_at DESC LIMIT 100`)).rows;
    const metrics=(await run(`SELECT count(*)::int AS total,count(*) FILTER(WHERE status='ready_for_review')::int AS review,
      count(*) FILTER(WHERE status='published')::int AS published,(SELECT count(*)::int FROM public.job_processing WHERE state='failed') AS failed FROM public.jobs`)).rows[0];
    const schedule=(await run(scheduleSQL)).rows[0]||null;
    const generation=(await run(`SELECT (SELECT enabled FROM public.processing_config) AS processing,
      (SELECT enabled FROM public.content_config) AS content,(SELECT enabled FROM public.asset_config) AS assets,
      (SELECT enabled FROM public.render_config) AS rendering,(SELECT enabled FROM public.completion_config) AS completion`)).rows[0];
    return {jobs,metrics,schedule,generation,schedule_activation_allowed:allowScheduleActivation,real_publishing_enabled:false};
  });}
  async function saveSchedule(actor,body={}){
    const {version,enabled,frequency,interval_count:count,local_run_time:time,next_run_at:next,default_topic:topic}=body;
    if(!/^[a-f0-9]{32}$/.test(version||'')||typeof enabled!=='boolean'||!['once','daily','weekly'].includes(frequency)
      ||!Number.isInteger(count)||count<1||count>365||typeof topic!=='string'||topic.length>500
      ||(body.timezone&&body.timezone!=='Asia/Jerusalem')||(['daily','weekly'].includes(frequency)&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||'')))throw new AccessError(400);
    const hasNext=next!==null&&next!=='';
    if(hasNext&&(typeof next!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(next)||!Number.isFinite(Date.parse(next))))throw new AccessError(400);
    if(enabled&&(!hasNext||Date.parse(next)<=Date.now()||!topic.trim()))throw new AccessError(400);
    return tx(async run=>{await team.authorize(run,actor,['admin']);
      if(enabled&&!allowScheduleActivation)throw new AccessError(409);
      const old=(await run(scheduleSQL+' FOR UPDATE')).rows[0];if(!old)throw new AccessError(404);
      if(old.version!==version)throw new AccessError(409);
      await run(`UPDATE public.schedule_config SET enabled=$1,frequency=$2,timezone='Asia/Jerusalem',interval_count=$3,
        local_run_time=$4,next_run_at=$5,default_topic=$6,updated_at=clock_timestamp() WHERE id=1`,[
        enabled,frequency,count,frequency==='once'?null:time,hasNext?new Date(next):null,topic.trim()||null]);
      await team.audit(run,actor,'schedule_configuration_saved',null,{enabled,frequency,interval_count:count});
      return {status:'saved',schedule:(await run(scheduleSQL)).rows[0]};
    });
  }
  return {overview,saveSchedule};
}
module.exports={createDashboardService};
