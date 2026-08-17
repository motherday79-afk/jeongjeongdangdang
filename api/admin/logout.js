const {clearCookie,getSession}=require('../../lib/auth');
const {recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  const session=getSession(req);
  if(session)await recordAdminAudit(req,{type:'LOGOUT',adminId:session.id,success:true}).catch(()=>{});
  res.setHeader('Set-Cookie',clearCookie());
  return res.status(200).json({ok:true});
};
