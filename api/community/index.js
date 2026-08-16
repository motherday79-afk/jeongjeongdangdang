const crypto=require('crypto');
const {cmd}=require('../../lib/store');
const {authenticate,requireUser,rateLimit}=require('../../lib/user_auth');
const {getSession,requireAdmin}=require('../../lib/auth');
const {flushDue}=require('../../lib/editorial');
const POSTS='jjdd:community:posts:v1';
const COMMENT_COUNTS='jjdd:community:comment-counts:v1';
function escText(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeCategory(v){const x=escText(v,20);return ['자유토론','정책','지역정치','질문'].includes(x)?x:'자유토론';}
function parseHash(v){
  if(!v)return{};if(!Array.isArray(v)&&typeof v==='object')return v;
  const out={};for(let i=0;i<(v||[]).length;i+=2)out[String(v[i])]=v[i+1];return out;
}
function publicPost(p,count){return {id:p.id,category:p.category,title:p.title,content:p.content,author:p.author,role:p.role,createdAt:p.createdAt,commentCount:Number(count??p.commentCount??0)};}

async function findPostRow(id){
  const rows=await cmd(['LRANGE',POSTS,'0','299']).catch(()=>[]);const target=String(id||'');
  for(let i=0;i<(rows||[]).length;i++){try{const p=JSON.parse(rows[i]);if(String(p.id)===target)return {index:i,raw:rows[i],post:p};}catch(_){}}
  return null;
}

async function listPosts(limit=60){
  const [rows,countsRaw]=await Promise.all([
    cmd(['LRANGE',POSTS,'0',String(Math.max(0,Math.min(99,limit-1)))]).catch(()=>[]),
    cmd(['HGETALL',COMMENT_COUNTS]).catch(()=>null)
  ]);
  const counts=parseHash(countsRaw);
  return (Array.isArray(rows)?rows:[]).map(x=>{try{const p=JSON.parse(x);return publicPost(p,counts[p.id]);}catch(_){return null;}}).filter(Boolean);
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  const b=req.body||{},action=String(b.action||req.query?.action||'list');
  try{
    if(req.method==='GET'||action==='list'){
      await flushDue(12).catch(()=>{});
      const posts=await listPosts(Number(req.query?.limit||60));
      const [me,admin]=await Promise.all([authenticate(req).catch(()=>null),Promise.resolve(getSession(req))]);
      return res.json({ok:true,posts,canWrite:Boolean(me),isAdmin:Boolean(admin),me:me?{nickname:me.nickname,role:me.role}:(admin?{nickname:'정참시 관리자',role:'ADMIN'}:null)});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='admin-update'||action==='admin-delete'){
      const admin=requireAdmin(req,res);if(!admin)return;
      const row=await findPostRow(b.id);if(!row)return res.status(404).json({ok:false,error:'게시글을 찾을 수 없습니다.'});
      if(action==='admin-delete'){
        await cmd(['LREM',POSTS,'1',row.raw]);await cmd(['DEL',`jjdd:community:comments:${row.post.id}`]).catch(()=>{});await cmd(['HDEL',COMMENT_COUNTS,String(row.post.id)]).catch(()=>{});
        return res.json({ok:true,deletedId:row.post.id});
      }
      const title=escText(b.title,80),content=escText(b.content,4000);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 내용을 2자 이상 입력해주세요.'});
      const next={...row.post,category:safeCategory(b.category),title,content,updatedAt:new Date().toISOString(),adminEditedAt:new Date().toISOString(),adminEditedBy:String(admin.id||'admin')};
      await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);return res.json({ok:true,post:publicPost(next)});
    }
    if(action==='create'){
      const user=await requireUser(req,res);if(!user)return;
      const lim=await rateLimit(req,'community-create',12,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'짧은 시간에 글 작성이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
      const title=escText(b.title,80),content=escText(b.content,4000);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 내용을 2자 이상 입력해주세요.'});
      const post={id:`p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,category:safeCategory(b.category),title,content,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',createdAt:new Date().toISOString(),commentCount:0};
      await cmd(['LPUSH',POSTS,JSON.stringify(post)]);await cmd(['LTRIM',POSTS,'0','299']);
      return res.json({ok:true,post:publicPost(post,0)});
    }
    if(action==='comments'){
      const postId=escText(b.postId,80);if(!postId)return res.status(400).json({ok:false,error:'게시글 ID가 없습니다.'});
      const key=`jjdd:community:comments:${postId}`;
      if(b.mode==='list'){
        const rows=await cmd(['LRANGE',key,'0','199']).catch(()=>[]);const comments=(rows||[]).map(x=>{try{const c=JSON.parse(x);return {id:c.id,author:c.author,role:c.role,content:c.content,createdAt:c.createdAt};}catch(_){return null;}}).filter(Boolean);return res.json({ok:true,comments});
      }
      const user=await requireUser(req,res);if(!user)return;
      const content=escText(b.content,1200);if(content.length<1)return res.status(400).json({ok:false,error:'댓글 내용을 입력해주세요.'});
      const lim=await rateLimit(req,'community-comment',30,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'댓글 작성이 너무 빠릅니다. 잠시 후 다시 시도해주세요.'});
      const c={id:`c_${Date.now().toString(36)}_${crypto.randomBytes(2).toString('hex')}`,author:String(user.nickname||user.username||'회원').slice(0,20),authorId:user.id,role:user.role||'FREE',content,createdAt:new Date().toISOString()};
      await cmd(['LPUSH',key,JSON.stringify(c)]);await cmd(['LTRIM',key,'0','199']);await cmd(['EXPIRE',key,String(365*24*3600)]).catch(()=>{});await cmd(['HINCRBY',COMMENT_COUNTS,postId,'1']).catch(()=>{});
      return res.json({ok:true,comment:{id:c.id,author:c.author,role:c.role,content:c.content,createdAt:c.createdAt}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
