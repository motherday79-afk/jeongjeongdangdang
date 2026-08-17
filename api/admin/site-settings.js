const {requireAdmin}=require('../../lib/auth');
const {
  getPresidentPage,savePresidentPage,getNowIssue,saveNowIssue,getRapidRise,saveRapidRise,getSurvey,saveSurvey,surveyStats,
  surveyModeration,recountSurvey,invalidateSurveyVote,restoreSurveyVote,invalidateSurveyOption,
  setSurveyAdjustment,clearSurveyAdjustments,resetSurveyResponses
}=require('../../lib/site_settings');
const {getUserById,publicUser}=require('../../lib/user_auth');

async function enrichedModeration(survey,limit){
  const m=await surveyModeration(survey,limit);
  const ids=[...new Set([...(m.active||[]),...(m.invalid||[])].map(x=>String(x.userId||'')).filter(Boolean))];
  const users=new Map();
  await Promise.all(ids.map(async id=>{try{const u=await getUserById(id);if(u)users.set(id,publicUser(u,{includePreference:true,includePrivateProfile:true}));}catch(_){}}));
  const addUser=row=>({...row,user:users.get(String(row.userId))||null});
  return {...m,active:(m.active||[]).map(addUser),invalid:(m.invalid||[]).map(addUser)};
}
module.exports=async function(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const [presidentPage,nowIssue,rapidRise,survey]=await Promise.all([getPresidentPage(),getNowIssue(),getRapidRise(),getSurvey()]);
      const stats=await surveyStats(survey,null);
      return res.json({ok:true,presidentPage,nowIssue,rapidRise,survey:{...survey,stats}});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{},action=String(b.action||'');
    if(action==='save-president-page')return res.json({ok:true,presidentPage:await savePresidentPage(b.presidentPage||b,admin)});
    if(action==='save-now-issue')return res.json({ok:true,nowIssue:await saveNowIssue(b.nowIssue||b,admin)});
    if(action==='save-rapid-rise')return res.json({ok:true,rapidRise:await saveRapidRise(b.rapidRise||b,admin)});
    if(action==='save-survey'){
      const survey=await saveSurvey(b.survey||b,admin);const stats=await surveyStats(survey,null);
      return res.json({ok:true,survey:{...survey,stats}});
    }
    if(action==='survey-moderation'){
      const survey=await getSurvey();return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='recount-survey'){
      const survey=await getSurvey();await recountSurvey(survey);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='invalidate-survey-vote'){
      const survey=await getSurvey();await invalidateSurveyVote(survey,b.userId,b.reason,admin);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='restore-survey-vote'){
      const survey=await getSurvey();await restoreSurveyVote(survey,b.userId,admin);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='invalidate-survey-option'){
      const survey=await getSurvey(),r=await invalidateSurveyOption(survey,b.optionIndex,b.reason,admin);return res.json({ok:true,changed:r.changed,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='set-survey-adjustment'){
      const survey=await getSurvey();await setSurveyAdjustment(survey,b.optionIndex,b.delta,b.reason,admin);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='clear-survey-adjustments'){
      const survey=await getSurvey();await clearSurveyAdjustments(survey,admin);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    if(action==='reset-survey-responses'){
      const survey=await getSurvey();await resetSurveyResponses(survey,b.reason,admin);return res.json({ok:true,survey:{...survey,stats:await surveyStats(survey,null)},moderation:await enrichedModeration(survey,b.limit)});
    }
    return res.status(400).json({ok:false,error:'지원하지 않는 설정 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
