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
  {id:'demo_comm_1',category:'자유토론',title:'김민석 대표 체제, 첫 일성보다 중요한 건 결국 실행 속도 아닐까요?',content:'대표 선출 직후 메시지는 충분히 강했는데, 결국 시민들이 보는 건 언제 어떤 팀으로 움직이느냐인 것 같습니다. 전당대회 열기가 끝난 뒤에도 민생과 현안 대응에서 속도가 유지되는지가 더 중요해 보입니다.',author:'민생체감',authorId:null,role:'PLUS',createdAt:'2026-08-18T00:12:00.000Z',commentCount:18,likeCount:42,imageType:'leadership',demo:true},
  {id:'demo_comm_2',category:'정책',title:'청년 주거대책, 숫자보다 체감이 먼저라는 말에 공감하시나요?',content:'정책 발표는 늘 큰 숫자와 계획으로 시작하지만 실제로 청년들이 묻는 건 월세, 대출, 출퇴근 거리 같은 생활 문제인 것 같습니다. 발표 이후 반응이 빠르게 올라온 이유도 결국 체감 포인트를 건드렸기 때문 아닐까요.',author:'주거현실파',authorId:null,role:'FREE',createdAt:'2026-08-17T23:36:00.000Z',commentCount:12,likeCount:27,imageType:'housing',demo:true},
  {id:'demo_comm_3',category:'지역정치',title:'구미시장 이슈가 전국 키워드로 번진 이유, 지역정치도 이제는 전국전 같네요',content:'예전에는 지역 현안이 지역 안에서만 소비되는 느낌이 강했는데, 지금은 한 장면이 바로 전국 키워드가 되는 것 같습니다. 지역정치가 중앙정치와 실시간으로 연결되는 시대라는 걸 보여주는 사례처럼 보입니다.',author:'지방정치읽기',authorId:null,role:'PLUS',createdAt:'2026-08-17T22:55:00.000Z',commentCount:9,likeCount:19,imageType:'cityhall',demo:true},
  {id:'demo_comm_4',category:'질문',title:'대통령실 조직 개편이 나오면 총리·장관 라인까지 분위기가 달라질까요?',content:'대통령실이 메시지와 정책 속도를 끌어올리기 위해 조직 정비를 검토한다는 이야기가 있으면, 결국 그 여파는 국무총리와 장관 라인까지 번질 수밖에 없다고 봅니다. 실제로 어떤 부처가 더 주목받게 될지도 궁금합니다.',author:'정치초점',authorId:null,role:'FREE',createdAt:'2026-08-17T22:18:00.000Z',commentCount:7,likeCount:15,imageType:'office',demo:true},
  {id:'demo_comm_5',category:'자유토론',title:'정청래와 김민석, 지지층이 기대하는 포인트가 생각보다 꽤 다르네요',content:'한쪽은 강한 투쟁력과 선명성을, 다른 한쪽은 조직 안정과 확장성을 기대하는 분위기가 읽힙니다. 같은 당 안에서도 정치인에게 기대하는 역할이 이렇게 다르다는 게 흥미롭습니다.',author:'정당관찰자',authorId:null,role:'PLUS',createdAt:'2026-08-17T13:40:00.000Z',commentCount:16,likeCount:33,imageType:'debate',demo:true},
  {id:'demo_comm_6',category:'정책',title:'반도체 특별법 논의, 결국 지역 일자리까지 연결돼야 체감될 것 같아요',content:'산업 지원이 수도권 대기업 중심으로만 읽히면 일반 시민에게는 먼 이야기처럼 느껴질 수 있습니다. 지역 대학, 협력업체, 청년 일자리까지 연결되는 그림이 보여야 정책 메시지도 더 강해질 것 같습니다.',author:'데이터좋아',authorId:null,role:'PLUS',createdAt:'2026-08-17T12:58:00.000Z',commentCount:11,likeCount:24,imageType:'semiconductor',demo:true}
];
const DEMO_COMMENTS={
  demo_comm_1:[
    {id:'dc11',author:'균형감각',authorId:null,role:'FREE',content:'말씀대로 선언보다 인선과 일정이 먼저 보이면 체감이 확 달라질 것 같습니다.',createdAt:'2026-08-18T00:20:00.000Z'},
    {id:'dc12',author:'국회앞시민',authorId:null,role:'PLUS',content:'첫 100일에 무엇을 우선순위로 두는지 보면 방향이 더 분명해질 것 같아요.',createdAt:'2026-08-18T00:28:00.000Z'},
    {id:'dc13',author:'민트포털',authorId:null,role:'FREE',content:'전당대회 이후 바로 민생 현안으로 넘어가느냐가 핵심이겠네요.',createdAt:'2026-08-18T00:34:00.000Z'}
  ],
  demo_comm_2:[
    {id:'dc21',author:'서울자취생',authorId:null,role:'FREE',content:'대책이 크더라도 월세 부담이 바로 줄지 않으면 피부에 와닿지 않더라고요.',createdAt:'2026-08-17T23:44:00.000Z'},
    {id:'dc22',author:'주거연구자',authorId:null,role:'PLUS',content:'공급도 중요하지만 청년층이 당장 만나는 금융 조건이 같이 풀려야 합니다.',createdAt:'2026-08-17T23:49:00.000Z'}
  ],
  demo_comm_3:[
    {id:'dc31',author:'대구경북체크',authorId:null,role:'FREE',content:'지역 이슈가 전국으로 번지는 속도가 정말 빨라졌습니다.',createdAt:'2026-08-17T23:02:00.000Z'},
    {id:'dc32',author:'정치현장파',authorId:null,role:'PLUS',content:'SNS와 포털 검색이 붙으면 지역정치도 바로 전국 이슈가 되네요.',createdAt:'2026-08-17T23:15:00.000Z'}
  ],
  demo_comm_4:[
    {id:'dc41',author:'행정부읽기',authorId:null,role:'FREE',content:'대통령실 개편은 결국 부처 메시지까지 바꾸는 신호로 읽히는 것 같습니다.',createdAt:'2026-08-17T22:26:00.000Z'},
    {id:'dc42',author:'정책관찰자',authorId:null,role:'PLUS',content:'특히 경제와 민생 라인에서 누가 전면에 서는지가 중요할 것 같아요.',createdAt:'2026-08-17T22:31:00.000Z'}
  ],
  demo_comm_5:[
    {id:'dc51',author:'당원시선',authorId:null,role:'FREE',content:'두 사람을 바라보는 기대가 다르다는 말에 공감합니다.',createdAt:'2026-08-17T13:48:00.000Z'},
    {id:'dc52',author:'의정스캐너',authorId:null,role:'PLUS',content:'선명성과 확장성 사이에서 당심과 민심이 어떻게 만나는지가 포인트겠죠.',createdAt:'2026-08-17T13:56:00.000Z'}
  ],
  demo_comm_6:[
    {id:'dc61',author:'산업지도',authorId:null,role:'FREE',content:'지역 대학과 협력업체까지 연결되면 정말 체감도가 달라질 것 같습니다.',createdAt:'2026-08-17T13:06:00.000Z'},
    {id:'dc62',author:'청년일자리',authorId:null,role:'PLUS',content:'산업 정책도 결국 내 일자리 이야기로 설명돼야 관심이 붙는 것 같아요.',createdAt:'2026-08-17T13:12:00.000Z'}
  ]
};
async function getPostById(id){const found=await findPostRow(id);if(found)return found.post;return DEMO_POSTS.find(p=>String(p.id)===String(id))||null;}
async function publicPost(p,count,likes,me,repOverride,likedOverride){let liked=likedOverride;if(liked===undefined)liked=me?.id?Boolean(Number(await cmd(['SISMEMBER',likeKey(p.id),String(me.id)]).catch(()=>0))):false;return {id:p.id,category:p.category,title:p.title,content:p.content,author:p.author,authorId:p.authorId||null,role:p.role,createdAt:p.createdAt,commentCount:Number(count??p.commentCount??0),likeCount:Number(likes??p.likeCount??0),liked:Boolean(liked),representativeBadge:repOverride!==undefined?repOverride:(p.authorId?await getRepresentativeBadge(p.authorId).catch(()=>null):null),imageType:p.imageType||null,demo:Boolean(p.demo)};}
async function batchLiked(posts,me){const out={};if(!me?.id||!posts.length)return out;const keys=posts.map(p=>likeKey(p.id)),script=`local o={} for i,k in ipairs(KEYS) do o[i]=redis.call('SISMEMBER',k,ARGV[1]) end return o`;const vals=await cmd(['EVAL',script,String(keys.length),...keys,String(me.id)]).catch(()=>[]);posts.forEach((p,i)=>{out[p.id]=Boolean(Number(vals?.[i]||0));});return out;}

