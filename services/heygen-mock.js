const { identifier }=require('./asset-validation');
class RenderError extends Error {
  constructor(code,{retryable=false,uncertain=false,httpStatus=null,requestId=null,retryAfterSeconds=null}={}){
    super('Rendering provider operation failed');
    Object.assign(this,{code,retryable,uncertain,httpStatus,requestId,retryAfterSeconds});
  }
}
const videoId=id=>typeof id==='string' && /^mock_[A-Za-z0-9_-]{1,120}$/.test(id);
function buildAvatarRequest(manifest,config){
  if(manifest?.mode!=='mock' || !identifier(manifest.avatar_id) || !identifier(manifest.voice?.voice_id) ||
    manifest.voice.mode!=='builtin' || manifest.voice.audio || manifest.media_ids?.length!==0 ||
    !Array.isArray(manifest.visual_plan) || manifest.visual_plan.length!==1 ||
    typeof manifest.script!=='string' || manifest.script.length>6000 || !/[א-ת]/u.test(manifest.script)){
    throw new RenderError('RENDER_COMPOSITION_UNSUPPORTED');
  }
  if(!['avatar_iii','avatar_iv','avatar_v'].includes(config.engine) ||
    !['720p','1080p'].includes(config.resolution) || !['9:16','16:9','1:1','auto'].includes(config.aspect_ratio)){
    throw new RenderError('RENDER_CONFIG_INVALID');
  }
  return {type:'avatar',avatar_id:manifest.avatar_id,voice_id:manifest.voice.voice_id,script:manifest.script,
    title:'MOCK ONLY - avatar draft',engine:{type:config.engine},resolution:config.resolution,aspect_ratio:config.aspect_ratio};
}
function createMockHeyGen({transport}={}){
  if(transport?.mode!=='mock' || typeof transport.request!=='function')throw new RenderError('MOCK_TRANSPORT_REQUIRED');
  async function request(action,id,payload,key,signal){
    const submit=action==='submit';
    let response;
    try{
      response=await transport.request(`https://api.heygen.com/v3/videos${submit?'':`/${encodeURIComponent(id)}`}`,{
        method:submit?'POST':'GET',redirect:'error',signal,
        headers:{'x-api-key':'mock-only-no-real-credential',...(submit?{'content-type':'application/json','Idempotency-Key':key}:{})},
        ...(submit?{body:JSON.stringify(payload)}:{}),
      });
    }catch{throw new RenderError('HEYGEN_TRANSPORT',{uncertain:submit,retryable:!submit});}
    const httpStatus=response.status;
    const requestId=response.headers.get('x-request-id');
    const retryAfter=response.headers.get('retry-after');
    const delay=retryAfter==null?null:/^\d+$/.test(retryAfter)?Number(retryAfter):
      Math.ceil((Date.parse(retryAfter)-Date.now())/1000);
    const excessiveDelay=Number.isFinite(delay)&&delay>3600;
    const retryAfterSeconds=Number.isFinite(delay)?Math.min(3600,Math.max(0,delay)):null;
    let body;
    try{body=await response.json();}catch{
      throw new RenderError('HEYGEN_INVALID_RESPONSE',{uncertain:submit,retryable:!submit,httpStatus,requestId});
    }
    if(!response.ok){
      const code=body?.error?.code||body?.code;
      const rateLimit=httpStatus===429 && code==='rate_limit_exceeded';
      const uncertain=submit && (httpStatus>=500 || (httpStatus===409&&code==='request_in_progress'));
      throw new RenderError(code==='quota_exceeded'||code==='insufficient_credits'?'HEYGEN_QUOTA':
        rateLimit?'HEYGEN_RATE_LIMIT':uncertain?'HEYGEN_UNCERTAIN':'HEYGEN_REJECTED',{
        retryable:(rateLimit||(!submit&&httpStatus>=500)) && !excessiveDelay,
        uncertain,httpStatus,requestId,retryAfterSeconds});
    }
    const data=body?.data;
    if(submit){
      if(!videoId(data?.video_id))throw new RenderError('HEYGEN_INVALID_ID',{uncertain:true,httpStatus,requestId});
      return {externalId:data.video_id,httpStatus,requestId};
    }
    const returnedId=data?.video_id??data?.id??id;
    if(returnedId!==id || !['waiting','pending','processing','completed','failed'].includes(data?.status)){
      throw new RenderError('HEYGEN_INVALID_STATUS',{retryable:true,httpStatus,requestId});
    }
    // Presigned URLs, failure messages and other raw provider fields are not persisted.
    return {status:data.status,httpStatus,requestId};
  }
  return {mode:'mock',submit:args=>request('submit',null,args.payload,args.idempotencyKey,args.signal),
    poll:args=>{if(!videoId(args.externalId))throw new RenderError('HEYGEN_INVALID_ID');
      return request('poll',args.externalId,null,null,args.signal);}};
}
module.exports={createMockHeyGen,buildAvatarRequest,RenderError,videoId};
