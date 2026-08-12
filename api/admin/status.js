const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
const {credentialStatus}=require('../_lib/naver_common');
module.exports=async function handler(req,res){
  if(!requireAdmin(req,res))return;
  try{
    store.config();const current=await store.getJSON('jjdd:current');
    const h=current?.sourceHealth||{},naver=credentialStatus();
    const sources={
      googleNews:true,naverSearchTrend:naver.configured,naverCommon:naver.configured,googleTrends:true,wikimedia:true,
      naverHtml:['READY','OK','ADVISORY_DISALLOW','ADVISORY_UNKNOWN','DEGRADED'].includes(h.naverHtml?.state),
      daumHtml:['READY','OK','ADVISORY_DISALLOW','ADVISORY_UNKNOWN','DEGRADED'].includes(h.daumHtml?.state),
      youtubeHtml:['READY','OK','ADVISORY_DISALLOW','ADVISORY_UNKNOWN','DEGRADED'].includes(h.youtubeHtml?.state),
      naverNews:naver.configured,
      kakao:Boolean(process.env.KAKAO_REST_API_KEY),youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),internal:true
    };
    return res.status(200).json({ok:true,store:true,sources,naverCredential:naver,sourceHealth:h,current:current?{timestamp:current.timestamp,version:current.version,top:current.members?.slice?.(0,5)||[]}:null,defaults:{eventTitle:process.env.DEFAULT_EVENT_TITLE||'민주당 8·17 전당대회',eventKeywords:(process.env.DEFAULT_EVENT_KEYWORDS||'더불어민주당 전당대회,8·17 전당대회,당대표 경선').split(',').map(x=>x.trim()).filter(Boolean)}});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e),store:false});}
};
