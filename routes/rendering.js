const express=require('express');
function renderingRouter(service=require('../services/pipeline').createPipeline().rendering){
  const router=express.Router();
  router.get('/:id/rendering',async(req,res)=>{
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)){
      return res.status(400).json({error:'Invalid job ID'});
    }
    try{return res.json(await service.history(req.params.id));}
    catch{return res.status(503).json({error:'Rendering history unavailable',code:'RENDER_HISTORY_UNAVAILABLE'});}
  });
  return router;
}
module.exports=renderingRouter;
