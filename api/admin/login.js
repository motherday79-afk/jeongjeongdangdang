const {loginAllowed,sessionCookie}=require('../../lib/auth');
const {adminLoginPrecheck,adminLoginFailed,adminLoginSucceeded,applyRateLimitResponse,recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  const body=req.body||{};
  const id=String(body.id||'').trim();
  try{
    const guard=await adminLoginPrecheck(req,id);
    if(!guard.ok){
      await recordAdminAudit(req,{type:guard.reason==='LOCKED'?'LOGIN_BLOCKED_LOCK':'LOGIN_BLOCKED_RATE',adminId:id,success:false,detail:`retryAfter=${guard.retryAfter}`}).catch(()=>{});
      return applyRateLimitResponse(res,guard,'관리자 로그인 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.');
    }
    if(!(await loginAllowed(id,body.password))){
      const failed=await adminLoginFailed(req,id);
      if(failed.locked)return applyRateLimitResponse(res,failed,'관리자 로그인 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.');
      return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
    }
    await adminLoginSucceeded(req,id);
    res.setHeader('Set-Cookie',await sessionCookie(id));
    return res.status(200).json({ok:true,id});
  }catch(e){
    await recordAdminAudit(req,{type:'LOGIN_ERROR',adminId:id,success:false,detail:e.message||String(e)}).catch(()=>{});
    return res.status(500).json({ok:false,error:'관리자 로그인 처리 중 오류가 발생했습니다.'});
  }
};
