const {authenticate,requireUser,rateLimit}=require('../lib/user_auth');
const {getNowIssue,getSurvey,surveyStats,voteSurvey}=require('../lib/site_settings');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const [nowIssue,survey,me]=await Promise.all([getNowIssue(),getSurvey(),authenticate(req).catch(()=>null)]);
      const stats=await surveyStats(survey,me?.id||null);
      return res.json({ok:true,nowIssue,survey:{...survey,stats},loggedIn:Boolean(me)});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{};if(String(b.action||'')!=='vote-survey')return res.status(400).json({ok:false,error:'지원하지 않는 작업입니다.'});
    const user=await requireUser(req,res);if(!user)return;
    const lim=await rateLimit(req,'survey-vote',20,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'설문 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
    const survey=await getSurvey();const stats=await voteSurvey(survey,user.id,b.optionIndex);
    return res.json({ok:true,survey:{...survey,stats}});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
