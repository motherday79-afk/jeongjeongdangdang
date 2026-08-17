const store=require('../lib/store');
const {publicSnapshot}=require('../lib/public_snapshot');
const {getNowIssue,getRapidRise,getSurvey,surveyStats}=require('../lib/site_settings');
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
  return posts.map(p=>({id:p.id,category:p.category,title:p.title,excerpt:p.excerpt,content:p.content,author:p.author,authorId:p.authorId||null,role:p.role,createdAt:p.createdAt,hasImage:Boolean(p.hasImage),imageUrl:p.hasImage?`/api/news?action=image&id=${encodeURIComponent(p.id)}`:null,representativeBadge:p.authorId&&!String(p.authorId).startsWith('admin:')?reps[p.authorId]??null:null}));
}
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'Method not allowed'});
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=15, stale-while-revalidate=45');
  res.setHeader('CDN-Cache-Control','public, max-age=15, stale-while-revalidate=45');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=15, stale-while-revalidate=45');
  try{
    const survey=await getSurvey();
    const [rank,nowIssue,rapidRise,stats,metricMap,news]=await Promise.all([currentPublic(),getNowIssue(),getRapidRise(),surveyStats(survey,null),getAllOverrides(),latestNews(16)]);
    if(!rank)return res.status(404).json({ok:false,error:'published snapshot not found'});
    return res.json({ok:true,generatedAt:new Date().toISOString(),rank,site:{nowIssue,rapidRise,survey:{...survey,stats:publicSurveyStats(stats)},metricOverrides:publicOverrides(metricMap),loggedIn:false},news});
  }catch(e){return res.status(503).json({ok:false,error:'home snapshot unavailable'});}
};
