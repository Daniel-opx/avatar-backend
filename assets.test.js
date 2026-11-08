const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validReference,validMetadata,validSignedURL}=require('./services/asset-validation');
const {createPipeline}=require('./services/pipeline');
const express=require('express');
const auth=require('./middleware/apiKeyAuth');
const assetsRouter=require('./routes/assets');
const ref={bucket:'private-media',object_key:'job/image.png'};
test('media policy rejects traversal, invalid types, excessive sizes and unsafe signed links',()=>{
  assert.equal(validReference(ref),true);
  for(const key of ['../secret','job/../secret','/absolute','job/%2e%2e/secret','job//file','job/file?token=x']){
    assert.equal(validReference({...ref,object_key:key}),false);
  }
  const metadata={mime_type:'image/png',size_bytes:123,sha256:'a'.repeat(64)};
  assert.equal(validMetadata('image',metadata),true);
  for(const delta of [{mime_type:'text/html'},{size_bytes:20*1024*1024},{size_bytes:0},{sha256:'invalid'}]){
    assert.equal(validMetadata('image',{...metadata,...delta}),false);
  }
  const origin='https://private.example';
  const url=`${origin}/storage/v1/object/sign/${ref.bucket}/${ref.object_key}?token=test`;
  const now=Date.now();const expiry=new Date(now+900000).toISOString();
  assert.equal(validSignedURL(url,origin,ref,expiry,now),true);
  for(const bad of [url.replace('https:','http:'),url.replace('private.example','evil.example'),
    url.replace('/job/image','/other/image'),url+'#fragment',url.replace('https://','https://user:password@'),
    url.replace('?token=test','')])assert.equal(validSignedURL(bad,origin,ref,expiry,now),false);
  assert.equal(validSignedURL(url,origin,ref,new Date(now+1000).toISOString(),now),false);
});
test('production asset preparation cannot be activated through environment provider credentials',async()=>{
  const p=createPipeline({query:()=>{throw new Error('No query expected');}},{ASSETS_ENABLED:'true',ELEVENLABS_API_KEY:'unused'});
  assert.equal(await p.assets.handler.isAvailable(()=>{throw new Error('No query expected');}),false);
});
test('asset routes require owner authentication and validate inputs without leaking errors',async()=>{
  const prior={API_KEY:process.env.API_KEY,SCHEDULER_API_KEY:process.env.SCHEDULER_API_KEY};
  process.env.API_KEY='owner';process.env.SCHEDULER_API_KEY='scheduler';
  const id='00000000-0000-0000-0000-000000000001';let registrations=0;
  const app=express();app.use('/jobs',auth,express.json(),assetsRouter({
    history:async()=>({assets:[],manifests:[]}),
    register:async()=>{registrations++;return {status:'unconfigured'};},
  }));
  const server=app.listen(0,'127.0.0.1');
  try{
    await new Promise(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${server.address().port}/jobs/${id}/assets`;
    for(const key of ['','scheduler'])assert.equal((await fetch(url,{headers:{'x-api-key':key}})).status,401);
    const headers={'x-api-key':'owner','content-type':'application/json'};
    assert.equal((await fetch(url,{headers})).status,200);
    assert.equal((await fetch(url,{method:'POST',headers,body:'{}'})).status,400);
    assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({revision:1,asset:ref})})).status,409);
    assert.equal(registrations,1);
  }finally{
    for(const [k,v]of Object.entries(prior)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    await new Promise(resolve=>server.close(resolve));
  }
});
