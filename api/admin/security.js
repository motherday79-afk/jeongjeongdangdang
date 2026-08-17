const {
  requireAdmin,loginAllowed,getAdminSessionVersion,bumpAdminSessionVersion,clearCookie,adminCredentialStatus,
  getAdminMfaStatus,beginAdminMfaSetup,confirmAdminMfaSetup,disableAdminMfa,regenerateRecoveryCodes,securityConfigurationStatus
}=require('../../lib/auth');
const {listAdminAudit,recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    if(req.method==='GET'){
      const [events,sessionVersion,credential,mfa]=await Promise.all([listAdminAudit(80),getAdminSessionVersion(),adminCredentialStatus(),getAdminMfaStatus()]);
      return res.status(200).json({ok:true,sessionVersion,credential,mfa,configuration:securityConfigurationStatus(),events,policy:{loginFailures:5,lockMinutes:10,burstAttempts:12,burstMinutes:10,globalReadPerMinute:600,globalWritePerMinute:180,adminIdleMinutes:45,adminAbsoluteHours:8,passwordMin:12}});
    }
    if(req.method==='POST'){
      const b=req.body||{},action=String(b.action||'');
      if(action==='invalidate-sessions'){
        const currentPassword=String(b.currentPassword||'');if(!currentPassword)return res.status(400).json({ok:false,error:'현재 관리자 비밀번호를 입력해주세요.'});
        if(!(await loginAllowed(admin.id,currentPassword)))return res.status(401).json({ok:false,error:'현재 관리자 비밀번호가 올바르지 않습니다.'});
        const sessionVersion=await bumpAdminSessionVersion();await recordAdminAudit(req,{type:'ALL_SESSIONS_INVALIDATED',adminId:admin.id,success:true,detail:`sessionVersion=${sessionVersion}`});res.setHeader('Set-Cookie',clearCookie());return res.status(200).json({ok:true,sessionVersion,relogin:true});
      }
      if(action==='mfa-begin'){
        const setup=await beginAdminMfaSetup(admin.id,String(b.currentPassword||''));await recordAdminAudit(req,{type:'MFA_SETUP_STARTED',adminId:admin.id,success:true});return res.json({ok:true,setup});
      }
      if(action==='mfa-confirm'){
        const out=await confirmAdminMfaSetup(admin.id,String(b.code||''));await recordAdminAudit(req,{type:'MFA_ENABLED',adminId:admin.id,success:true,detail:`sessionVersion=${out.sessionVersion}`});res.setHeader('Set-Cookie',clearCookie());return res.json({ok:true,...out,relogin:true});
      }
      if(action==='mfa-disable'){
        const out=await disableAdminMfa(admin.id,String(b.currentPassword||''),String(b.code||''));await recordAdminAudit(req,{type:'MFA_DISABLED',adminId:admin.id,success:true,detail:`sessionVersion=${out.sessionVersion}`});res.setHeader('Set-Cookie',clearCookie());return res.json({ok:true,...out,relogin:true});
      }
      if(action==='mfa-recovery-regenerate'){
        const out=await regenerateRecoveryCodes(admin.id,String(b.currentPassword||''),String(b.code||''));await recordAdminAudit(req,{type:'MFA_RECOVERY_REGENERATED',adminId:admin.id,success:true,detail:`remaining=${out.recoveryRemaining}`});return res.json({ok:true,...out});
      }
      return res.status(400).json({ok:false,error:'지원하지 않는 보안 작업입니다.'});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){await recordAdminAudit(req,{type:'SECURITY_ACTION_FAILED',adminId:admin.id,success:false,detail:e.message||String(e)}).catch(()=>{});return res.status(400).json({ok:false,error:e.message||String(e)});}
};
