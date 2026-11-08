require('dotenv').config({quiet:true});
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHmac}=require('node:crypto');
const {readFileSync}=require('node:fs');
const pool=require('./db/pool');
const {createCompletionService}=require('./services/completion');
const {createMockVideoStore}=require('./test-support/mock-video-store');
test('webhook and retained media recovery with isolated PostgreSQL and mock adapters',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:180000,
},async t=>{
  const schema=`step19_test_${randomUUID().replaceAll('-','')}`;
  const sql=(s,v)=>pool.query(s.replaceAll('public.',`${schema}.`),v);
  const secret='local-test-secret-never-a-live-provider-key';
  let job,id,store,service,detail,reads;
  const event=(type='avatar_video.success',extra={})=>Buffer.from(JSON.stringify({event_type:type,event_data:{video_id:'mock_test',callback_id:id,url:'http://127.0.0.1/private',...extra}}));
  const receive=(raw=event())=>service.receive(raw,createHmac('sha256',secret).update(raw).digest('hex'));
  const due=()=>sql('UPDATE public.video_media SET next_check_at=now()');
  async function reset({known=true}={}){
    await sql('TRUNCATE public.jobs CASCADE');await sql('TRUNCATE public.webhook_events');
    await sql('UPDATE public.completion_config SET enabled=true');
    job=(await sql("INSERT INTO public.jobs(topic) VALUES('בדיקת השלמה מדומה') RETURNING id")).rows[0].id;
    const cr=randomUUID();id=randomUUID();
    await sql(`INSERT INTO public.content_requests(id,job_id,revision,state,token,provider,model,prompt_version,input_snapshot)
      VALUES($1,$2,1,'succeeded',$3,'mock','mock-model',1,'{}')`,[cr,job,randomUUID()]);
    await sql("INSERT INTO public.content_versions(job_id,revision,request_id,package) VALUES($1,1,$2,'{}')",[job,cr]);
    await sql("INSERT INTO public.asset_manifests(job_id,revision,manifest) VALUES($1,1,'{}')",[job]);
    await sql(`INSERT INTO public.render_requests(id,job_id,revision,state,token,payload,external_video_id,max_polls,poll_after_seconds)
      VALUES($1,$2,1,$3,$4,'{}',$5,60,5)`,[id,job,known?'pending':'needs_reconciliation',randomUUID(),known?'mock_test':null]);
    await sql("UPDATE public.job_processing SET stage='render' WHERE job_id=$1",[job]);
    detail={status:'completed',externalId:'mock_test',callbackId:id,durationSeconds:15};reads=0;
    store=createMockVideoStore();
    service=createCompletionService(pool,{schema,allowMock:true,secret,store,provider:{mode:'mock',async inspect(){reads++;return {...detail};}}});
  }
  try{
    await pool.query(`CREATE SCHEMA ${schema}`);await pool.query(`CREATE TABLE ${schema}.jobs (LIKE public.jobs INCLUDING ALL)`);
    for(const file of ['20261106073647_durable_processing.sql','20261108184837_versioned_content.sql','20261108191748_asset_preparation.sql','20261108193747_render_requests.sql','20261108200903_webhook_media.sql'])await sql(readFileSync(`supabase/migrations/${file}`,'utf8'));
    await t.test('invalid authentication touches no inbox and disabled configuration accepts no events',async()=>{
      await reset();assert.equal((await service.receive(event(),'bad')).status,'unauthorized');
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.webhook_events')).rows[0].n,0);
      await sql('UPDATE public.completion_config SET enabled=false');assert.equal((await receive()).status,'disabled');
      assert.equal((await service.reconcile(id)).status,'disabled');assert.equal(reads,0);
    });
    await t.test('concurrent deliveries and reconcilers retain one logical event and one object',async()=>{
      await reset();const responses=await Promise.all(Array.from({length:8},()=>receive()));
      assert.equal(responses.filter(r=>r.status==='accepted').length,1);
      const results=await Promise.all(Array.from({length:8},()=>service.reconcile(id)));
      assert.ok(results.some(r=>r.status==='ready'));assert.equal(store.copies,1);assert.equal(reads,1);
      const result=(await sql('SELECT status,heygen_video_id FROM public.jobs WHERE id=$1',[job])).rows[0];
      assert.deepEqual(result,{status:'ready_for_review',heygen_video_id:null});
      assert.equal((await sql('SELECT count(*)::int AS n FROM public.webhook_events')).rows[0].n,1);
      assert.equal(JSON.stringify(await service.history(job)).includes('127.0.0.1'),false);
    });
    await t.test('unknown resources never mutate jobs and callback IDs cannot cross jobs',async()=>{
      await reset();assert.equal((await receive(event('avatar_video.success',{video_id:'mock_other',callback_id:null}))).status,'accepted');
      assert.equal((await sql("SELECT state FROM public.webhook_events")).rows[0].state,'unmatched');
      assert.equal((await receive(event('avatar_video.success',{callback_id:randomUUID()}))).status,'conflict');
      assert.equal((await sql('SELECT state FROM public.render_requests')).rows[0].state,'pending');
    });
    await t.test('an early callback requires authoritative matching identity before attachment',async()=>{
      await reset({known:false});await receive();assert.equal((await service.reconcile(id)).status,'ready');
      assert.equal((await sql('SELECT external_video_id FROM public.render_requests')).rows[0].external_video_id,'mock_test');
      await reset({known:false});await receive();detail.callbackId=null;
      assert.equal((await service.reconcile(id)).status,'failed');assert.equal(store.copies,0);
      assert.equal((await sql('SELECT external_video_id FROM public.render_requests')).rows[0].external_video_id,null);
    });
    await t.test('out-of-order failure signals cannot override authoritative success',async()=>{
      await reset();await receive(event('avatar_video.fail'));await receive();
      assert.equal((await service.reconcile(id)).status,'ready');
      assert.deepEqual((await sql('SELECT state FROM public.webhook_events ORDER BY event_type')).rows.map(r=>r.state),['ignored','processed']);
      await receive(event('avatar_video.fail'));assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);
    });
    await t.test('missed callbacks use known IDs; pending status waits and actual failure remains terminal',async()=>{
      await reset();detail.status='processing';assert.equal((await service.reconcile(id)).status,'waiting');assert.equal(store.copies,0);
      assert.equal((await service.reconcile(id)).status,'not_due');await due();detail.status='failed';
      assert.equal((await service.reconcile(id)).status,'failed');assert.equal((await sql('SELECT status FROM public.jobs')).rows[0].status,'failed');
      assert.equal((await service.issueReview(job)).status,'unavailable');assert.equal((await service.retryMedia(job)).status,'conflict');
      await reset();assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);
    });
    await t.test('bounded storage failures retry media without another render or overwriting retained objects',async()=>{
      await reset();const copy=store.copy.bind(store);store.copy=async args=>{await copy(args);throw new Error('Lost copy acknowledgement');};
      for(let i=0;i<3;i++){assert.equal((await service.reconcile(id)).status,i===2?'failed':'queued');await due();}
      assert.equal(store.copies,1);assert.equal((await service.reconcile(id)).status,'retry_required');
      assert.equal((await service.retryMedia(job)).status,'queued');store.copy=copy;
      assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);
    });
    await t.test('terminal status never regresses after storage failure',async()=>{
      await reset();store.copy=async()=>{throw new Error();};await service.reconcile(id);await due();detail.status='processing';
      assert.equal((await service.reconcile(id)).status,'failed');
      assert.equal((await sql('SELECT state FROM public.render_requests')).rows[0].state,'completed');
    });
    await t.test('exhausted read failures can be explicitly reset for a known pending video',async()=>{
      await reset();const recovering=createCompletionService(pool,{schema,allowMock:true,secret,store,
        provider:{mode:'mock',async inspect(){throw new Error('Mock outage');}}});
      for(let i=0;i<3;i++){assert.equal((await recovering.reconcile(id)).status,i===2?'failed':'queued');await due();}
      assert.equal((await service.reconcile(id)).status,'retry_required');
      assert.equal((await service.retryMedia(job)).status,'queued');
      assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);
    });
    await t.test('review grants are hashed, expiring, revocable and bound to current uncancelled revision',async()=>{
      await reset();await service.reconcile(id);let grant=await service.issueReview(job);let token=grant.url.split('/').at(-1);
      assert.equal((await service.readReview(token)).status,'ready');
      assert.notEqual((await sql('SELECT token_hash FROM public.review_grants')).rows[0].token_hash,token);
      assert.equal((await service.readReview('z'.repeat(43))).status,'not_found');
      await sql("UPDATE public.review_grants SET expires_at=now()-interval '1 second'");assert.equal((await service.readReview(token)).status,'not_found');
      grant=await service.issueReview(job);token=grant.url.split('/').at(-1);await service.retryMedia(job);
      assert.equal((await service.readReview(token)).status,'not_found');await service.reconcile(id);
      grant=await service.issueReview(job);token=grant.url.split('/').at(-1);
      const read=store.read;store.read=async()=>Buffer.from('CORRUPT');assert.equal((await service.readReview(token)).status,'unavailable');store.read=read;
      await sql('UPDATE public.job_processing SET content_revision=2');assert.equal((await service.readReview(token)).status,'not_found');
      await sql('UPDATE public.job_processing SET content_revision=1');
      await sql("UPDATE public.job_processing SET state='cancelled'");assert.equal((await service.readReview(token)).status,'not_found');
    });
    await t.test('expired media leases recover and private tables enforce complete metadata',async()=>{
      await reset();await sql("INSERT INTO public.video_media(render_request_id,state,token,lease_until) VALUES($1,'running',$2,now()-interval '1 second')",[id,randomUUID()]);
      assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);
      const rows=(await sql("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon,has_table_privilege('authenticated',oid,'SELECT') AS authenticated FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('completion_config','webhook_events','video_media','review_grants')",[schema])).rows;
      assert.equal(rows.length,4);assert.ok(rows.every(r=>r.relrowsecurity&&!r.anon&&!r.authenticated));
      await assert.rejects(sql('UPDATE public.video_media SET sha256=NULL WHERE render_request_id=$1',[id]),{code:'23514'});
    });
    await t.test('cancellation during retention prevents promotion or review access',async()=>{
      await reset();const copy=store.copy.bind(store);
      store.copy=async args=>{const metadata=await copy(args);await sql("UPDATE public.job_processing SET state='cancelled'");return metadata;};
      assert.equal((await service.reconcile(id)).status,'failed');
      assert.equal((await service.issueReview(job)).status,'unavailable');
      assert.equal((await sql('SELECT status FROM public.jobs')).rows[0].status,'draft');
    });
    await t.test('lost final commit acknowledgement recovers without fetching or copying again',async()=>{
      await reset();let commits=0;
      const flaky={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return{
        async query(s,v){const result=await c.query(s,v);if(s==='COMMIT'&&++commits===3)throw Object.assign(new Error('Lost acknowledgement'),{code:'ECONNRESET'});return result;},
        release:e=>c.release(e),
      };}};
      const recovering=createCompletionService(flaky,{schema,allowMock:true,secret,store,provider:{mode:'mock',async inspect(){reads++;return detail;}}});
      await assert.rejects(recovering.reconcile(id),{code:'ECONNRESET'});
      assert.equal((await service.reconcile(id)).status,'ready');assert.equal(store.copies,1);assert.equal(reads,1);
    });
  }finally{await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();}
});
