const apiKeyAuth=require('./apiKeyAuth');
const {uuid}=require('../services/supabase-auth');
function createTeamAuth(team,{secure=false}={}){
  const cookieName=secure?'__Host-avatar_session':'avatar_session';
  const csrfName=secure?'__Host-avatar_csrf':'avatar_csrf';
  const cookieOptions={httpOnly:true,secure,sameSite:'strict',path:'/'};
  function token(req){
    const values=(req.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='));
    return values.length===1?values[0].slice(cookieName.length+1):null;
  }
  const unsafe=req=>!['GET','HEAD','OPTIONS'].includes(req.method);
  function origin(req){const source=req.get('origin');return !source||source===`${req.protocol}://${req.get('host')}`;}
  function requireRoles(roles,{owner=false,writeAudit=false}={}){
    return async(req,res,next)=>{
      const hasCookie=(req.get('cookie')||'').split(';').some(s=>s.trim().startsWith(cookieName+'='));
      if(!hasCookie&&owner)return apiKeyAuth(req,res,()=>{req.actor={kind:'service'};next();});
      try{
        if(req.get('x-api-key'))return res.status(401).json({error:'Use one authentication method'});
        const actor=await team.lookup(token(req));if(!actor)return res.status(401).json({error:'Unauthorized'});
        if(!roles.includes(actor.role))return res.status(403).json({error:'Forbidden'});
        if(unsafe(req)&&(!origin(req)||!team.matches(req.get('x-csrf-token'),actor.csrfHash)))return res.status(403).json({error:'CSRF verification failed'});
        req.actor=actor;
        if(writeAudit&&unsafe(req)){
          const target=req.path.split('/').find(uuid)||null;
          await team.recordAttempt(actor,target);
        }
        next();
      }catch(e){return res.status(e.status||503).json({error:e.status?'Operation denied':'Authentication unavailable'});}
    };
  }
  function jobs(req,res,next){
    const path=req.path.toLowerCase();
    const review=unsafe(req)&&/^\/[^/]+\/approvals\/[^/]+\/decisions\/?$/.test(path);
    const read=!unsafe(req)||/^\/[^/]+\/video\/review\/?$/.test(path);
    return requireRoles(read?['admin','operator','reviewer']:review?['admin','reviewer']:['admin','operator'],{owner:true,writeAudit:true})(req,res,next);
  }
  return {requireRoles,jobs,token,origin,cookieName,csrfName,cookieOptions};
}
module.exports={createTeamAuth};
