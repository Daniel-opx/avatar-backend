const {test}=require('node:test');const assert=require('node:assert/strict');
const {validateSpec,buildOperation,createMockMeta,apiVersion}=require('./services/meta-mock');
const spec=()=>({name:'בדיקת קמפיין',account_id:'mock_account',page_id:'mock_page',video_id:'mock_video',currency:'ILS',
  lifetime_budget_minor:5000,start_time:'2027-01-01T09:00:00+02:00',end_time:'2027-01-02T09:00:00+02:00',country:'IL',link:'https://example.invalid/offer'});
test('Meta mock campaign validation fixes paused traffic scope and integer ILS budget',()=>{
  const s=validateSpec(spec());assert.equal(s.status,'PAUSED');assert.equal(s.start_time,'2027-01-01T07:00:00.000Z');
  for(const changes of [{currency:'USD'},{lifetime_budget_minor:2.5},{lifetime_budget_minor:0},{account_id:'123'},{status:'ACTIVE'},
    {country:'US'},{start_time:'2027-01-01T09:00:00'},{end_time:'2026-01-01T09:00:00Z'},{link:'https://real.example'}])
    assert.throws(()=>validateSpec({...spec(),...changes}),{status:400});
  const ids={campaign:'mock_campaign',adset:'mock_adset',creative:'mock_creative'},snapshot={content:{caption:'כיתוב מאושר'}};
  for(const stage of ['campaign','adset','ad'])assert.equal(buildOperation(stage,s,snapshot,ids).status,'PAUSED');
  assert.equal(buildOperation('creative',s,snapshot,ids).object_story_spec.video_data.message,snapshot.content.caption);
  assert.equal(buildOperation('adset',s,snapshot,ids).lifetime_budget,5000);
});
test('Meta adapter has no default network, rejects real IDs and activation, uses versioned official edges',async()=>{
  assert.throws(()=>createMockMeta());assert.throws(()=>createMockMeta({transport:{mode:'live',request:fetch}}));
  const calls=[],adapter=createMockMeta({transport:{mode:'mock',async request(url,opts){calls.push({url,...opts});return Response.json({id:'mock_campaign',status:'PAUSED'});}}});
  await adapter.create({stage:'campaign',account:'mock_account',payload:{status:'PAUSED'}});
  assert.equal(calls[0].url,`https://graph.facebook.com/${apiVersion}/act_mock_account/campaigns`);
  assert.equal(calls[0].headers.Authorization,'Bearer mock_only');assert.equal(calls[0].redirect,'error');
  await assert.rejects(adapter.create({stage:'campaign',account:'mock_account',payload:{status:'ACTIVE'}}));
  await assert.rejects(adapter.inspect({id:'1234',stage:'campaign'}));assert.equal(calls.length,1);
});
test('Meta rate-limit and malformed responses produce bounded sanitized errors',async()=>{
  const adapter=createMockMeta({transport:{mode:'mock',request:async()=>new Response(JSON.stringify({error:{code:4,message:'PRIVATE'}}),{status:429,headers:{'retry-after':'999999'}})}});
  await assert.rejects(adapter.inspect({id:'mock_campaign',stage:'campaign'}),e=>e.code==='META_RATE_LIMITED'&&e.retryAfter===3600&&!e.message.includes('PRIVATE'));
  const invalid=createMockMeta({transport:{mode:'mock',request:async()=>Response.json({id:'1234'})}});
  await assert.rejects(invalid.create({stage:'campaign',account:'mock_account',payload:{status:'PAUSED'}}),{code:'META_INVALID_RESPONSE'});
});
