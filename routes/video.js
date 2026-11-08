const express=require('express');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function videoRouter(service=require('../services/pipeline').createPipeline().completion){
  const router=express.Router();
  router.use('/:id/video', (req,res,next)=>uuid(req.params.id)?next():res.status(400).json({error:'Invalid job ID'}));
  router.get('/:id/video',async(req,res)=>{
    try{res.json(await service.history(req.params.id));}
    catch{res.status(503).json({error:'Video history unavailable'});}
  });
  for(const [path,method] of [['review','issueReview'],['retry-media','retryMedia']]){
    router.post(`/:id/video/${path}`,async(req,res)=>{
      try{const result=await service[method](req.params.id);
        res.set('Cache-Control','no-store').status(result.status==='disabled'?503:['ready','queued'].includes(result.status)?200:409).json(result);
      }catch{res.status(503).json({error:'Video operation unavailable'});}
    });
  }
  return router;
}
function reconcileRouter(service=require('../services/pipeline').createPipeline().completion){
  const router=express.Router();
  router.post('/:id/reconcile',async(req,res)=>{
    if(!uuid(req.params.id))return res.status(400).json({error:'Invalid render request ID'});
    try{const result=await service.reconcile(req.params.id);
      res.status(result.status==='disabled'?503:result.status==='not_found'?404:200).json(result);
    }catch{res.status(503).json({error:'Video reconciliation unavailable'});}
  });return router;
}
module.exports={videoRouter,reconcileRouter};
