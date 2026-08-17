const {getUserByUsername,getUserByEmail,verifyPassword,saveUser,publicUser,sessionCookie,rateLimit}=require('../../lib/user_auth');
const {identifierRateLimit,applyRateLimitResponse}=require('../../lib/security');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const b=req.body||{},identifier=String(b.username||b.identifier||b.email||'').trim().slice(0,190),password=String(b.password||'');
  if(!identifier||password.length<1||password.length>128)return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
  const [ipRl,idRl]=await Promise.all([rateLimit(req,'login',20,900),identifierRateLimit(req,'member-login-id',identifier,30,1800)]);
  if(!ipRl.ok||!idRl.ok)return applyRateLimitResponse(res,!ipRl.ok?{retryAfter:900}:{...idRl},'로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
  let user=await getUserByUsername(identifier);if(!user && identifier.includes('@')) user=await getUserByEmail(identifier);
  const ok=user && String(user.status||'ACTIVE')==='ACTIVE' && await verifyPassword(password,user.passwordHash);
  if(!ok) return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
  user.lastLoginAt=new Date().toISOString();await saveUser(user);res.setHeader('Set-Cookie',sessionCookie(user));return res.json({ok:true,user:publicUser(user)});
};
