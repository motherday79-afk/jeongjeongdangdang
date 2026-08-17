const {createUser,publicUser,sessionCookie,rateLimit}=require('../../lib/user_auth');
const {resolveReferrerNickname,createReferral}=require('../../lib/referrals');
module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'Method not allowed'});
  const rl=await rateLimit(req,'signup',8,3600);
  if(!rl.ok) return res.status(429).json({ok:false,error:'회원가입 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
  const b=req.body||{};
  try{
    const referralNickname=String(b.referralNickname||'').trim();
    const referrer=referralNickname?await resolveReferrerNickname(referralNickname):null;
    const user=await createUser({
      username:b.username,email:b.email,password:b.password,phone:b.phone,
      regionMain:b.regionMain,regionSub:b.regionSub,regionDistrict:b.regionDistrict,
      partyPreference:b.partyPreference,sensitiveConsent:b.sensitiveConsent===true,
      agreeTerms:b.agreeTerms===true,agreePrivacy:b.agreePrivacy===true,age14:b.age14===true
    });
    let referral=null;
    if(referrer){if(String(referrer.id)===String(user.id))throw new Error('본인을 추천인으로 등록할 수 없습니다.');referral=await createReferral({referredId:user.id,referrerId:referrer.id,referrerNickname:referrer.nickname});}
    res.setHeader('Set-Cookie',sessionCookie(user));
    return res.status(201).json({ok:true,user:publicUser(user),referral:referral?{registered:true,nickname:referrer.nickname,status:referral.status}:null});
  }catch(e){ return res.status(400).json({ok:false,error:e.message||String(e)}); }
};
