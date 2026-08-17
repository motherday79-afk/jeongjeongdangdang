const {loginAllowed,sessionCookie,getAdminMfaStatus,verifyAdminMfaCode}=require('../../lib/auth');
const {adminLoginPrecheck,adminLoginFailed,adminLoginSucceeded,applyRateLimitResponse,recordAdminAudit,rateLimit}=require('../../lib/security');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  const body=req.body||{};
  const id=String(body.id||'').trim().slice(0,80),password=String(body.password||''),mfaCode=String(body.mfaCode||'').trim().slice(0,32);
  if(password.length>128)return res.status(400).json({ok:false,error:'로그인 입력값을 확인해주세요.'});
  try{
    const guard=await adminLoginPrecheck(req,id);
    if(!guard.ok){await recordAdminAudit(req,{type:guard.reason==='LOCKED'?'LOGIN_BLOCKED_LOCK':'LOGIN_BLOCKED_RATE',adminId:id,success:false,detail:`retryAfter=${guard.retryAfter}`}).catch(()=>{});return applyRateLimitResponse(res,guard,'관리자 로그인 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.');}
    if(!(await loginAllowed(id,password))){const failed=await adminLoginFailed(req,id);if(failed.locked)return applyRateLimitResponse(res,failed,'관리자 로그인 시도가 잠시 제한되었습니다. 잠시 후 다시 시도해주세요.');return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});}
    const mfa=await getAdminMfaStatus();
    if(mfa.enabled){
      if(!mfaCode)return res.status(200).json({ok:false,mfaRequired:true,error:'MFA 인증코드를 입력해주세요.'});
      const mfaRl=await rateLimit(req,'admin-mfa',8,10*60,id);if(!mfaRl.ok){await recordAdminAudit(req,{type:'MFA_BLOCKED_RATE',adminId:id,success:false}).catch(()=>{});return applyRateLimitResponse(res,mfaRl,'MFA 인증 시도가 잠시 제한되었습니다.');}
      const verified=await verifyAdminMfaCode(mfaCode);if(!verified.ok){await recordAdminAudit(req,{type:'MFA_FAILED',adminId:id,success:false,detail:verified.reason}).catch(()=>{});return res.status(401).json({ok:false,mfaRequired:true,error:'MFA 인증코드 또는 복구코드를 확인해주세요.'});}
      await adminLoginSucceeded(req,id);await recordAdminAudit(req,{type:'MFA_SUCCESS',adminId:id,success:true,detail:verified.method}).catch(()=>{});res.setHeader('Set-Cookie',await sessionCookie(id,{mfaVerified:true}));return res.status(200).json({ok:true,id,mfa:true});
    }
    await adminLoginSucceeded(req,id);res.setHeader('Set-Cookie',await sessionCookie(id,{mfaVerified:false}));return res.status(200).json({ok:true,id,mfa:false});
  }catch(e){await recordAdminAudit(req,{type:'LOGIN_ERROR',adminId:id,success:false,detail:e.message||String(e)}).catch(()=>{});return res.status(500).json({ok:false,error:'관리자 로그인 처리 중 오류가 발생했습니다.'});}
};
