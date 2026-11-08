require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const pool=require('./db/pool');
const {createProcessing}=require('./services/processing');
const {createRenderService}=require('./services/rendering');
const {RenderError}=require('./services/heygen-mock');
test('render journal and recovery with real isolated PostgreSQL and mock HeyGen',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:180000,
},async t=>{
  const schema=`step18_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',`${schema}.`),v);
  let job;let submits;let polls;let submit;let poll;
  const provider={mode:'mock',submit:args=>{submits++;return submit(args);},poll:args=>{polls++;return poll(args);}};
  const rendering=createRenderService(pool,{schema,allowMock:true,provider});
  const worker=createProcessing(pool,{render:rendering.handler},schema);
  const fixture=()=>({mode:'mock',content_revision:1,avatar_id:'mock-avatar',voice:{mode:'builtin',voice_id:'mock-voice',audio:null},
    script:'תסריט עברי מדומה',visual_plan:[{description:'דמות מדברת',duration_seconds:15}],media_ids:[]});
  const addJob=async()=>{
    const id=(await sql("INSERT INTO public.jobs(topic) VALUES('בדיקת רינדור מדומה') RETURNING id")).rows[0].id;
    const request=randomUUID();
    await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
      VALUES($1,$2,1,'succeeded',$3,'mock','mock-model',1,'{}')`,[request,id,randomUUID()]);
    await sql('INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,1,$2,$3)',[id,request,{script:fixture().script}]);
    await sql('INSERT INTO public.asset_manifests(job_id,revision,manifest) VALUES($1,1,$2)',[id,fixture()]);
    await sql("UPDATE public.job_processing SET stage='render' WHERE job_id=$1",[id]);return id;
  };
  const reset=async()=>{
    await sql('TRUNCATE public.jobs CASCADE');await sql('UPDATE public.processing_config SET enabled=true');
    await sql('UPDATE public.render_config SET enabled=true,max_submissions=20,submissions_used=0,max_polls=60,poll_after_seconds=5');
    job=await addJob();submits=0;polls=0;
    submit=async()=>({externalId:'mock_video',httpStatus:200,requestId:'mock_request'});
    poll=async()=>({status:'completed',httpStatus:200});
  };
  const due=async()=>{await sql('UPDATE public.job_processing SET next_attempt_at=now()');await sql('UPDATE public.render_requests SET next_action_at=now()');};
  const context=row=>({jobId:row.job_id,revision:row.content_revision,leaseToken:row.lease_token});
  const state=async()=>(await sql('SELECT * FROM public.job_processing WHERE job_id=$1',[job])).rows[0];
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for(const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql','20261108193747_render_requests.sql']){
      await sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    }
    await t.test('disabled rendering claims no work',async()=>{
      await reset();await sql('UPDATE public.render_config SET enabled=false');
      assert.equal((await worker.runOne()).status,'unconfigured');assert.equal(submits,0);
      assert.equal((await state()).attempts,0);
    });
    await t.test('concurrent workers create one submission and poll only the saved ID',async()=>{
      await reset();await Promise.all(Array.from({length:8},()=>worker.runOne()));
      assert.equal(submits,1);assert.equal((await rendering.history(job)).requests.length,1);
      poll=async args=>{assert.equal(args.externalId,'mock_video');return {status:'completed'};};
      await due();assert.equal((await worker.runOne()).status,'succeeded');assert.equal(submits,1);
      assert.equal((await state()).state,'succeeded');
      const result=(await sql('SELECT status,heygen_video_id,ghl_post_id FROM public.jobs WHERE id=$1',[job])).rows[0];
      assert.deepEqual(result,{status:'ready_for_review',heygen_video_id:null,ghl_post_id:null});
      assert.equal((await rendering.history(job)).calls.at(-1).estimated_cost_usd,null);
    });
    await t.test('pending polls survive restart without another submission',async()=>{
      await reset();await worker.runOne();await due();poll=async()=>({status:'processing'});
      assert.equal((await worker.runOne()).status,'waiting');
      const restarted=createProcessing(pool,{render:createRenderService(pool,{schema,allowMock:true,provider}).handler},schema);
      await due();poll=async()=>({status:'completed'});assert.equal((await restarted.runOne()).status,'succeeded');
      assert.equal(submits,1);assert.equal(polls,2);
    });
    await t.test('rate-limit retries reuse one idempotency key and stop after three submissions',async()=>{
      await reset();const keys=[];submit=async args=>{keys.push(args.idempotencyKey);throw new RenderError('HEYGEN_RATE_LIMIT',{retryable:true});};
      for(let i=1;i<=3;i++){assert.equal((await worker.runOne()).status,i<3?'retry_wait':'failed');if(i<3)await due();}
      assert.equal(submits,3);assert.equal(new Set(keys).size,1);
      await worker.control(job,'retry');await due();await worker.runOne();assert.equal(submits,3);
    });
    await t.test('lost submission response is quarantined instead of resubmitted',async()=>{
      await reset();submit=async()=>{throw new RenderError('HEYGEN_TRANSPORT',{uncertain:true});};
      assert.equal((await worker.runOne()).status,'needs_reconciliation');assert.equal(submits,1);
      assert.equal((await worker.control(job,'retry')).status,'conflict');
      assert.equal((await rendering.history(job)).requests[0].state,'needs_reconciliation');
    });
    await t.test('Retry-After prevents an early submission even if the worker becomes due',async()=>{
      await reset();submit=async()=>{throw new RenderError('HEYGEN_RATE_LIMIT',{retryable:true,retryAfterSeconds:120});};
      assert.equal((await worker.runOne()).status,'retry_wait');
      await sql('UPDATE public.job_processing SET next_attempt_at=now() WHERE job_id=$1',[job]);
      assert.equal((await worker.runOne()).status,'waiting');assert.equal(submits,1);
      const next=(await sql('SELECT next_action_at>now()+interval \'90 seconds\' AS delayed FROM public.render_requests')).rows[0];
      assert.equal(next.delayed,true);
    });
    await t.test('quota rejection stops and never invents a completed video',async()=>{
      await reset();submit=async()=>{throw new RenderError('HEYGEN_QUOTA',{httpStatus:429});};
      assert.equal((await worker.runOne()).status,'failed');assert.equal(submits,1);
      assert.equal((await rendering.history(job)).requests[0].external_video_id,null);
    });
    await t.test('checkpoint failure after acceptance reuses the durable external ID',async()=>{
      await reset();const claim=await worker.claim();const pending=await rendering.processOne(context(claim.row));
      // Simulate process exit before its processing checkpoint was saved.
      assert.equal(pending.output.external_video_id,'mock_video');
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      await worker.runOne();await due();assert.equal((await worker.runOne()).status,'succeeded');
      assert.equal(submits,1);assert.equal(polls,1);
      assert.equal((await worker.finish(claim.row,pending)).status,'stale');
    });
    await t.test('unfinished submission reservation after restart cannot submit again',async()=>{
      await reset();let lose=true;
      const flaky={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return{
        async query(s,v){const r=await c.query(s,v);if(s==='COMMIT'&&lose){lose=false;throw Object.assign(new Error('lost acknowledgement'),{code:'ECONNRESET'});}return r;},
        release:e=>c.release(e),};}};
      const service=createRenderService(flaky,{schema,allowMock:true,provider});
      const flakyWorker=createProcessing(pool,{render:service.handler},schema);
      assert.equal((await flakyWorker.runOne()).status,'failed');assert.equal(submits,0);
      await worker.control(job,'retry');assert.equal((await worker.runOne()).status,'needs_reconciliation');assert.equal(submits,0);
    });
    await t.test('failed provider render is terminal and does not submit a replacement',async()=>{
      await reset();await worker.runOne();await due();poll=async()=>({status:'failed'});
      assert.equal((await worker.runOne()).status,'failed');
      await worker.control(job,'retry');await due();await worker.runOne();assert.equal(submits,1);
    });
    await t.test('lost acceptance commit acknowledgement retains the ID for polling',async()=>{
      await reset();let commits=0;
      const flaky={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return{
        async query(s,v){const r=await c.query(s,v);if(s==='COMMIT'&&++commits===2)throw Object.assign(new Error('lost acceptance acknowledgement'),{code:'ECONNRESET'});return r;},
        release:e=>c.release(e),};}};
      const service=createRenderService(flaky,{schema,allowMock:true,provider});
      const w=createProcessing(pool,{render:service.handler},schema);
      assert.equal((await w.runOne()).status,'failed');assert.equal(submits,1);
      assert.equal((await rendering.history(job)).requests[0].external_video_id,'mock_video');
      await worker.control(job,'retry');await due();assert.equal((await worker.runOne()).status,'succeeded');
      assert.equal(submits,1);assert.equal(polls,1);
    });
    await t.test('completed journal survives final checkpoint rollback without another provider call',async()=>{
      await reset();await worker.runOne();await due();const claim=await worker.claim();
      const output=await rendering.processOne(context(claim.row));
      await sql("ALTER TABLE public.job_processing ADD CONSTRAINT injected CHECK(stage='render')");
      await assert.rejects(worker.finish(claim.row,output),{code:'23514'});
      assert.equal((await rendering.history(job)).requests[0].state,'completed');
      await sql('ALTER TABLE public.job_processing DROP CONSTRAINT injected');
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      await worker.runOne();await due();assert.equal((await worker.runOne()).status,'succeeded');
      assert.equal(submits,1);assert.equal(polls,1);
    });
    await t.test('a late polling response cannot overwrite a newer completed result',async()=>{
      await reset();await worker.runOne();await due();const claim=await worker.claim();
      let resolveOld;let started;
      const waiting=new Promise(resolve=>{started=resolve;});
      poll=()=>new Promise(resolve=>{resolveOld=resolve;started();});
      const old=rendering.processOne(context(claim.row));await waiting;
      await sql("UPDATE public.job_processing SET lease_until=now()-interval '1 second' WHERE job_id=$1",[job]);
      await worker.runOne();await due();poll=async()=>({status:'completed'});
      assert.equal((await worker.runOne()).status,'succeeded');
      resolveOld({status:'failed'});const oldOutput=await old;
      assert.equal((await worker.finish(claim.row,oldOutput)).status,'stale');
      const h=await rendering.history(job);assert.equal(h.requests[0].state,'completed');
      assert.ok(h.calls.some(c=>c.outcome==='interrupted'));assert.equal(submits,1);
    });
    await t.test('transient polling errors keep the ID; repeated failures require reconciliation',async()=>{
      await reset();await worker.runOne();poll=async()=>{throw new RenderError('HEYGEN_TRANSPORT',{retryable:true});};
      for(let i=1;i<=3;i++){await due();assert.equal((await worker.runOne()).status,i<3?'waiting':'needs_reconciliation');}
      assert.equal(submits,1);assert.equal(polls,3);
    });
    await t.test('poll and submission allowances are bounded across concurrent work',async()=>{
      await reset();await sql('UPDATE public.render_config SET max_submissions=1,max_polls=1');
      await addJob();await Promise.all(Array.from({length:8},()=>worker.runOne()));assert.equal(submits,1);
      job=(await sql("SELECT job_id FROM public.render_requests WHERE external_video_id='mock_video'")).rows[0].job_id;
      poll=async()=>({status:'processing'});await due();await worker.runOne();await due();
      assert.equal((await worker.runOne()).status,'needs_reconciliation');assert.equal(submits,1);assert.equal(polls,1);
    });
    await t.test('render tables have RLS and deny public client reads',async()=>{
      const rows=(await pool.query(`SELECT c.relrowsecurity,
        has_table_privilege('anon',c.oid,'SELECT') AS anon,has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
        AND c.relname=ANY($2::text[])`,[schema,['render_config','render_requests','render_calls']])).rows;
      assert.equal(rows.length,3);assert.ok(rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
