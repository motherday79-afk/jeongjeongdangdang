const {authenticate,publicUser,AGREEMENT_VERSIONS}=require('../../lib/user_auth');
const {recordVisit}=require('../../lib/badges');
module.exports=async function(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method not allowed'});
  const user=await authenticate(req);
  if(!user) return res.status(401).json({ok:false,error:'로그인이 필요합니다.'});
  await recordVisit(user.id).catch(()=>{});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,user:publicUser(user),agreementVersions:AGREEMENT_VERSIONS});
};
