const crypto=require('crypto');
const {cmd}=require('../../lib/store');
const {authenticate,requireUser,rateLimit}=require('../../lib/user_auth');
const {requireAdmin,getSession}=require('../../lib/auth');
const {getRepresentativeBadge,getRepresentativeBadges,recordActivity,getSeasonConfig,followState,manualAward}=require('../../lib/badges');

const POSTS='jjdd:itsme:posts:v1';
const LIKE_COUNTS='jjdd:itsme:like-counts:v1';
const COMMENT_COUNTS='jjdd:itsme:comment-counts:v1';
const MAX_POSTS=500;
function clean(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max)}
function hashObj(v){if(!v)return{};if(!Array.isArray(v)&&typeof v==='object')return v;const o={};for(let i=0;i<(v||[]).length;i+=2)o[String(v[i])]=v[i+1];return o}
function likeKey(id){return `jjdd:itsme:likes:${String(id)}`}
function commentKey(id){return `jjdd:itsme:comments:${String(id)}`}
async function findRow(id){const rows=await cmd(['LRANGE',POSTS,'0',String(MAX_POSTS-1)]).catch(()=>[]),target=String(id||'');for(let i=0;i<(rows||[]).length;i++){try{const p=JSON.parse(rows[i]);if(String(p.id)===target)return {index:i,raw:rows[i],post:p}}catch(_){}}return null}
async function enriched(p,likes,comments,me,repOverride,relationOverride){
  const rep=repOverride!==undefined?repOverride:await getRepresentativeBadge(p.authorId).catch(()=>null);let liked=false;if(me?.id)liked=Boolean(Number(await cmd(['SISMEMBER',likeKey(p.id),String(me.id)]).catch(()=>0)));const relation=relationOverride!==undefined?relationOverride:await followState(me?.id,p.authorId).catch(()=>({following:false,followers:0}));
  const likeCount=Number(likes?.[p.id]??p.likeCount??0),commentCount=Number(comments?.[p.id]??p.commentCount??0);return {id:p.id,seasonId:p.seasonId,roleTag:p.roleTag,title:p.title,content:p.content,author:p.author,authorId:p.authorId,role:p.role,createdAt:p.createdAt,updatedAt:p.updatedAt||null,featured:Boolean(p.featured),winner:Boolean(p.winner),likeCount,commentCount,score:likeCount*3+commentCount*2,liked,representativeBadge:rep,authorFollowers:relation.followers,followingAuthor:relation.following};
}
async function list(limit,me){
  const [rows,likesRaw,commentsRaw]=await Promise.all([cmd(['LRANGE',POSTS,'0',String(Math.max(0,Math.min(MAX_POSTS-1,Number(limit||80)-1)))]).catch(()=>[]),cmd(['HGETALL',LIKE_COUNTS]).catch(()=>null),cmd(['HGETALL',COMMENT_COUNTS]).catch(()=>null)]);const likes=hashObj(likesRaw),comments=hashObj(commentsRaw),posts=[];for(const raw of (rows||[])){try{posts.push(JSON.parse(raw))}catch(_){}}const authorIds=[...new Set(posts.map(p=>String(p.authorId||'')).filter(Boolean))],reps=await getRepresentativeBadges(authorIds).catch(()=>({})),relations={};await Promise.all(authorIds.map(async id=>{relations[id]=await followState(me?.id,id).catch(()=>({following:false,followers:0}));}));const arr=await Promise.all(posts.map(p=>enriched(p,likes,comments,me,reps[p.authorId]??null,relations[p.authorId]||{following:false,followers:0})));
  arr.sort((a,b)=>Number(b.winner)-Number(a.winner)||Number(b.featured)-Number(a.featured)||b.score-a.score||String(b.createdAt).localeCompare(String(a.createdAt)));return arr;
}
function activeSeason(s){const now=Date.now(),start=Date.parse(s?.startAt||''),end=Date.parse(s?.endAt||'');return s?.enabled!==false&&Number.isFinite(start)&&Number.isFinite(end)&&now>=start&&now<=end}
function roleLabel(role){return `잇츠미? ${role}!`}

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');const b=req.body||{},action=String(b.action||req.query?.action||'list');
  try{
    const season=await getSeasonConfig();
    if(req.method==='GET'||action==='list'){
      const me=await authenticate(req).catch(()=>null),posts=await list(Number(req.query?.limit||80),me);return res.json({ok:true,season:{...season,active:activeSeason(season)},posts,canWrite:Boolean(me&&activeSeason(season)),isAdmin:Boolean(getSession(req)),me:me?{id:me.id,nickname:me.nickname,role:me.role}:null});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='admin-update'||action==='admin-delete'||action==='admin-feature'||action==='admin-winner'){
      const admin=requireAdmin(req,res);if(!admin)return;const row=await findRow(b.id);if(!row)return res.status(404).json({ok:false,error:'IT’S ME 게시글을 찾을 수 없습니다.'});
      if(action==='admin-delete'){await cmd(['LREM',POSTS,'1',row.raw]);await cmd(['DEL',commentKey(row.post.id)]).catch(()=>{});await cmd(['DEL',likeKey(row.post.id)]).catch(()=>{});await cmd(['HDEL',LIKE_COUNTS,row.post.id]).catch(()=>{});await cmd(['HDEL',COMMENT_COUNTS,row.post.id]).catch(()=>{});return res.json({ok:true,deletedId:row.post.id});}
      if(action==='admin-feature'){const next={...row.post,featured:b.featured!==false,featuredAt:new Date().toISOString(),featuredBy:String(admin.id||'admin')};await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);return res.json({ok:true,post:await enriched(next,{}, {},null)});}
      if(action==='admin-winner'){const winner=b.winner!==false,next={...row.post,winner,featured:winner?true:Boolean(row.post.featured),winnerAt:winner?new Date().toISOString():null,winnerBy:winner?String(admin.id||'admin'):null};await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);if(winner&&row.post.authorId)await manualAward(row.post.authorId,'challenge_winner',`${season.title||season.id||'IT’S ME'} 시즌 우승`);return res.json({ok:true,post:await enriched(next,{}, {},null)});}
      const title=clean(b.title,100),content=clean(b.content,8000),role=clean(b.roleTag,20);if(title.length<2||content.length<5)return res.status(400).json({ok:false,error:'제목은 2자, 정책 내용은 5자 이상 입력해주세요.'});const allowed=Array.isArray(season.roles)?season.roles:[];const roleTag=allowed.includes(role)?role:(allowed[0]||'국회의원');const next={...row.post,title,content,roleTag,updatedAt:new Date().toISOString(),adminEditedAt:new Date().toISOString(),adminEditedBy:String(admin.id||'admin')};await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);return res.json({ok:true,post:await enriched(next,{}, {},null)});
    }
    if(action==='create'){
      const user=await requireUser(req,res);if(!user)return;if(!activeSeason(season))return res.status(409).json({ok:false,error:'현재 IT’S ME 시즌의 제안 접수가 종료되었습니다.'});const lim=await rateLimit(req,'itsme-create',10,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'짧은 시간에 정책 제안이 너무 많습니다. 잠시 후 다시 시도해주세요.'});const title=clean(b.title,100),content=clean(b.content,8000),role=clean(b.roleTag,20),allowed=Array.isArray(season.roles)?season.roles:[];if(title.length<2||content.length<5)return res.status(400).json({ok:false,error:'제목은 2자, 정책 내용은 5자 이상 입력해주세요.'});if(!allowed.includes(role))return res.status(400).json({ok:false,error:'IT’S ME 말머리를 선택해주세요.'});const post={id:`im_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,seasonId:season.id,roleTag:role,title,content,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',createdAt:new Date().toISOString(),featured:false,schemaVersion:1};await cmd(['LPUSH',POSTS,JSON.stringify(post)]);await cmd(['LTRIM',POSTS,'0',String(MAX_POSTS-1)]);await Promise.all([recordActivity(user.id,'itsmePosts',1),recordActivity(user.id,'itsmeRole',1,{role})]);return res.json({ok:true,post:await enriched(post,{}, {},user),label:roleLabel(role)});
    }
    if(action==='like'||action==='unlike'){
      const user=await requireUser(req,res);if(!user)return;const row=await findRow(b.postId);if(!row)return res.status(404).json({ok:false,error:'게시글을 찾을 수 없습니다.'});const key=likeKey(row.post.id);let changed=0;if(action==='like'){changed=Number(await cmd(['SADD',key,String(user.id)]));if(changed){await cmd(['HINCRBY',LIKE_COUNTS,row.post.id,'1']);await Promise.all([recordActivity(user.id,'likesGiven',1),row.post.authorId!==user.id?recordActivity(row.post.authorId,'likesReceived',1):Promise.resolve()]);}}else{changed=Number(await cmd(['SREM',key,String(user.id)]));if(changed){await cmd(['HINCRBY',LIKE_COUNTS,row.post.id,'-1']);await Promise.all([recordActivity(user.id,'likesGiven',-1),row.post.authorId!==user.id?recordActivity(row.post.authorId,'likesReceived',-1):Promise.resolve()]);}}const count=Math.max(0,Number(await cmd(['HGET',LIKE_COUNTS,row.post.id]).catch(()=>0)||0));return res.json({ok:true,liked:action==='like',likeCount:count});
    }
    if(action==='comments'){
      const postId=clean(b.postId,100);if(!postId)return res.status(400).json({ok:false,error:'게시글 ID가 없습니다.'});const key=commentKey(postId);
      if(b.mode==='list'){const rows=await cmd(['LRANGE',key,'0','199']).catch(()=>[]),me=await authenticate(req).catch(()=>null),comments=[];for(const raw of (rows||[])){try{comments.push(JSON.parse(raw))}catch(_){}}const reps=await getRepresentativeBadges(comments.map(c=>c.authorId)).catch(()=>({}));return res.json({ok:true,comments:comments.map(c=>({id:c.id,author:c.author,authorId:c.authorId,role:c.role,content:c.content,createdAt:c.createdAt,representativeBadge:reps[c.authorId]??null})),me:me?{id:me.id}:null});}
      const user=await requireUser(req,res);if(!user)return;const row=await findRow(postId);if(!row)return res.status(404).json({ok:false,error:'게시글을 찾을 수 없습니다.'});const content=clean(b.content,1600);if(!content)return res.status(400).json({ok:false,error:'댓글 내용을 입력해주세요.'});const lim=await rateLimit(req,'itsme-comment',30,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'});const c={id:`imc_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',content,createdAt:new Date().toISOString()};await cmd(['LPUSH',key,JSON.stringify(c)]);await cmd(['LTRIM',key,'0','199']);await cmd(['HINCRBY',COMMENT_COUNTS,postId,'1']).catch(()=>{});await Promise.all([recordActivity(user.id,'comments',1),recordActivity(user.id,'itsmeComments',1),row.post.authorId!==user.id?recordActivity(row.post.authorId,'commentsReceived',1):Promise.resolve()]);return res.json({ok:true,comment:{...c,representativeBadge:await getRepresentativeBadge(user.id)}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
