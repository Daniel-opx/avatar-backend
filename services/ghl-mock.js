const mockId=value=>typeof value==='string'&&/^mock_[A-Za-z0-9_-]{1,150}$/.test(value);
class PublishingError extends Error{constructor(code){super('Publishing adapter failed');this.code=code;}}
function buildPost(snapshot,account,userId,scheduleDate=null,{allowPast=false}={}){
  if(!mockId(account)||!mockId(userId)||snapshot?.ready!==true||snapshot.media?.mode!=='mock'
    ||!/^[a-f0-9]{64}$/.test(snapshot.media.sha256)||typeof snapshot.content?.caption!=='string'
    ||!Array.isArray(snapshot.content.hashtags))throw new PublishingError('INVALID_POST');
  const summary=[snapshot.content.caption,snapshot.content.hashtags.join(' ')].filter(Boolean).join('\n\n');
  if(summary.length>2000||/\{\{/.test(summary))throw new PublishingError('UNSUPPORTED_POST_TEXT');
  if(scheduleDate&&(!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(scheduleDate)||!Number.isFinite(Date.parse(scheduleDate))||(!allowPast&&Date.parse(scheduleDate)<=Date.now())))throw new PublishingError('INVALID_SCHEDULE');
  return {accountIds:[account],summary,type:'post',status:scheduleDate?'scheduled':'published',
    ...(scheduleDate?{scheduleDate:new Date(scheduleDate).toISOString()}:{}),userId,
    facebookPostDetails:{type:'post'},media:[{type:'video/mp4',url:`https://media.mock.invalid/${snapshot.media.sha256}.mp4`}]};
}
function createMockGhl({transport}={}){
  if(transport?.mode!=='mock'||typeof transport.request!=='function')throw new PublishingError('MOCK_TRANSPORT_REQUIRED');
  async function request(method,location,id,payload,signal){
    if(!mockId(location)||(id&&!mockId(id)))throw new PublishingError('INVALID_MOCK_ID');
    let response,body;
    try{response=await transport.request(`https://services.leadconnectorhq.com/social-media-posting/${location}/posts${id?'/'+id:''}`,{
      method,redirect:'error',signal,headers:{Authorization:'Bearer mock-only-no-real-token',Version:'v3',
        ...(payload?{'Content-Type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
      body=await response.json();
    }catch{throw new PublishingError(method==='POST'?'SUBMISSION_UNCERTAIN':'STATUS_UNAVAILABLE');}
    if(!response.ok||body?.success!==true)throw new PublishingError(method==='POST'?'SUBMISSION_UNCERTAIN':'STATUS_UNAVAILABLE');
    const post=body?.results?.post;
    if(!mockId(post?._id)||(id&&post._id!==id)||post.locationId!==location||!['in_progress','pending','scheduled','published','failed'].includes(post.status)){
      throw new PublishingError(method==='POST'?'SUBMISSION_UNCERTAIN':'INVALID_STATUS');
    }
    return {id:post._id,state:['in_progress','pending'].includes(post.status)?'submitted':post.status,
      publishedAt:post.status==='published'&&Number.isFinite(Date.parse(post.publishedAt))?new Date(post.publishedAt):null};
  }
  return {mode:'mock',submit:args=>request('POST',args.location,null,args.payload,args.signal),
    inspect:args=>request('GET',args.location,args.id,null,args.signal)};
}
module.exports={createMockGhl,buildPost,mockId,PublishingError};
