const {requireUser,saveUser,claimUsername,publicUser,validateNickname,encryptSensitive,AGREEMENT_VERSIONS}=require('../../lib/user_auth');
const PARTY_OPTIONS=['더불어민주당','국민의힘','조국혁신당','개혁신당','진보당','기본소득당','사회민주당','무소속','기타','특정 정당 없음'];
module.exports=async function(req,res){
  if(!['POST','PATCH'].includes(req.method)) return res.status(405).json({ok:false,error:'Method not allowed'});
  const user=await requireUser(req,res); if(!user) return;
  const b=req.body||{};
  if(Object.prototype.hasOwnProperty.call(b,'username') && String(b.username||'').trim()){
    try{ await claimUsername(user,b.username); }catch(e){ return res.status(400).json({ok:false,error:e.message||String(e)}); }
  }
  if(Object.prototype.hasOwnProperty.call(b,'nickname')){
    if(!validateNickname(b.nickname)) return res.status(400).json({ok:false,error:'닉네임은 2~20자로 입력해주세요.'});
    user.nickname=String(b.nickname).trim();
  }
  if(Object.prototype.hasOwnProperty.call(b,'partyPreference') || Object.prototype.hasOwnProperty.call(b,'sensitiveConsent')){
    const consent=b.sensitiveConsent===true;
    const party=String(b.partyPreference||'').trim();
    if(!consent || !party){
      user.politicalPreferenceEnc=null;
    }else{
      if(!PARTY_OPTIONS.includes(party)) return res.status(400).json({ok:false,error:'선택할 수 없는 관심 정당입니다.'});
      user.politicalPreferenceEnc=encryptSensitive({party,sensitiveConsent:true,consentVersion:AGREEMENT_VERSIONS.sensitivePreference,consentAt:new Date().toISOString()});
    }
  }
  await saveUser(user);
  return res.json({ok:true,user:publicUser(user)});
};
