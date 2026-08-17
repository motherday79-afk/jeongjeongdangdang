const {clearCookie,getSession,revokeAdminSession}=require('../../lib/auth');
const {recordAdminAudit}=require('../../lib/security');
module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  const session=getSession(req);if(session){await revokeAdminSession(session).catch(()=>{});await recordAdminAudit(req,{type:'LOGOUT',adminId:session.id,success:true}).catch(()=>{});}
  res.setHeader('Set-Cookie',clearCookie());return res.status(200).json({ok:true});
};
