const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
module.exports=async function handler(req,res){
  if(!requireAdmin(req,res))return;
  try{
    store.config();const current=await store.getJSON('jjdd:current');
    const sources={googleNews:true,naverNews:Boolean(process.env.NAVER_API_HUB_CLIENT_ID&&process.env.NAVER_API_HUB_CLIENT_SECRET),kakao:Boolean(process.env.KAKAO_REST_API_KEY),youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN),internal:true};
    return res.status(200).json({ok:true,store:true,sources,current:current?{timestamp:current.timestamp,version:current.version,top:current.members?.slice?.(0,5)||[]}:null,defaults:{eventTitle:process.env.DEFAULT_EVENT_TITLE||'민주당 8·17 전당대회',eventKeywords:(process.env.DEFAULT_EVENT_KEYWORDS||'더불어민주당 전당대회,8·17 전당대회,당대표 경선').split(',').map(x=>x.trim()).filter(Boolean)}});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e),store:false});}
};
