const {
  requireUser,saveUser,claimUsername,publicUser,validateNickname,encryptSensitive,decryptSensitive,
  AGREEMENT_VERSIONS,PARTY_OPTIONS,normalizePhone,validatePhone,validateRegion,ensureNicknameAvailable
}=require('../../lib/user_auth');
module.exports=async function(req,res){
  if(!['POST','PATCH'].includes(req.method)) return res.status(405).json({ok:false,error:'Method not allowed'});
  const user=await requireUser(req,res); if(!user) return;
  const b=req.body||{};
  if(Object.prototype.hasOwnProperty.call(b,'username') && String(b.username||'').trim()){
    try{ await claimUsername(user,b.username); }catch(e){ return res.status(400).json({ok:false,error:e.message||String(e)}); }
  }
  if(Object.prototype.hasOwnProperty.call(b,'nickname')){
    if(!validateNickname(b.nickname)) return res.status(400).json({ok:false,error:'닉네임은 2~20자로 입력해주세요.'});
    const nextNickname=String(b.nickname).trim();
    if(nextNickname!==String(user.nickname||'')){try{await ensureNicknameAvailable(nextNickname,user.id);}catch(e){return res.status(409).json({ok:false,error:e.message||String(e)});}}
    user.nickname=nextNickname;
  }
  if(Object.prototype.hasOwnProperty.call(b,'phone') || Object.prototype.hasOwnProperty.call(b,'regionMain') || Object.prototype.hasOwnProperty.call(b,'regionSub') || Object.prototype.hasOwnProperty.call(b,'regionDistrict')){
    const current=decryptSensitive(user.profileDataEnc)||{};
    const phone=Object.prototype.hasOwnProperty.call(b,'phone')?normalizePhone(b.phone):String(current.phone||'');
    const cr=current.region||{};
    const region=validateRegion(
      Object.prototype.hasOwnProperty.call(b,'regionMain')?b.regionMain:cr.main,
      Object.prototype.hasOwnProperty.call(b,'regionSub')?b.regionSub:cr.sub,
      Object.prototype.hasOwnProperty.call(b,'regionDistrict')?b.regionDistrict:cr.district
    );
    if(!validatePhone(phone))return res.status(400).json({ok:false,error:'전화번호를 확인해주세요.'});
    if(!region)return res.status(400).json({ok:false,error:'지역을 시·도부터 시·군·구까지 선택해주세요.'});
    user.profileDataEnc=encryptSensitive({phone,region});
  }
  if(Object.prototype.hasOwnProperty.call(b,'notificationsEnabled')){
    if(typeof b.notificationsEnabled!=='boolean') return res.status(400).json({ok:false,error:'알림 설정값이 올바르지 않습니다.'});
    user.notificationsEnabled=b.notificationsEnabled;
    user.notificationsUpdatedAt=new Date().toISOString();
  }
  if(Object.prototype.hasOwnProperty.call(b,'partyPreference') || Object.prototype.hasOwnProperty.call(b,'sensitiveConsent')){
    const consent=b.sensitiveConsent===true;
    const party=String(b.partyPreference||'').trim();
    if(!consent) return res.status(400).json({ok:false,error:'선호정당을 저장하려면 정치적 관심정보 수집·이용 동의가 필요합니다.'});
    if(!PARTY_OPTIONS.includes(party)) return res.status(400).json({ok:false,error:'선호정당을 선택해주세요.'});
    user.politicalPreferenceEnc=encryptSensitive({party,sensitiveConsent:true,consentVersion:AGREEMENT_VERSIONS.sensitivePreference,consentAt:new Date().toISOString()});
  }
  await saveUser(user);
  return res.json({ok:true,user:publicUser(user)});
};
