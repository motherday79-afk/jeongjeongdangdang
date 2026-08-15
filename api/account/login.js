const {getUserByUsername,getUserByEmail,verifyPassword,saveUser,publicUser,sessionCookie,rateLimit}=require('../../lib/user_auth');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const rl=await rateLimit(req,'login',20,900);
  if(!rl.ok) return res.status(429).json({ok:false,error:'로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.'});
  const b=req.body||{};
  const identifier=String(b.username||b.identifier||b.email||'').trim();
  // v2.0 기존 테스트 계정은 아이디가 없으므로 이메일 로그인을 조용히 호환합니다.
  let user=await getUserByUsername(identifier);
  if(!user && identifier.includes('@')) user=await getUserByEmail(identifier);
  const ok=user && String(user.status||'ACTIVE')==='ACTIVE' && await verifyPassword(b.password,user.passwordHash);
  if(!ok) return res.status(401).json({ok:false,error:'아이디 또는 비밀번호가 올바르지 않습니다.'});
  user.lastLoginAt=new Date().toISOString();
  await saveUser(user);
  res.setHeader('Set-Cookie',sessionCookie(user));
  return res.json({ok:true,user:publicUser(user)});
};
