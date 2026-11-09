require('dotenv').config({quiet:true});const {test}=require('node:test');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const pool=require('./db/pool');const {createFixture}=require('./test-support/dashboard-fixture');
test('dashboard access, scheduling and approval-gated mock GHL journal',{
  skip:process.env.RUN_DB_TESTS!=='1',timeout:240000,
},async t=>{
  let f,server;try{f=await createFixture(pool);const {actors,job,sql}=f;
    const approve=async()=>{const a=await f.approvals.request(actors.operator,job,randomUUID());await f.approvals.decide(actors.reviewer,job,a.id,{request_key:randomUUID(),action:'approved',expected_hash:a.snapshot_hash});return a;};
    await t.test('dashboard metrics and data are team-only; scheduler activation and lost updates are blocked',async()=>{
      const view=await f.dashboard.overview(actors.reviewer);assert.equal(view.jobs.length,3);assert.equal(view.metrics.total,3);assert.equal(view.metrics.published,0);
      const body={version:view.schedule.version,enabled:false,frequency:'daily',interval_count:2,local_run_time:'09:00',next_run_at:'2026-12-01T09:00:00+02:00',default_topic:'בדיקת תזמון'};
      await assert.rejects(f.dashboard.saveSchedule(actors.operator,body),{status:403});
      const saved=await f.dashboard.saveSchedule(actors.admin,body);assert.equal(saved.schedule.enabled,false);assert.equal(saved.schedule.timezone,'Asia/Jerusalem');
      await assert.rejects(f.dashboard.saveSchedule(actors.admin,body),{status:409});
      await assert.rejects(f.dashboard.saveSchedule(actors.admin,{...body,version:saved.schedule.version,enabled:true}),{status:409});
      await assert.rejects(f.dashboard.saveSchedule(actors.admin,{...body,version:saved.schedule.version,next_run_at:'2026-12-01T09:00'}),{status:400});
    });
    let approval;
    await t.test('no approval means no adapter call; reviewer cannot submit and overlapping retries create one mock post',async()=>{
      const pending=await f.approvals.request(actors.operator,job,randomUUID());
      const body={request_key:randomUUID(),approval_id:pending.id,account_id:'mock_facebook'};
      await assert.rejects(f.publishing.submit(actors.operator,job,body),{status:409});assert.equal(f.counters.submits,0);
      await f.approvals.decide(actors.reviewer,job,pending.id,{request_key:randomUUID(),action:'approved',expected_hash:pending.snapshot_hash});approval=pending;
      await assert.rejects(f.publishing.submit(actors.reviewer,job,body),{status:403});
      const rows=await Promise.all(Array.from({length:6},()=>f.publishing.submit(actors.operator,job,body)));
      assert.equal(f.counters.submits,1);assert.ok(rows.every(r=>r.real_post_created===false));
      const record=(await f.publishing.history(actors.reviewer,job))[0];assert.equal(record.state,'published');assert.equal(record.mode,'mock');
      assert.deepEqual((await sql('SELECT status,ghl_post_id FROM public.jobs WHERE id=$1',[job])).rows[0],{status:'ready_for_review',ghl_post_id:null});
      const repeat=await f.publishing.submit(actors.operator,job,{...body,request_key:randomUUID()});assert.equal(repeat.replay,true);assert.equal(f.counters.submits,1);
    });
    await t.test('changed content cannot submit under an old approval',async()=>{
      await sql("UPDATE public.content_versions SET package=jsonb_set(package,'{caption}','\"כיתוב ששונה\"') WHERE job_id=$1",[job]);
      await assert.rejects(f.publishing.submit(actors.operator,job,{request_key:randomUUID(),approval_id:approval.id,account_id:'mock_facebook'}),{status:409});assert.equal(f.counters.submits,1);
    });
    await t.test('scheduled mock posts reconcile using a saved ID without another submission',async()=>{
      approval=await approve();const result=await f.publishing.submit(actors.operator,job,{request_key:randomUUID(),approval_id:approval.id,account_id:'mock_facebook',schedule_date:'2026-12-10T09:00:00+02:00'});
      assert.equal(result.state,'scheduled');const calls=f.counters.submits;
      f.counters.failRead=true;assert.equal((await f.publishing.reconcile(actors.operator,job,result.id)).status,'status_unavailable');
      assert.equal((await f.publishing.reconcile(actors.operator,job,result.id)).status,'not_due');
      await sql('UPDATE public.publishing_requests SET next_check_at=now() WHERE id=$1',[result.id]);f.counters.failRead=false;
      f.posts.get(result.external_post_id).status='published';assert.equal((await f.publishing.reconcile(actors.operator,job,result.id)).state,'published');assert.equal(f.counters.submits,calls);
      const originalNow=Date.now;Date.now=()=>Date.parse('2027-01-01T00:00:00Z');
      try{const replay=await f.publishing.submit(actors.operator,job,{request_key:randomUUID(),approval_id:approval.id,account_id:'mock_facebook',schedule_date:'2026-12-10T09:00:00+02:00'});assert.equal(replay.replay,true);assert.equal(f.counters.submits,calls);}finally{Date.now=originalNow;}
    });
    await t.test('uncertain submissions are quarantined and never retried as new posts',async()=>{
      await sql("UPDATE public.content_versions SET package=jsonb_set(package,'{caption}','\"כיתוב נוסף\"') WHERE job_id=$1",[job]);approval=await approve();
      f.counters.failSubmit=true;const body={request_key:randomUUID(),approval_id:approval.id,account_id:'mock_facebook'};
      assert.equal((await f.publishing.submit(actors.operator,job,body)).status,'needs_reconciliation');const calls=f.counters.submits;
      assert.equal((await f.publishing.submit(actors.operator,job,body)).status,'needs_reconciliation');assert.equal(f.counters.submits,calls);
      await assert.rejects(sql("UPDATE public.jobs SET status='published' WHERE id=$1",[job]),{code:'23514'});
    });
    await t.test('lost reservation acknowledgement cannot cause a replacement post after restart',async()=>{
      await sql("UPDATE public.content_versions SET package=jsonb_set(package,'{caption}','\"בדיקת התאוששות\"') WHERE job_id=$1",[job]);approval=await approve();
      let lose=true;const flaky={query:pool.query.bind(pool),async connect(){const c=await pool.connect();return{
        async query(s,v){const r=await c.query(s,v);if(s==='COMMIT'&&lose){lose=false;throw Object.assign(new Error('Lost acknowledgement'),{code:'ECONNRESET'});}return r;},release:e=>c.release(e),
      };}};
      const service=require('./services/publishing').createPublishingService(flaky,f.team,{schema:f.schema,allowMock:true,provider:f.provider});
      const body={request_key:randomUUID(),approval_id:approval.id,account_id:'mock_facebook'},calls=f.counters.submits;
      await assert.rejects(service.submit(actors.operator,job,body),{code:'ECONNRESET'});
      assert.equal((await f.publishing.submit(actors.operator,job,body)).status,'submitting');
      await sql("UPDATE public.publishing_requests SET lease_until=now()-interval '1 second' WHERE id=$1",[body.request_key]);
      assert.equal((await f.publishing.submit(actors.operator,job,body)).status,'needs_reconciliation');assert.equal(f.counters.submits,calls);
    });
    await t.test('HTTP pages, CSRF and role boundaries work without exposing server keys',async()=>{
      server=f.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
      const page=await fetch(base+'/dashboard/');assert.equal(page.status,200);const html=await page.text();assert.match(html,/dir="rtl"/);assert.equal(html.includes('x-api-key'),false);
      assert.equal((await fetch(base+'/dashboard/app.js')).status,200);assert.equal((await fetch(base+'/team/dashboard')).status,401);
      const login=await fetch(base+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'reviewer@mock.invalid',password:'demo-only'})});
      const person=await login.json(),cookie=login.headers.getSetCookie().find(s=>s.startsWith('avatar_session=')).split(';')[0];
      const headers={cookie,'content-type':'application/json','x-csrf-token':person.csrf_token};
      assert.equal((await fetch(base+'/team/dashboard',{headers})).status,200);
      assert.equal((await fetch(base+'/team/schedule',{method:'PUT',headers,body:'{}'})).status,403);
      assert.equal((await fetch(base+'/team/jobs/'+job+'/publishing',{method:'POST',headers,body:'{}'})).status,403);
      assert.equal((await fetch(base+'/team/processing/run',{method:'POST',headers})).status,403);
      const rows=(await sql("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS anon FROM pg_class WHERE relnamespace=$1::regnamespace AND relname IN ('publishing_config','publishing_accounts','publishing_requests')",[f.schema])).rows;
      assert.equal(rows.length,3);assert.ok(rows.every(r=>r.relrowsecurity&&!r.anon));
    });
  }finally{if(server)await new Promise(r=>server.close(r));if(f)await f.cleanup();await pool.end();}
});
