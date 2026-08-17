const {requireAdmin,changeAdminPassword,clearCookie}=require('../../lib/auth');
const {recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  const session=requireAdmin(req,res); if(!session) return;
  try{
    const body=req.body||{};
    const currentPassword=String(body.currentPassword||'');
    const newPassword=String(body.newPassword||'');
    if(!currentPassword) return res.status(400).json({ok:false,error:'현재 비밀번호를 입력해주세요.'});
    if(!newPassword) return res.status(400).json({ok:false,error:'새 비밀번호를 입력해주세요.'});
    const changed=await changeAdminPassword(session.id,currentPassword,newPassword);
    await recordAdminAudit(req,{type:'PASSWORD_CHANGED',adminId:session.id,success:true,detail:`revision=${changed.revision}; sessionVersion=${changed.sessionVersion}`}).catch(()=>{});
    // The current browser must authenticate again with the new password.
    res.setHeader('Set-Cookie',clearCookie());
    return res.status(200).json({ok:true,...changed,relogin:true});
  }catch(e){
    const message=e?.message||String(e);
    const badCurrent=message.includes('현재 비밀번호');
    return res.status(badCurrent?401:400).json({ok:false,error:message});
  }
};
