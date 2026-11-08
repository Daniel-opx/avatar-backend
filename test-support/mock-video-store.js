const {digest}=require('../services/webhook-auth');
// Deliberately not a playable MP4: this fixture exercises retention/access only.
function createMockVideoStore(){
  const objects=new Map();let copies=0;
  return {mode:'mock',get copies(){return copies;},
    async copy({bucket,object_key,operationKey,externalId,signal,maxBytes}){
      signal?.throwIfAborted();const key=`${bucket}/${object_key}`;
      if(!objects.has(key)){
        const bytes=Buffer.from(`MOCK VIDEO FIXTURE ${operationKey} ${externalId}`);
        if(bytes.length>maxBytes)throw new Error('Mock size limit');
        objects.set(key,bytes);copies++;
      }
      return {bucket,object_key,...await this.stat({bucket,object_key})};
    },
    async stat({bucket,object_key}){
      const bytes=objects.get(`${bucket}/${object_key}`);if(!bytes)throw new Error('Missing mock object');
      return {mime_type:'video/mp4',size_bytes:bytes.length,sha256:digest(bytes)};
    },
    async read({bucket,object_key}){
      const bytes=objects.get(`${bucket}/${object_key}`);if(!bytes)throw new Error('Missing mock object');return Buffer.from(bytes);
    },
  };
}
module.exports={createMockVideoStore};
