const {createUser,publicUser,sessionCookie,rateLimit}=require('../../lib/user_auth');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const rl=await rateLimit(req,'signup',8,3600);
  if(!rl.ok) return res.status(429).json({ok:false,error:'회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
  const b=req.body||{};
  try{
    const user=await createUser({username:b.username,email:b.email,password:b.password,nickname:b.nickname,agreeTerms:b.agreeTerms===true,agreePrivacy:b.agreePrivacy===true,age14:b.age14===true});
    res.setHeader('Set-Cookie',sessionCookie(user));
    return res.status(201).json({ok:true,user:publicUser(user)});
  }catch(e){ return res.status(400).json({ok:false,error:e.message||String(e)}); }
};
