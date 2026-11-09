const express=require('express');
function approvalsRouter(service,auth){
  const router=express.Router();
  const handle=work=>async(req,res)=>{try{
    const result=await work(req);res.set('Cache-Control','no-store').status(result?.state==='superseded'?409:200).json(result);
  }catch(e){res.status(e.status||503).json({error:e.status?'Approval operation denied':'Approval operation unavailable'});}};
  router.get('/:id/approvals',auth.requireRoles(['admin','operator','reviewer']),handle(req=>service.list(req.actor,req.params.id)));
  router.post('/:id/approvals',auth.requireRoles(['admin','operator']),handle(req=>service.request(req.actor,req.params.id,req.body?.request_key)));
  router.get('/:id/approvals/:request',auth.requireRoles(['admin','operator','reviewer']),handle(req=>service.detail(req.actor,req.params.id,req.params.request)));
  router.post('/:id/approvals/:request/decisions',auth.requireRoles(['admin','reviewer']),handle(req=>service.decide(req.actor,req.params.id,req.params.request,req.body)));
  router.post('/:id/approvals/:request/revise',auth.requireRoles(['admin','operator']),handle(req=>service.revise(req.actor,req.params.id,req.params.request,req.body)));
  router.get('/:id/approval-gate',auth.requireRoles(['admin','operator']),handle(req=>service.publicationGate(req.actor,req.params.id)));
  return router;
}
module.exports=approvalsRouter;
