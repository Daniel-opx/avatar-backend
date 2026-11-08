const express=require('express');
function webhookRouter(service=require('../services/pipeline').createPipeline().completion){
  const router=express.Router();
  // Must precede JSON parsing: signatures cover the original, uncompressed bytes.
  router.post('/heygen',(req,res,next)=>{
    const encoding=req.get('content-encoding');
    if(encoding&&encoding.toLowerCase()!=='identity')return res.status(415).json({error:'Unsupported content encoding'});
    next();
  },express.raw({type:'application/json',limit:'32kb',inflate:false}),async(req,res)=>{
    try{
      const result=await service.receive(req.body,req.get('signature'));
      const status={disabled:503,unauthorized:401,invalid:400,conflict:409,accepted:202}[result.status]||200;
      res.status(status).json(result);
    }catch{res.status(503).json({error:'Webhook inbox unavailable'});}
  });return router;
}
function reviewRouter(service=require('../services/pipeline').createPipeline().completion){
  const router=express.Router();
  router.get('/:token',async(req,res)=>{
    res.set('Cache-Control','no-store');
    try{
      const result=await service.readReview(req.params.token);
      if(result.status!=='ready')return res.status(result.status==='not_found'?404:503).json({status:result.status});
      res.set({'Content-Type':'video/mp4','Content-Disposition':'inline; filename="mock-review.mp4"',
        'X-Media-Mode':'mock','X-Real-Video-Generated':'false'}).send(result.bytes);
    }catch{res.status(503).json({error:'Review unavailable'});}
  });return router;
}
module.exports={webhookRouter,reviewRouter};
