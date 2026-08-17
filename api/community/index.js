const crypto=require('crypto');
const {cmd}=require('../../lib/store');
const {authenticate,requireUser,rateLimit}=require('../../lib/user_auth');
const {getSession,requireAdmin}=require('../../lib/auth');
const {flushDue}=require('../../lib/editorial');
const {getRepresentativeBadge,getRepresentativeBadges,recordActivity}=require('../../lib/badges');
const POSTS='jjdd:community:posts:v1';
const COMMENT_COUNTS='jjdd:community:comment-counts:v1';
const LIKE_COUNTS='jjdd:community:like-counts:v1';
function likeKey(id){return `jjdd:community:likes:${String(id)}`}
function escText(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeCategory(v){const x=escText(v,20);return ['자유토론','정책','지역정치','질문'].includes(x)?x:'자유토론';}
function parseHash(v){if(!v)return{};if(!Array.isArray(v)&&typeof v==='object')return v;const out={};for(let i=0;i<(v||[]).length;i+=2)out[String(v[i])]=v[i+1];return out;}

const DEMO_POSTS=[
{id:'demo_comm_1',category:'정책',title:'청년정책, 지원금보다 “정책 결정에 참여할 기회”가 더 중요하지 않을까요?',content:'대통령실이 8월 14일 청년정책 전문가 간담회를 열고 청년정책의 전환 방향을 논의했습니다. 개인적으로는 지원 액수만 늘리는 방식보다 청년이 실제 정책 설계와 평가 과정에 들어가는 구조가 훨씬 중요해 보입니다. 여러분은 어떤 변화가 가장 먼저 체감돼야 한다고 보시나요?',author:'청년정책읽기',authorId:null,role:'PLUS',createdAt:'2026-08-18T00:12:00.000Z',commentCount:3,likeCount:61,imageUrl:'/assets/portal/youth-policy.webp',demo:true},
{id:'demo_comm_2',category:'정책',title:'반도체 특별법 시행, 기업 지원만큼 지역 인프라와 인재가 따라가야 하지 않을까요?',content:'8월 11일부터 반도체산업 경쟁력 강화 및 지원에 관한 특별법이 시행됐습니다. 국가 차원의 지원 체계가 생기는 건 분명 큰 변화인데, 결국 시민이 체감하려면 교통·전력·용수·인재 양성과 지역 일자리까지 연결돼야 할 것 같습니다.',author:'산업지도',authorId:null,role:'PLUS',createdAt:'2026-08-17T23:36:00.000Z',commentCount:2,likeCount:44,imageUrl:'/assets/portal/community-meeting.webp',demo:true},
{id:'demo_comm_3',category:'자유토론',title:'주택공급 “매주 현장 점검”, 숫자 발표보다 실제 입주 속도를 봐야겠죠?',content:'정부가 주택공급 상황을 최우선 과제로 관리하고 현장을 정기적으로 점검하겠다고 밝힌 흐름을 보면, 이제는 계획 물량보다 인허가부터 착공·입주까지 얼마나 빨라지는지가 더 중요해 보입니다.',author:'집값체감',authorId:null,role:'FREE',createdAt:'2026-08-17T22:55:00.000Z',commentCount:2,likeCount:58,imageUrl:'/assets/portal/housing-economy.webp',demo:true},
{id:'demo_comm_4',category:'질문',title:'청년정책이 주거·일자리·교육으로 따로 움직이면 체감이 떨어지는 이유가 뭘까요?',content:'청년 입장에서는 주거, 일자리, 교육이 각각 다른 정책이 아니라 한 번에 연결된 삶의 문제인데 정부 정책은 부처별로 나뉘는 경우가 많습니다. 이번 청년정책 논의를 계기로 한 사람의 생애경로 중심으로 묶는 방식이 가능할지 궁금합니다.',author:'정책초점',authorId:null,role:'FREE',createdAt:'2026-08-17T22:18:00.000Z',commentCount:1,likeCount:29,imageUrl:'/assets/portal/youth-policy.webp',demo:true},
{id:'demo_comm_5',category:'지역정치',title:'반도체 지원이 수도권과 비수도권의 새로운 경쟁 구도를 만들 수도 있겠네요',content:'특별법 시행 이후 실제 투자와 기반시설 지원이 어디에 집중되는지가 지역 정치에서도 큰 쟁점이 될 것 같습니다. 지자체장과 지역 국회의원의 역할도 더 커질 수밖에 없겠죠.',author:'지역정치현장',authorId:null,role:'PLUS',createdAt:'2026-08-17T13:40:00.000Z',commentCount:1,likeCount:36,imageUrl:'/assets/portal/community-meeting.webp',demo:true},
{id:'demo_comm_6',category:'자유토론',title:'부동산 정책은 결국 “발표한 날”보다 “입주하는 날”에 평가받는 것 같습니다',content:'대책 발표 직후에는 공급 규모와 지역이 화제가 되지만 시민 입장에서는 실제로 집이 언제 지어지고 어떤 가격으로 공급되는지가 핵심입니다.',author:'생활정치',authorId:null,role:'FREE',createdAt:'2026-08-17T12:58:00.000Z',commentCount:1,likeCount:41,imageUrl:'/assets/portal/housing-economy.webp',demo:true}
];
const DEMO_COMMENTS={
demo_comm_1:[{id:'dc11',author:'취준생A',authorId:null,role:'FREE',content:'정책을 다 만든 뒤 의견을 받는 것보다 처음부터 청년이 들어가는 구조가 있었으면 좋겠습니다.',createdAt:'2026-08-18T00:20:00.000Z'},{id:'dc12',author:'현장행정',authorId:null,role:'PLUS',content:'참여도 중요하지만 실제 예산과 사업 평가 권한까지 연결돼야 형식적 참여를 피할 수 있을 것 같아요.',createdAt:'2026-08-18T00:28:00.000Z'},{id:'dc13',author:'서울청년',authorId:null,role:'FREE',content:'주거와 일자리를 한 정책 묶음으로 보는 방식이 가장 먼저 필요하다고 봅니다.',createdAt:'2026-08-18T00:34:00.000Z'}],
demo_comm_2:[{id:'dc21',author:'산단근무자',authorId:null,role:'FREE',content:'공장만 들어오고 교통이나 정주환경이 못 따라오면 지역 주민 입장에선 체감이 낮습니다.',createdAt:'2026-08-17T23:44:00.000Z'},{id:'dc22',author:'산업정책관찰',authorId:null,role:'PLUS',content:'전력과 용수 같은 인프라 비용을 누가 어떻게 분담하는지도 중요한 포인트라고 봅니다.',createdAt:'2026-08-17T23:49:00.000Z'}],
demo_comm_3:[{id:'dc31',author:'무주택30대',authorId:null,role:'FREE',content:'착공과 입주 예정 물량을 같은 화면에서 계속 보여주면 정책을 판단하기 쉬울 것 같아요.',createdAt:'2026-08-17T23:02:00.000Z'},{id:'dc32',author:'도시계획읽기',authorId:null,role:'PLUS',content:'인허가 단축만큼 교통과 학교 같은 기반시설이 같이 가는지도 봐야 합니다.',createdAt:'2026-08-17T23:15:00.000Z'}],
demo_comm_4:[{id:'dc41',author:'청년공무원',authorId:null,role:'FREE',content:'부처별 사업을 한 번에 안내받을 수 있는 통합 창구부터 필요하다고 느낍니다.',createdAt:'2026-08-17T22:26:00.000Z'}],
demo_comm_5:[{id:'dc51',author:'지방산업',authorId:null,role:'FREE',content:'지역 인재 채용 비율과 협력업체 매출 같은 지표도 같이 공개됐으면 좋겠습니다.',createdAt:'2026-08-17T13:48:00.000Z'}],
demo_comm_6:[{id:'dc61',author:'실수요자',authorId:null,role:'FREE',content:'발표 물량과 실제 입주 물량을 매년 비교해주는 데이터가 있으면 좋겠네요.',createdAt:'2026-08-17T13:06:00.000Z'}]
};
async function getPostById(id){const found=await findPostRow(id);if(found)return found.post;return DEMO_POSTS.find(p=>String(p.id)===String(id))||null;}
async function publicPost(p,count,likes,me,repOverride,likedOverride){
  let liked=likedOverride;if(liked===undefined)liked=me?.id?Boolean(Number(await cmd(['SISMEMBER',likeKey(p.id),String(me.id)]).catch(()=>0))):false;
  const dynamicComments=Number(count||0),dynamicLikes=Number(likes||0),baseComments=p.demo?Number(p.commentCount||0):0,baseLikes=p.demo?Number(p.likeCount||0):0;
  return {id:p.id,category:p.category,title:p.title,content:p.content,author:p.author,authorId:p.authorId||null,role:p.role,createdAt:p.createdAt,commentCount:p.demo?baseComments+dynamicComments:Number(count??p.commentCount??0),likeCount:p.demo?baseLikes+dynamicLikes:Number(likes??p.likeCount??0),liked:Boolean(liked),representativeBadge:repOverride!==undefined?repOverride:(p.authorId?await getRepresentativeBadge(p.authorId).catch(()=>null):null),imageUrl:p.imageUrl||null,imageType:p.imageType||null,demo:Boolean(p.demo)};
}
async function batchLiked(posts,me){
  const out={};if(!me?.id||!posts.length)return out;
  const keys=posts.map(p=>likeKey(p.id)),script=`local o={} for i,k in ipairs(KEYS) do o[i]=redis.call('SISMEMBER',k,ARGV[1]) end return o`;
  const vals=await cmd(['EVAL',script,String(keys.length),...keys,String(me.id)]).catch(()=>[]);
  posts.forEach((p,i)=>{out[p.id]=Boolean(Number(vals?.[i]||0));});return out;
}
async function findPostRow(id){
  const rows=await cmd(['LRANGE',POSTS,'0','299']).catch(()=>[]),target=String(id||'');
  for(let i=0;i<(rows||[]).length;i++){try{const p=JSON.parse(rows[i]);if(String(p.id)===target)return {index:i,raw:rows[i],post:p};}catch(_){}}return null;
}
async function listPosts(limit=60,me=null){
  const lim=Math.max(1,Math.min(99,Number(limit||60)));
  const [rows,countsRaw,likesRaw]=await Promise.all([cmd(['LRANGE',POSTS,'0',String(lim-1)]).catch(()=>[]),cmd(['HGETALL',COMMENT_COUNTS]).catch(()=>null),cmd(['HGETALL',LIKE_COUNTS]).catch(()=>null)]);
  const counts=parseHash(countsRaw),likes=parseHash(likesRaw),stored=[];
  for(const x of (Array.isArray(rows)?rows:[])){try{stored.push(JSON.parse(x));}catch(_){}}
  const demoIds=new Set(DEMO_POSTS.map(p=>String(p.id)));
  const posts=[...DEMO_POSTS,...stored.filter(p=>!demoIds.has(String(p.id)))].slice(0,lim);
  const [reps,liked]=await Promise.all([getRepresentativeBadges(posts.map(p=>p.authorId)).catch(()=>({})),batchLiked(posts,me)]);
  return Promise.all(posts.map(p=>publicPost(p,counts[p.id],likes[p.id],me,p.authorId?reps[p.authorId]??null:null,liked[p.id]??false)));
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');const b=req.body||{},action=String(b.action||req.query?.action||'list');
  try{
    if(req.method==='GET'||action==='list'){
      await flushDue(12).catch(()=>{});const me=await authenticate(req).catch(()=>null),posts=await listPosts(Number(req.query?.limit||60),me);const admin=getSession(req);return res.json({ok:true,posts,canWrite:Boolean(me),isAdmin:Boolean(admin),me:me?{id:me.id,nickname:me.nickname,role:me.role}:(admin?{nickname:'정참시 관리자',role:'ADMIN'}:null)});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='admin-update'||action==='admin-delete'){
      const admin=requireAdmin(req,res);if(!admin)return;const row=await findPostRow(b.id);if(!row)return res.status(404).json({ok:false,error:'게시글을 찾을 수 없습니다.'});
      if(action==='admin-delete'){await cmd(['LREM',POSTS,'1',row.raw]);await cmd(['DEL',`jjdd:community:comments:${row.post.id}`]).catch(()=>{});await cmd(['DEL',likeKey(row.post.id)]).catch(()=>{});await cmd(['HDEL',COMMENT_COUNTS,String(row.post.id)]).catch(()=>{});await cmd(['HDEL',LIKE_COUNTS,String(row.post.id)]).catch(()=>{});return res.json({ok:true,deletedId:row.post.id});}
      const title=escText(b.title,80),content=escText(b.content,4000);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 내용을 2자 이상 입력해주세요.'});const next={...row.post,category:safeCategory(b.category),title,content,updatedAt:new Date().toISOString(),adminEditedAt:new Date().toISOString(),adminEditedBy:String(admin.id||'admin')};await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);return res.json({ok:true,post:await publicPost(next)});
    }
    if(action==='create'){
      const user=await requireUser(req,res);if(!user)return;const lim=await rateLimit(req,'community-create',12,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'짧은 시간에 글 작성이 너무 많습니다. 잠시 후 다시 시도해주세요.'});const title=escText(b.title,80),content=escText(b.content,4000);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 내용을 2자 이상 입력해주세요.'});const post={id:`p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,category:safeCategory(b.category),title,content,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',createdAt:new Date().toISOString(),commentCount:0,likeCount:0};await cmd(['LPUSH',POSTS,JSON.stringify(post)]);await cmd(['LTRIM',POSTS,'0','299']);await recordActivity(user.id,'communityPosts',1);return res.json({ok:true,post:await publicPost(post,0,0,user)});
    }
    if(action==='like'||action==='unlike'){
      const user=await requireUser(req,res);if(!user)return;const post=await getPostById(b.postId);if(!post)return res.status(404).json({ok:false,error:'게시글을 찾을 수 없습니다.'});const key=likeKey(post.id);let changed=0;if(action==='like'){changed=Number(await cmd(['SADD',key,String(user.id)]));if(changed){await cmd(['HINCRBY',LIKE_COUNTS,post.id,'1']);await Promise.all([recordActivity(user.id,'likesGiven',1),post.authorId&&post.authorId!==user.id?recordActivity(post.authorId,'likesReceived',1):Promise.resolve()]);}}else{changed=Number(await cmd(['SREM',key,String(user.id)]));if(changed){await cmd(['HINCRBY',LIKE_COUNTS,post.id,'-1']);await Promise.all([recordActivity(user.id,'likesGiven',-1),post.authorId&&post.authorId!==user.id?recordActivity(post.authorId,'likesReceived',-1):Promise.resolve()]);}}const count=Math.max(0,Number(await cmd(['HGET',LIKE_COUNTS,post.id]).catch(()=>0)||0));return res.json({ok:true,liked:action==='like',likeCount:count});
    }
    if(action==='comments'){
      const postId=escText(b.postId,80);if(!postId)return res.status(400).json({ok:false,error:'게시글 ID가 없습니다.'});const key=`jjdd:community:comments:${postId}`;
      if(b.mode==='list'){const rows=await cmd(['LRANGE',key,'0','199']).catch(()=>[]),comments=[];for(const x of (rows||[])){try{comments.push(JSON.parse(x));}catch(_){}}if(DEMO_COMMENTS[postId])comments.push(...DEMO_COMMENTS[postId].filter(dc=>!comments.some(c=>String(c.id)===String(dc.id))));const reps=await getRepresentativeBadges(comments.map(c=>c.authorId)).catch(()=>({}));return res.json({ok:true,comments:comments.map(c=>({id:c.id,author:c.author,authorId:c.authorId||null,role:c.role,content:c.content,createdAt:c.createdAt,representativeBadge:c.authorId?reps[c.authorId]??null:null}))});}
      const user=await requireUser(req,res);if(!user)return;const content=escText(b.content,1200);if(content.length<1)return res.status(400).json({ok:false,error:'댓글 내용을 입력해주세요.'});const lim=await rateLimit(req,'community-comment',30,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'});const post=await getPostById(postId);const c={id:`c_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',content,createdAt:new Date().toISOString()};await cmd(['LPUSH',key,JSON.stringify(c)]);await cmd(['LTRIM',key,'0','199']);await cmd(['EXPIRE',key,String(365*24*3600)]).catch(()=>{});await cmd(['HINCRBY',COMMENT_COUNTS,postId,'1']).catch(()=>{});await Promise.all([recordActivity(user.id,'comments',1),post?.authorId&&post.authorId!==user.id?recordActivity(post.authorId,'commentsReceived',1):Promise.resolve()]);return res.json({ok:true,comment:{...c,representativeBadge:await getRepresentativeBadge(user.id)}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
