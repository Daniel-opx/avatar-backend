const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {uuid}=require('../services/supabase-auth');
function authRouter(team,auth){
  const router=express.Router();
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.post('/login',rateLimit({windowMs:15*60000,limit:10,keyGenerator:()=> 'team-login',standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
    if(auth.cookieOptions.secure&&!req.secure)return res.status(403).json({error:'HTTPS required'});
    if(!auth.origin(req))return res.status(403).json({error:'Origin rejected'});
    try{
      const result=await team.login(req.body?.email,req.body?.password);
      if(result.status!=='authenticated')return res.status({disabled:503,invalid:400,unavailable:503}[result.status]||401).json({status:result.status});
      const options={...auth.cookieOptions,expires:result.expires_at};
      res.cookie(auth.cookieName,result.token,options);
      res.cookie(auth.csrfName,result.csrf,{...options,httpOnly:false});
      return res.json({status:'authenticated',user:result.user,csrf_token:result.csrf,expires_at:result.expires_at});
    }catch{return res.status(503).json({error:'Sign-in unavailable'});}
  });
  router.get('/me',auth.requireRoles(['admin','operator','reviewer']), (req,res)=>res.json({id:req.actor.id,role:req.actor.role}));
  router.post('/logout',async(req,res)=>{
    if(!auth.origin(req))return res.status(403).json({error:'Origin rejected'});
    try{await team.logout(auth.token(req),req.get('x-csrf-token'));
      res.clearCookie(auth.cookieName,auth.cookieOptions);res.clearCookie(auth.csrfName,{...auth.cookieOptions,httpOnly:false});return res.status(204).end();
    }catch(e){return res.status(e.status||503).json({error:'Logout unavailable'});}
  });return router;
}
function teamRouter(team,auth,approvals,processing){
  const router=express.Router();
  const handle=work=>async(req,res)=>{try{res.set('Cache-Control','no-store').json(await work(req));}
    catch(e){res.status(e.status||503).json({error:e.status?'Operation denied':'Team operation unavailable'});}};
  router.get('/members',auth.requireRoles(['admin']),handle(req=>team.listMembers(req.actor)));
  router.put('/members/:id',auth.requireRoles(['admin']),handle(req=>team.setMember(req.actor,req.params.id,req.body?.role,req.body?.enabled)));
  router.get('/audit',auth.requireRoles(['admin']),handle(req=>team.auditHistory(req.actor)));
  router.get('/notifications',auth.requireRoles(['admin','operator','reviewer']),handle(req=>approvals.notifications(req.actor)));
  router.post('/notifications/:id/:kind/read',auth.requireRoles(['admin','operator','reviewer']),handle(req=>approvals.markRead(req.actor,req.params.id,req.params.kind)));
  router.post('/processing/run',auth.requireRoles(['admin','operator']),handle(async req=>{
    await team.recordAttempt(req.actor,null,'processing_run_attempt');return processing.runOne();
  }));
  for(const action of ['retry','cancel'])router.post(`/jobs/:id/${action}`,auth.requireRoles(['admin','operator']),handle(async req=>{
    if(!uuid(req.params.id))throw Object.assign(new Error('Invalid ID'),{status:400});
    await team.recordAttempt(req.actor,req.params.id,`processing_${action}_attempt`);return processing.control(req.params.id,action);
  }));
  router.get('/jobs/:id/history',auth.requireRoles(['admin','operator','reviewer']),handle(async req=>{
    if(!uuid(req.params.id))throw Object.assign(new Error('Invalid ID'),{status:400});
    const h=await processing.history(req.params.id);
    return {...h,processing:h.processing.map(({lease_token,...row})=>row),attempts:h.attempts.map(({token,...row})=>row)};
  }));return router;
}
module.exports={authRouter,teamRouter};
