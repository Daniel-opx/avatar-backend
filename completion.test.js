const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHmac,randomUUID}=require('node:crypto');
const {verifySignature,normalizeEvent}=require('./services/webhook-auth');
const {createCompletionService}=require('./services/completion');
const secret='test-only-webhook-secret-not-a-real-account';
const sign=raw=>createHmac('sha256',secret).update(raw).digest('hex');
test('webhook signatures cover exact raw bytes and reject malformed signatures',()=>{
  const raw=Buffer.from('{"event_type":"test"}');
  assert.equal(verifySignature(raw,sign(raw),secret),true);
  assert.equal(verifySignature(Buffer.concat([raw,Buffer.from(' ')]),sign(raw),secret),false);
  for(const signature of ['',null,sign(raw).slice(1),'g'.repeat(64),'sha256='+sign(raw)])assert.equal(verifySignature(raw,signature,secret),false);
  assert.equal(verifySignature(Buffer.alloc(32769),sign(raw),secret),false);
});
test('event normalization discards URLs and raw errors, with stable logical deduplication',()=>{
  const a=normalizeEvent(Buffer.from(JSON.stringify({event_type:'avatar_video.success',event_data:{video_id:'mock_test',url:'https://untrusted.invalid/secret'}})));
  const b=normalizeEvent(Buffer.from(JSON.stringify({event_type:'avatar_video.success',event_id:'new_delivery',event_data:{video_id:'mock_test'}})));
  assert.equal(a.key,b.key);assert.equal(JSON.stringify(a).includes('untrusted'),false);
  assert.equal(normalizeEvent(Buffer.from('{')),null);
  assert.equal(normalizeEvent(Buffer.from('{"event_type":"avatar_video.fail","event_data":{"video_id":"real-id"}}')),null);
  assert.deepEqual(normalizeEvent(Buffer.from('{"event_type":"unsupported"}')),{unsupported:true});
});
test('default completion cannot be enabled by environment variables or credentials',async()=>{
  const service=createCompletionService({query(){throw new Error('Must not access DB');}});
  assert.equal((await service.receive(Buffer.from('{}'),'')).status,'disabled');
  assert.equal((await service.reconcile(randomUUID())).status,'disabled');
  assert.equal((await service.issueReview(randomUUID())).status,'disabled');
  assert.equal((await service.readReview('x'.repeat(43))).status,'disabled');
});
test('mock status inspection retains identity and duration while discarding download URLs',async()=>{
  const {createMockHeyGen}=require('./services/heygen-mock');const id=randomUUID();
  const provider=createMockHeyGen({transport:{mode:'mock',async request(url,options){
    assert.equal(options.method,'GET');assert.equal(url,'https://api.heygen.com/v3/videos/mock_test');
    return new Response(JSON.stringify({data:{video_id:'mock_test',status:'completed',callback_id:id,duration:15,url:'https://unsafe.invalid/private'}}));
  }}});
  assert.deepEqual(await provider.inspect({externalId:'mock_test'}),{status:'completed',externalId:'mock_test',callbackId:id,durationSeconds:15});
});
test('HTTP routes preserve signed raw bodies, keep scheduler keys out, and conceal review tokens',async()=>{
  const old={api:process.env.API_KEY,scheduler:process.env.SCHEDULER_API_KEY};
  process.env.API_KEY='owner-test-key';process.env.SCHEDULER_API_KEY='scheduler-test-key';
  const logs=[];let received;
  const service={
    async receive(raw,sig){received=raw;if(!verifySignature(raw,sig,secret))return {status:'unauthorized'};return normalizeEvent(raw)?{status:'accepted'}:{status:'invalid'};},
    async history(){return {media:[],events:[]};},async reconcile(){return {status:'ready'};},
    async issueReview(){return {status:'ready'};},async readReview(){return {status:'ready',bytes:Buffer.from('MOCK ONLY')};},
  };
  const {createApp}=require('./app');const app=createApp({pool:{query:async()=>({rows:[]})},completion:service,logger:s=>logs.push(s)});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;const id=randomUUID();
  try{
    const raw=' {"event_type":"test"}\n';
    let r=await fetch(base+'/webhooks/heygen',{method:'POST',headers:{'content-type':'application/json',signature:sign(raw)},body:raw});
    assert.equal(r.status,202);assert.equal(received.toString(),raw);
    r=await fetch(base+'/webhooks/heygen',{method:'POST',headers:{'content-type':'application/json','x-api-key':'owner-test-key'},body:raw});assert.equal(r.status,401);
    r=await fetch(base+'/webhooks/heygen',{method:'POST',headers:{'content-type':'application/json',signature:sign('{')},body:'{'});assert.equal(r.status,400);
    r=await fetch(base+'/webhooks/heygen',{method:'POST',headers:{'content-type':'application/json'},body:'x'.repeat(32769)});assert.equal(r.status,413);
    r=await fetch(base+'/webhooks/heygen',{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body:'{}'});assert.equal(r.status,415);
    for(const [path,method] of [[`/jobs/${id}/video`,'GET'],[`/jobs/${id}/video/review`,'POST'],[`/internal/videos/${id}/reconcile`,'POST']]){
      r=await fetch(base+path,{method,headers:{'x-api-key':'scheduler-test-key'}});assert.equal(r.status,401);
      r=await fetch(base+path,{method,headers:{'x-api-key':'owner-test-key'}});assert.equal(r.status,200);
    }
    const token='x'.repeat(43);r=await fetch(base+'/review/'+token);assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
    assert.equal(r.headers.get('x-real-video-generated'),'false');await r.arrayBuffer();
    assert.equal(logs.some(s=>s.includes(token)||s.includes('owner-test-key')),false);
  }finally{
    await new Promise(resolve=>server.close(resolve));
    for(const [key,value] of [['API_KEY',old.api],['SCHEDULER_API_KEY',old.scheduler]])if(value===undefined)delete process.env[key];else process.env[key]=value;
    await require('./db/pool').end();
  }
});