async function findPostRow(id){const rows=await cmd(['LRANGE',POSTS,'0','299']).catch(()=>[]);const target=String(id||'');for(let i=0;i<(rows||[]).length;i++){try{const p=JSON.parse(rows[i]);if(String(p.id)===target)return {index:i,raw:rows[i],post:p};}catch(_){}}return null;}
async function listPosts(limit=60,me=null){
  const [rows,countsRaw,likesRaw]=await Promise.all([
    cmd(['LRANGE',POSTS,'0',String(Math.max(0,Math.min(99,limit-1)))]).catch(()=>[]),
    cmd(['HGETALL',COMMENT_COUNTS]).catch(()=>null),
    cmd(['HGETALL',LIKE_COUNTS]).catch(()=>null)
  ]);
  const counts=parseHash(countsRaw),likes=parseHash(likesRaw),posts=[];
  for(const x of (Array.isArray(rows)?rows:[])){try{posts.push(JSON.parse(x));}catch(_){}}
  const basePosts=posts.length?posts:DEMO_POSTS.slice(0,Math.max(1,Math.min(99,Number(limit||60))));
  const [reps,liked]=await Promise.all([getRepresentativeBadges(basePosts.map(p=>p.authorId)).catch(()=>({})),batchLiked(basePosts,me)]);
  return Promise.all(basePosts.map(p=>publicPost(p,counts[p.id],likes[p.id],me,p.authorId?reps[p.authorId]??null:null,liked[p.id]??false)));
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
      if(b.mode==='list'){const rows=await cmd(['LRANGE',key,'0','199']).catch(()=>[]),comments=[];for(const x of (rows||[])){try{comments.push(JSON.parse(x));}catch(_){}}if(!comments.length&&DEMO_COMMENTS[postId])comments.push(...DEMO_COMMENTS[postId]);const reps=await getRepresentativeBadges(comments.map(c=>c.authorId)).catch(()=>({}));return res.json({ok:true,comments:comments.map(c=>({id:c.id,author:c.author,authorId:c.authorId||null,role:c.role,content:c.content,createdAt:c.createdAt,representativeBadge:c.authorId?reps[c.authorId]??null:null}))});}
      const user=await requireUser(req,res);if(!user)return;const content=escText(b.content,1200);if(content.length<1)return res.status(400).json({ok:false,error:'댓글 내용을 입력해주세요.'});const lim=await rateLimit(req,'community-comment',30,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'});const post=await getPostById(postId);const c={id:`c_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',content,createdAt:new Date().toISOString()};await cmd(['LPUSH',key,JSON.stringify(c)]);await cmd(['LTRIM',key,'0','199']);await cmd(['EXPIRE',key,String(365*24*3600)]).catch(()=>{});await cmd(['HINCRBY',COMMENT_COUNTS,postId,'1']).catch(()=>{});await Promise.all([recordActivity(user.id,'comments',1),post?.authorId&&post.authorId!==user.id?recordActivity(post.authorId,'commentsReceived',1):Promise.resolve()]);return res.json({ok:true,comment:{...c,representativeBadge:await getRepresentativeBadge(user.id)}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
