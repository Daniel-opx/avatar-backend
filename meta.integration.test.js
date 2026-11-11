require('dotenv').config({quiet:true});
const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');const path=require('node:path');
const pool=require('./db/pool');const {createFixture}=require('./test-support/dashboard-fixture');
const {createMetaService}=require('./services/meta');const {createMockMeta}=require('./services/meta-mock');
const migration='20261111125826_mock_meta_campaigns.sql';
const spec=()=>({name:'בדיקת מודעות בלבד',account_id:'mock_account',page_id:'mock_page',video_id:'mock_video',currency:'ILS',
  lifetime_budget_minor:5000,start_time:new Date(Date.now()+86400000).toISOString(),end_time:new Date(Date.now()+3*86400000).toISOString(),country:'IL',link:'https://example.invalid/offer'});
test('approval-gated paused Meta campaigns with isolated PostgreSQL',{skip:process.env.RUN_DB_TESTS!=='1',timeout:240000},async t=>{
  let f,server;try{
    f=await createFixture(pool);await f.sql(readFileSync(path.join(__dirname,'supabase/migrations',migration),'utf8'));
    const {actors,job,sql}=f;
    await sql('UPDATE public.meta_config SET enabled=true,max_drafts=20,max_lifetime_minor=10000');
    const calls=[],objects=new Map();let failCreate=false,failRead=false,rateCreate=false;
    const provider=createMockMeta({transport:{mode:'mock',async request(url,options){
      calls.push({url,...options});if(options.method==='POST'){
        if(failCreate)throw Error('PRIVATE');if(rateCreate)return Response.json({error:{code:4}},{status:429});
        const id='mock_'+randomUUID().replaceAll('-','');const value={id,status:url.endsWith('/adcreatives')?undefined:'PAUSED'};
        objects.set(id,value);return Response.json(value);
      }
      if(failRead)return new Response(JSON.stringify({error:{code:4,message:'PRIVATE'}}),{status:429,headers:{'retry-after':'120'}});
      return Response.json(objects.get(url.split('/').at(-1).split('?')[0]));
    }}});
    const service=createMetaService(pool,f.team,{schema:f.schema,allowMock:true,provider});
    const a=await f.approvals.request(actors.operator,job,randomUUID());
    const approveContent=()=>f.approvals.decide(actors.reviewer,job,a.id,{request_key:randomUUID(),action:'approved',expected_hash:a.snapshot_hash});
    const body=(s=spec())=>({request_key:randomUUID(),approval_id:a.id,spec:s});
    const budget=(d,actor=actors.admin)=>service.decide(actor,d.id,'budget',{request_key:randomUUID(),expected_hash:d.spec_hash,confirmation:'APPROVE_MOCK_BUDGET'});
    let draft;
    await t.test('content approval precedes draft; disabled config/adapter and default allowance deny operations',async()=>{
      await assert.rejects(service.propose(actors.operator,job,body()),{status:409});assert.equal(calls.length,0);
      await approveContent();
      assert.equal((await createMetaService(pool,f.team,{schema:f.schema}).propose(actors.operator,job,body())).status,'disabled');
      await sql('UPDATE public.meta_config SET enabled=false');assert.equal((await service.propose(actors.operator,job,body())).status,'disabled');
      await sql('UPDATE public.meta_config SET enabled=true,max_drafts=0');await assert.rejects(service.propose(actors.operator,job,body()),{status:409});
      await sql('UPDATE public.meta_config SET max_drafts=20');
    });
    await t.test('concurrent draft retries reserve one allowance; owner/reviewer cannot propose',async()=>{
      const b=body(),rows=await Promise.all(Array.from({length:5},()=>service.propose(actors.operator,job,b)));
      draft=rows[0];assert.ok(rows.every(d=>d.id===draft.id));assert.equal((await sql('SELECT drafts_used FROM public.meta_config')).rows[0].drafts_used,1);
      await assert.rejects(service.propose(actors.reviewer,job,body()),{status:403});
      await assert.rejects(service.propose({kind:'service'},job,body()),{status:401});
      await assert.rejects(service.propose(actors.operator,job,{...b,spec:{...b.spec,lifetime_budget_minor:6000}}),{status:409});
    });
    await t.test('budget review is exact-spec admin-only and separate from activation review',async()=>{
      await assert.rejects(service.advance(actors.operator,draft.id),{status:409});
      await assert.rejects(budget(draft,actors.operator),{status:403});
      await assert.rejects(budget({...draft,spec_hash:'0'.repeat(64)}),{status:409});
      await budget(draft);await budget(draft);
      await assert.rejects(service.decide(actors.admin,draft.id,'activation',{request_key:randomUUID(),expected_hash:draft.spec_hash,confirmation:'REVIEW_MOCK_ACTIVATION'}),{status:409});
    });
    await t.test('overlapping prepare requests persist each of four mock IDs once, always paused; activation stays locked',async()=>{
      const rows=await Promise.all(Array.from({length:6},()=>service.advance(actors.operator,draft.id)));
      assert.ok(rows.some(r=>r.status==='prepared'));
      for(let i=0;i<4;i++){const result=await service.advance(actors.operator,draft.id);if(result.status==='paused')break;assert.equal(result.status,'prepared');}
      assert.equal((await service.advance(actors.operator,draft.id)).status,'paused');
      const d=await service.detail(actors.reviewer,draft.id);assert.equal(d.operations.length,4);assert.ok(d.operations.every(o=>o.external_id.startsWith('mock_')));
      assert.equal(d.real_spend_minor,0);assert.equal(d.activation_authorized,false);
      const sent=calls.filter(c=>c.method==='POST').map(c=>JSON.parse(c.body));assert.ok(sent.filter(p=>p.object_story_spec===undefined).every(p=>p.status==='PAUSED'));
      for(const edge of ['campaigns','adsets','adcreatives','ads'])assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/'+edge)).length,1);
      await service.decide(actors.admin,draft.id,'activation',{request_key:randomUUID(),expected_hash:draft.spec_hash,confirmation:'REVIEW_MOCK_ACTIVATION'});
      assert.equal((await service.activate(actors.admin,draft.id)).status,'activation_locked');
      assert.equal(calls.filter(c=>c.method==='POST').length,4);
      assert.equal((await sql('SELECT ghl_post_id,status FROM public.jobs WHERE id=$1',[job])).rows[0].status,'ready_for_review');
    });
    await t.test('changed budget requires a new draft and fresh budget review; partial progress survives service restart',async()=>{
      const old=await service.detail(actors.admin,draft.id),next=await service.propose(actors.operator,job,body({...spec(),lifetime_budget_minor:6000}));
      await assert.rejects(service.advance(actors.operator,next.id),{status:409});await budget(next);
      await service.advance(actors.operator,next.id);
      const restarted=createMetaService(pool,f.team,{schema:f.schema,allowMock:true,provider});
      assert.equal((await restarted.advance(actors.operator,next.id)).stage,'adset');
      assert.equal((await service.detail(actors.admin,draft.id)).spec.lifetime_budget_minor,old.spec.lifetime_budget_minor);
    });
    await t.test('lost reservation commit acknowledgement does not create or retry a campaign',async()=>{
      const d=await service.propose(actors.operator,job,body());await budget(d);let lose=true;
      const flaky={async connect(){const c=await pool.connect();return {async query(s,v){const r=await c.query(s,v);
        if(s==='COMMIT'&&lose){lose=false;throw Object.assign(new Error('Lost acknowledgement'),{code:'ECONNRESET'});}return r;},release:e=>c.release(e)};}};
      const restarted=createMetaService(flaky,f.team,{schema:f.schema,allowMock:true,provider}),n=calls.length;
      await assert.rejects(restarted.advance(actors.operator,d.id),{code:'ECONNRESET'});
      assert.equal((await service.advance(actors.operator,d.id)).status,'submitting');assert.equal(calls.length,n);
      await sql("UPDATE public.meta_operations SET lease_until=now()-interval '1 second' WHERE draft_id=$1",[d.id]);
      assert.equal((await service.advance(actors.operator,d.id)).status,'needs_reconciliation');assert.equal(calls.length,n);
    });
    await t.test('unknown writes and creation throttles stop without resubmission; expired reservations quarantine',async()=>{
      for(const rate of [false,true]){
        const d=await service.propose(actors.operator,job,body());await budget(d);failCreate=!rate;rateCreate=rate;
        assert.equal((await service.advance(actors.operator,d.id)).status,'needs_reconciliation');failCreate=false;rateCreate=false;
        const count=calls.length;await service.advance(actors.operator,d.id);const op=(await service.detail(actors.admin,d.id)).operations[0];
        assert.equal((await service.reconcile(actors.operator,d.id,op.id)).status,'manual_reconciliation_required');assert.equal(calls.length,count);
      }
      const d=await service.propose(actors.operator,job,body());await budget(d);
      await sql("INSERT INTO public.meta_operations(id,draft_id,stage,state,payload,token,lease_until) VALUES($1,$2,'campaign','submitting','{}',$3,now()-interval '1 minute')",[randomUUID(),d.id,randomUUID()]);
      const count=calls.length;assert.equal((await service.advance(actors.operator,d.id)).status,'needs_reconciliation');assert.equal(calls.length,count);
    });
    await t.test('known-ID inspection backs off and stops after three checks without create retries',async()=>{
      const operations=(await service.detail(actors.admin,draft.id)).operations,op=operations[0],posts=calls.filter(c=>c.method==='POST').length;
      assert.equal((await service.reconcile(actors.operator,draft.id,operations[1].id)).status,'verified_paused');failRead=true;
      assert.equal((await service.reconcile(actors.operator,draft.id,op.id)).error_code,'META_RATE_LIMITED');
      const n=calls.length;assert.equal((await service.reconcile(actors.operator,draft.id,op.id)).status,'not_due');assert.equal(calls.length,n);
      for(let i=0;i<2;i++){await sql("UPDATE public.meta_operations SET next_check_at=now()-interval '1 second' WHERE id=$1",[op.id]);await service.reconcile(actors.operator,draft.id,op.id);}
      await sql("UPDATE public.meta_operations SET next_check_at=now()-interval '1 second' WHERE id=$1",[op.id]);assert.equal((await service.reconcile(actors.operator,draft.id,op.id)).status,'check_limit');failRead=false;
      assert.equal(calls.filter(c=>c.method==='POST').length,posts);
    });
    await t.test('revoked sessions and changed approved content block new campaign work',async()=>{
      const d=await service.propose(actors.operator,job,body());await budget(d);
      await sql("UPDATE public.content_versions SET package=jsonb_set(package,'{caption}','\"שונה אחרי אישור\"') WHERE job_id=$1",[job]);
      await assert.rejects(service.advance(actors.operator,d.id),{status:409});
      await assert.rejects(service.decide(actors.admin,d.id,'budget',{request_key:randomUUID(),expected_hash:d.spec_hash,confirmation:'APPROVE_MOCK_BUDGET'}),{status:409});
      await sql('UPDATE public.team_sessions SET revoked_at=now() WHERE token_hash=$1',[actors.operator.sessionHash]);
      await assert.rejects(service.advance(actors.operator,d.id),{status:401});
    });
    await t.test('HTTP routes enforce sessions/roles/CSRF; four tables deny client access',async()=>{
      const express=require('express'),app=express();app.use(express.json());app.use('/team',require('./routes/meta')(require('./middleware/teamAuth').createTeamAuth(f.team),service));
      server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
      const url=base+'/team/meta/drafts/'+draft.id;
      assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-api-key':process.env.API_KEY||'owner'}})).status,401);
      const cookie='avatar_session='+f.logins.admin.token;
      assert.equal((await fetch(url,{headers:{cookie}})).status,200);
      assert.equal((await fetch(url+'/activate',{method:'POST',headers:{cookie}})).status,403);
      assert.equal((await fetch(url+'/activate',{method:'POST',headers:{cookie,'x-csrf-token':f.logins.admin.csrf}})).status,503);
      const privateTables=(await sql("SELECT bool_and(relrowsecurity AND NOT has_table_privilege('anon',oid,'SELECT') AND NOT has_table_privilege('authenticated',oid,'SELECT')) AS private FROM pg_class WHERE relnamespace=$1::regnamespace AND relname=ANY($2)",[f.schema,['meta_config','meta_drafts','meta_decisions','meta_operations']])).rows[0];assert.equal(privateTables.private,true);
      assert.ok((await sql("SELECT count(*)::int AS n FROM public.audit_events WHERE action LIKE 'mock_meta_%'")).rows[0].n>0);
    });
  }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}if(f)await f.cleanup();await pool.end();}
});
