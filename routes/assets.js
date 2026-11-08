const express=require('express');
function assetsRouter(service=require('../services/pipeline').createPipeline().assets){
  const router=express.Router();
  const uuid=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const handle=work=>async(req,res)=>{
    if(!uuid(req.params.id))return res.status(400).json({error:'Invalid job ID'});
    try{
      const result=await work(req);
      res.status(result.status==='invalid'?400:result.status==='not_found'?404:
        ['unconfigured','conflict'].includes(result.status)?409:200).json(result);
    }catch(error){
      const known=['INVALID_ASSET','ASSET_EXPIRED','ASSET_METADATA_MISMATCH','ASSET_UNAVAILABLE'].includes(error.code);
      res.status(known?409:503).json({error:'Asset operation failed',code:known?error.code:'ASSET_UNAVAILABLE'});
    }
  };
  router.get('/:id/assets',handle(req=>service.history(req.params.id)));
  router.post('/:id/assets',(req,res,next)=>{
    if(!req.body || Object.keys(req.body).sort().join(',')!=='asset,revision' || !Number.isSafeInteger(req.body.revision) || req.body.revision<1){
      return res.status(400).json({error:'Provide revision (positive integer) and asset metadata'});
    }
    next();
  },handle(req=>service.register(req.params.id,req.body.revision,req.body.asset)));
  return router;
}
module.exports=assetsRouter;
