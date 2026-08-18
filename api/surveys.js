const {authenticate,requireUser,rateLimit}=require('../lib/user_auth');
const {getSession,requireAdmin}=require('../lib/auth');
const {getSurvey,surveyStats,voteSurvey,editSurveyInPlace}=require('../lib/site_settings');
const {getArchivePosts,updateArchivePost,listComments,commentCount,addComment,deleteComment}=require('../lib/survey_posts');

function publicStats(s){return {counts:Array.isArray(s?.counts)?s.counts:[],total:Math.max(0,Number(s?.total||0)),userVote:Number.isInteger(s?.userVote)?s.userVote:null};}
async function pollList(userId){
  const current=await getSurvey(),stats=await surveyStats(current,userId||null),archives=await getArchivePosts();
  const currentRow={...current,status:current.active===false?'ENDED':'ACTIVE',current:true,stats:publicStats(stats),commentCount:await commentCount(current.id)};
  const archiveRows=await Promise.all(archives.map(async p=>({
    ...p,current:false,active:p.status==='ACTIVE',
    stats:{counts:p.counts||[],total:(p.counts||[]).reduce((a,b)=>a+Number(b||0),0),userVote:null},
    commentCount:await commentCount(p.id)
  })));
  return [currentRow,...archiveRows];
}

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query?.action||req.body?.action||'list'),b=req.body||{};
  try{
    if(req.method==='GET'&&action==='comments'){
      const id=String(req.query?.id||'').trim();if(!id)return res.status(400).json({ok:false,error:'설문 ID가 없습니다.'});
      return res.json({ok:true,comments:await listComments(id),isAdmin:Boolean(getSession(req))});
    }
    if(req.method==='GET'||action==='list'){
      const me=await authenticate(req).catch(()=>null);
      return res.json({ok:true,posts:await pollList(me?.id||null),isAdmin:Boolean(getSession(req)),canComment:Boolean(me),me:me?{id:me.id,nickname:me.nickname,role:me.role}:null});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='comment'){
      const user=await requireUser(req,res);if(!user)return;
      const lim=await rateLimit(req,'survey-comment',40,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'});
      const id=String(b.surveyId||'').trim();if(!id)return res.status(400).json({ok:false,error:'설문 ID가 없습니다.'});
      const comment=await addComment(id,user,b.content);return res.json({ok:true,comment,count:await commentCount(id)});
    }
    if(action==='vote'){
      const user=await requireUser(req,res);if(!user)return;
      const current=await getSurvey();if(String(b.surveyId||current.id)!==String(current.id))return res.status(400).json({ok:false,error:'종료된 설문에는 투표할 수 없습니다.'});
      const stats=await voteSurvey(current,user.id,b.optionIndex);return res.json({ok:true,stats:publicStats(stats)});
    }
    if(action==='admin-update'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const id=String(b.id||'').trim(),current=await getSurvey();
      let post;
      if(id===String(current.id)){
        post=await editSurveyInPlace({title:b.title,subtitle:b.subtitle,options:b.options,active:b.status!=='ENDED'},admin);
        post={...post,current:true,status:post.active===false?'ENDED':'ACTIVE',stats:publicStats(await surveyStats(post,null)),commentCount:await commentCount(post.id)};
      }else{
        post=await updateArchivePost(id,b,admin);post={...post,current:false,active:post.status==='ACTIVE',stats:{counts:post.counts||[],total:(post.counts||[]).reduce((a,c)=>a+Number(c||0),0),userVote:null},commentCount:await commentCount(post.id)};
      }
      return res.json({ok:true,post});
    }
    if(action==='admin-delete-comment'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const ok=await deleteComment(b.surveyId,b.commentId);return res.json({ok:true,deleted:ok});
    }
    return res.status(400).json({ok:false,error:'지원하지 않는 설문 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
