const {authenticate,requireUser,rateLimit}=require('../lib/user_auth');
const {requireAdmin}=require('../lib/auth');
const {resolveReferrerNickname,getDashboard,claimGift,getSecretConfig,saveSecretConfig,adminReferralOverview,adminGiftOverview,adminSetReferralStatus,adminReassignReferral,adminRecalculateReferrals,adminSetGiftStatus}=require('../lib/referrals');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  const action=String(req.query?.action||req.body?.action||'dashboard');
  try{
    if(req.method==='GET'){
      if(action==='resolve'){
        const rl=await rateLimit(req,'referral-resolve',40,3600);if(!rl.ok)return res.status(429).json({ok:false,error:'추천인 확인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
        const u=await resolveReferrerNickname(req.query?.nickname);return res.json({ok:true,found:Boolean(u),nickname:u?.nickname||null});
      }
      if(action==='admin-overview'){
        const admin=requireAdmin(req,res);if(!admin)return;const [relations,gifts,secretConfig]=await Promise.all([adminReferralOverview(),adminGiftOverview(),getSecretConfig()]);return res.json({ok:true,relations,gifts,secretConfig});
      }
      const user=await requireUser(req,res);if(!user)return;return res.json(await getDashboard(user.id));
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{};
    if(action==='gift-claim'){
      const user=await requireUser(req,res);if(!user)return;return res.json({ok:true,gift:await claimGift(user.id,b)});
    }
    if(action.startsWith('admin-')){
      const admin=requireAdmin(req,res);if(!admin)return;
      if(action==='admin-referral-status')return res.json({ok:true,relation:await adminSetReferralStatus(String(b.referredId||''),b.status,b.note)});
      if(action==='admin-referral-reassign')return res.json({ok:true,relation:await adminReassignReferral(String(b.referredId||''),String(b.referrerNickname||''),b.note)});
      if(action==='admin-recalculate')return res.json({ok:true,summary:await adminRecalculateReferrals()});
      if(action==='admin-secret-config')return res.json({ok:true,secretConfig:await saveSecretConfig(b.config||{})});
      if(action==='admin-gift-status')return res.json({ok:true,gift:await adminSetGiftStatus(b)});
      return res.status(400).json({ok:false,error:'지원하지 않는 추천/선물 관리자 작업입니다.'});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(e?.code==='AMBIGUOUS_NICKNAME'?409:400).json({ok:false,error:e.message||String(e)});}
};
