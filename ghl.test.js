const {test}=require('node:test');const assert=require('node:assert/strict');const {buildPost,createMockGhl}=require('./services/ghl-mock');
test('GHL mock mapping uses approved caption/video and the documented v3 contract',async()=>{
  const payload=buildPost({ready:true,media:{mode:'mock',sha256:'a'.repeat(64)},content:{caption:'תוכן לדוגמה',hashtags:['#בדיקה']}},'mock_facebook','mock_user');
  assert.equal(payload.summary,'תוכן לדוגמה\n\n#בדיקה');assert.equal(payload.media[0].type,'video/mp4');
  assert.throws(()=>createMockGhl(),{code:'MOCK_TRANSPORT_REQUIRED'});
  const provider=createMockGhl({transport:{mode:'mock',async request(url,options){
    assert.equal(url,'https://services.leadconnectorhq.com/social-media-posting/mock_location/posts');assert.equal(options.headers.Version,'v3');
    assert.equal(options.headers.Authorization,'Bearer mock-only-no-real-token');assert.equal(options.headers['Idempotency-Key'],undefined);
    return new Response(JSON.stringify({success:true,results:{post:{_id:'mock_post',locationId:'mock_location',status:'published',publishedAt:new Date().toISOString()}}}));
  }}});
  assert.equal((await provider.submit({location:'mock_location',payload})).id,'mock_post');
});
test('credentials cannot activate the default publishing service',async()=>{
  const service=require('./services/publishing').createPublishingService({query(){throw new Error('No DB access');}},{});
  const id=require('node:crypto').randomUUID();assert.equal((await service.submit({},id,{request_key:id,approval_id:id,account_id:'mock_account'})).status,'disabled');
  assert.throws(()=>buildPost({ready:true,media:{mode:'mock',sha256:'a'.repeat(64)},content:{caption:'{{dynamic}}',hashtags:[]}},'mock_account','mock_user'),{code:'UNSUPPORTED_POST_TEXT'});
});
