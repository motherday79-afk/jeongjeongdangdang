const store=require('../lib/store');
const {publicSnapshot}=require('../lib/public_snapshot');
const {getPresidentPage,getNowIssue,getRapidRise,getSurvey,surveyStats}=require('../lib/site_settings');
const {getAllOverrides,publicOverrides}=require('../lib/member_metrics');
const {getRepresentativeBadges}=require('../lib/badges');

const NEWS_POSTS='jjdd:news:posts:v1';
function publicSurveyStats(stats){const s=stats||{};return {counts:Array.isArray(s.counts)?s.counts:[],total:Math.max(0,Number(s.total||0)),userVote:null};}
async function currentPublic(){
  let current=await store.getJSON('jjdd:current:public');
  if(!current||Number(current.schemaVersion||0)<4||!current.rosterVersion){const full=await store.getJSON('jjdd:current');if(full)current=publicSnapshot(full);}
  return current||null;
}
async function latestNews(limit=16){
  const rows=await store.cmd(['LRANGE',NEWS_POSTS,'0',String(Math.max(0,Math.min(30,Number(limit||16))-1))]).catch(()=>[]),posts=[];
  for(const raw of (rows||[])){try{posts.push(JSON.parse(raw));}catch(_){}}
  const reps=await getRepresentativeBadges(posts.map(p=>p.authorId)).catch(()=>({}));
  return posts.map(p=>{const iv=String(p.imageVersion||p.imageUpdatedAt||p.updatedAt||p.createdAt||'1').replace(/[^A-Za-z0-9._:-]/g,'').slice(0,80)||'1';return {id:p.id,category:p.category,title:p.title,excerpt:p.excerpt,content:p.content,author:p.author,authorId:p.authorId||null,role:p.role,createdAt:p.createdAt,updatedAt:p.updatedAt||null,hasImage:Boolean(p.hasImage),imageVersion:iv,imageUrl:p.hasImage?`/api/news?action=image&id=${encodeURIComponent(p.id)}&v=${encodeURIComponent(iv)}`:null,representativeBadge:p.authorId&&!String(p.authorId).startsWith('admin:')?reps[p.authorId]??null:null};});
}
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=15, stale-while-revalidate=45');
  res.setHeader('CDN-Cache-Control','public, max-age=15, stale-while-revalidate=45');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=15, stale-while-revalidate=45');
  try{
    const lite=String(req.query?.lite||'')==='1';
    const survey=await getSurvey();
    const baseTasks=[getPresidentPage(),getNowIssue(),getRapidRise(),surveyStats(survey,null),getAllOverrides(),latestNews(16)];
    const [presidentPage,nowIssue,rapidRise,stats,metricMap,news]=await Promise.all(baseTasks);
    // v2.7.0 INSTANT HOME: 재방문자는 브라우저의 직전 공개 Rank를 즉시 그리고,
    // HOME endpoint에서는 우측 사이드바/설정/COLUMN만 가볍게 갱신합니다.
    if(lite)return res.json({ok:true,lite:true,generatedAt:new Date().toISOString(),site:{presidentPage,nowIssue,rapidRise,survey:{...survey,stats:publicSurveyStats(stats)},metricOverrides:publicOverrides(metricMap),loggedIn:false},news});
    const rank=await currentPublic();
    if(!rank)return res.status(404).json({ok:false,error:'published snapshot not found'});
    return res.json({ok:true,generatedAt:new Date().toISOString(),rank,site:{presidentPage,nowIssue,rapidRise,survey:{...survey,stats:publicSurveyStats(stats)},metricOverrides:publicOverrides(metricMap),loggedIn:false},news});
  }catch(e){return res.status(503).json({ok:false,error:'home snapshot unavailable'});}
};
