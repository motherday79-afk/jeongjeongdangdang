const {requireAdmin}=require('../../lib/auth');
const {getNowIssue,saveNowIssue,getSurvey,saveSurvey,surveyStats}=require('../../lib/site_settings');
module.exports=async function(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const [nowIssue,survey]=await Promise.all([getNowIssue(),getSurvey()]);
      const stats=await surveyStats(survey,null);
      return res.json({ok:true,nowIssue,survey:{...survey,stats}});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{},action=String(b.action||'');
    if(action==='save-now-issue')return res.json({ok:true,nowIssue:await saveNowIssue(b.nowIssue||b,admin)});
    if(action==='save-survey'){
      const survey=await saveSurvey(b.survey||b,admin);const stats=await surveyStats(survey,null);
      return res.json({ok:true,survey:{...survey,stats}});
    }
    return res.status(400).json({ok:false,error:'지원하지 않는 설정 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
