const {requireAdmin,loginAllowed,getAdminSessionVersion,bumpAdminSessionVersion,clearCookie,adminCredentialStatus}=require('../../lib/auth');
const {listAdminAudit,recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  try{
    if(req.method==='GET'){
      const [events,sessionVersion,credential]=await Promise.all([listAdminAudit(80),getAdminSessionVersion(),adminCredentialStatus()]);
      return res.status(200).json({ok:true,sessionVersion,credential,events,policy:{loginFailures:5,lockMinutes:10,burstAttempts:12,burstMinutes:10,globalReadPerMinute:600,globalWritePerMinute:180}});
    }
    if(req.method==='POST'){
      const b=req.body||{};
      if(String(b.action||'')!=='invalidate-sessions')return res.status(400).json({ok:false,error:'지원하지 않는 보안 작업입니다.'});
      const currentPassword=String(b.currentPassword||'');
      if(!currentPassword)return res.status(400).json({ok:false,error:'현재 관리자 비밀번호를 입력해주세요.'});
      if(!(await loginAllowed(admin.id,currentPassword)))return res.status(401).json({ok:false,error:'현재 관리자 비밀번호가 올바르지 않습니다.'});
      const sessionVersion=await bumpAdminSessionVersion();
      await recordAdminAudit(req,{type:'ALL_SESSIONS_INVALIDATED',adminId:admin.id,success:true,detail:`sessionVersion=${sessionVersion}`});
      res.setHeader('Set-Cookie',clearCookie());
      return res.status(200).json({ok:true,sessionVersion,relogin:true});
    }
    return res.status(405).json({ok:false,error:'Method not allowed'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
