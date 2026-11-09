const express=require('express');
function dashboardRouter(auth,dashboard,publishing){
  const router=express.Router();
  const handle=work=>async(req,res)=>{try{const result=await work(req);
    res.set('Cache-Control','no-store').status(result?.status==='disabled'?503:200).json(result);
  }catch(e){res.status(e.status||503).json({error:e.status===409?'The item changed or this action is locked':e.status?'Operation denied':'Dashboard unavailable'});}};
  router.get('/dashboard',auth.requireRoles(['admin','operator','reviewer']),handle(req=>dashboard.overview(req.actor)));
  router.put('/schedule',auth.requireRoles(['admin']),handle(req=>dashboard.saveSchedule(req.actor,req.body)));
  router.get('/publishing/accounts',auth.requireRoles(['admin','operator','reviewer']),handle(req=>publishing.accounts(req.actor)));
  router.get('/jobs/:id/publishing',auth.requireRoles(['admin','operator','reviewer']),handle(req=>publishing.history(req.actor,req.params.id)));
  router.post('/jobs/:id/publishing',auth.requireRoles(['admin','operator']),handle(req=>publishing.submit(req.actor,req.params.id,req.body)));
  router.post('/jobs/:id/publishing/:request/reconcile',auth.requireRoles(['admin','operator']),handle(req=>publishing.reconcile(req.actor,req.params.id,req.params.request)));
  return router;
}
module.exports=dashboardRouter;
