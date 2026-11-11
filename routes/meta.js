const express=require('express');
module.exports=function metaRouter(auth,meta){
  const router=express.Router();
  const handle=work=>async(req,res)=>{try{const result=await work(req);res.set('Cache-Control','no-store')
    .status(result.status==='disabled'||result.status==='activation_locked'?503:200).json(result);}
    catch(e){res.status(e.status||503).json({error:e.status===409?'Campaign changed or review required':e.status?'Operation denied':'Meta operations unavailable'});}};
  const operators=auth.requireRoles(['admin','operator']),admin=auth.requireRoles(['admin']);
  router.post('/jobs/:id/meta/drafts',operators,handle(r=>meta.propose(r.actor,r.params.id,r.body)));
  router.get('/meta/drafts/:id',auth.requireRoles(['admin','operator','reviewer']),handle(r=>meta.detail(r.actor,r.params.id)));
  router.post('/meta/drafts/:id/reviews/:kind',admin,handle(r=>meta.decide(r.actor,r.params.id,r.params.kind,r.body)));
  router.post('/meta/drafts/:id/prepare',operators,handle(r=>meta.advance(r.actor,r.params.id)));
  router.post('/meta/drafts/:id/operations/:operation/reconcile',operators,handle(r=>meta.reconcile(r.actor,r.params.id,r.params.operation)));
  router.post('/meta/drafts/:id/activate',admin,handle(r=>meta.activate(r.actor,r.params.id)));
  return router;
};
