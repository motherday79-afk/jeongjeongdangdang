const crypto=require('crypto');
const {cmd,getJSON,setJSON}=require('../../lib/store');
const {authenticate,capabilities,rateLimit}=require('../../lib/user_auth');
const {validateAdminSession}=require('../../lib/auth');
const {flushDue}=require('../../lib/editorial');
const {getRepresentativeBadge,getRepresentativeBadges,recordActivity}=require('../../lib/badges');

const POSTS='jjdd:news:posts:v1';
const IMAGE_PREFIX='jjdd:news:image:v1:';
const HIDDEN_SEEDS='jjdd:news:hidden-seeds:v1';
const SEED_IMAGE_URLS={demo_news_1:'/assets/portal/youth-policy.webp',demo_news_2:'/assets/portal/community-meeting.webp',demo_news_3:'/assets/portal/housing-economy.webp',demo_news_4:'/assets/portal/youth-policy.webp',demo_news_5:'/assets/portal/community-meeting.webp',demo_news_6:'/assets/portal/housing-economy.webp'};
const CATEGORIES=['정치','국회','정책','지역','데이터','현장'];
const MAX_POSTS=200;
const MAX_IMAGE_BYTES=1200*1024;

function cleanText(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeCategory(v){const x=cleanText(v,20);return CATEGORIES.includes(x)?x:'정치';}
async function publicPost(p,repOverride){const imageVersion=String(p.imageVersion||p.updatedAt||p.createdAt||'1');return {id:p.id,category:p.category,title:p.title,excerpt:p.excerpt,content:p.content,author:p.author,authorId:p.authorId||null,role:p.role,createdAt:p.createdAt,updatedAt:p.updatedAt||null,imageVersion,hasImage:Boolean(p.hasImage),imageUrl:p.hasImage?`/api/news?action=image&id=${encodeURIComponent(p.id)}&v=${encodeURIComponent(imageVersion)}`:(p.imageUrl||null),representativeBadge:repOverride!==undefined?repOverride:(p.authorId&&!String(p.authorId).startsWith('admin:')?await getRepresentativeBadge(p.authorId).catch(()=>null):null)};}
function looksLikeImage(buf,mime){
  if(mime==='image/jpeg')return buf.length>3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff;
  if(mime==='image/png')return buf.length>8&&buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mime==='image/webp')return buf.length>12&&buf.subarray(0,4).toString('ascii')==='RIFF'&&buf.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}
function parseImageData(v){
  if(!v)return null;const m=String(v).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)throw new Error('지원하지 않는 이미지 형식입니다.');
  const mime=m[1].toLowerCase(),buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>MAX_IMAGE_BYTES)throw new Error('최적화된 대표 이미지는 1.2MB 이하만 저장할 수 있습니다.');if(!looksLikeImage(buf,mime))throw new Error('이미지 파일 내용이 올바르지 않습니다.');
  const revision='img_'+crypto.createHash('sha256').update(buf).digest('hex').slice(0,24);
  return {mime,data:buf.toString('base64'),bytes:buf.length,revision};
}

async function findPostRow(id){
  const rows=await cmd(['LRANGE',POSTS,'0',String(MAX_POSTS-1)]).catch(()=>[]),target=String(id||'');
  for(let i=0;i<(rows||[]).length;i++){try{const p=JSON.parse(rows[i]);if(String(p.id)===target)return {index:i,raw:rows[i],post:p};}catch(_){}}
  return null;
}

async function contentAdminContext(req){
  // Main-site ADMIN accounts and the dedicated admin-console session are both
  // valid content-moderation authorities. This keeps the UI authority shown on
  // HOME/COLUMN identical to the authority accepted by the save endpoint.
  const adminSession=await validateAdminSession(req).catch(()=>null);
  if(adminSession)return {id:String(adminSession.id||'admin'),source:'ADMIN_SESSION'};
  const user=await authenticate(req).catch(()=>null);
  if(user&&capabilities(user.role).admin)return {id:String(user.id||user.username||'admin'),source:'ADMIN_ACCOUNT'};
  return null;
}
async function writerContext(req){
  const adminSession=await validateAdminSession(req).catch(()=>null);
  if(adminSession)return {id:`admin:${adminSession.id||'admin'}`,nickname:'정참시 운영팀',role:'ADMIN'};
  const user=await authenticate(req).catch(()=>null);
  if(user&&capabilities(user.role).pro)return {id:user.id,nickname:String(user.nickname||user.username||'PRO 회원').slice(0,30),role:user.role};
  return null;
}
async function listPosts(limit=60){
  const rows=await cmd(['LRANGE',POSTS,'0',String(Math.max(0,Math.min(MAX_POSTS-1,Number(limit||60)-1))) ]).catch(()=>[]),posts=[];for(const x of (Array.isArray(rows)?rows:[])){try{posts.push(JSON.parse(x));}catch(_){}}const reps=await getRepresentativeBadges(posts.map(p=>p.authorId)).catch(()=>({}));return Promise.all(posts.map(p=>publicPost(p,p.authorId&&!String(p.authorId).startsWith('admin:')?reps[p.authorId]??null:null)));
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');
  const action=String(req.query?.action||req.body?.action||'list');
  try{
    if(req.method==='GET'&&action==='image'){
      const id=cleanText(req.query?.id,100);if(!id)return res.status(400).end();const img=await getJSON(IMAGE_PREFIX+id);if(!img?.data||!/^image\/(jpeg|png|webp)$/.test(String(img.mime||'')))return res.status(404).end();
      const buf=Buffer.from(img.data,'base64');if(!looksLikeImage(buf,img.mime))return res.status(404).end();res.setHeader('Content-Type',img.mime);res.setHeader('Cache-Control','no-store, max-age=0, must-revalidate');res.setHeader('CDN-Cache-Control','no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('X-Column-Image-Revision',String(img.revision||''));res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).end(buf);
    }
    if(req.method==='GET'||action==='list'){
      await flushDue(12).catch(()=>{});
      const [posts,writer,hiddenSeedIds]=await Promise.all([listPosts(req.query?.limit||60),writerContext(req),cmd(['SMEMBERS',HIDDEN_SEEDS]).catch(()=>[])]);return res.json({ok:true,posts,hiddenSeedIds:Array.isArray(hiddenSeedIds)?hiddenSeedIds:[],canWrite:Boolean(writer),isAdmin:Boolean(writer?.role==='ADMIN'),me:writer?{nickname:writer.nickname,role:writer.role}:null,minimumRole:'PRO'});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='admin-update'||action==='admin-delete'){
      const admin=await contentAdminContext(req);if(!admin)return res.status(401).json({ok:false,error:'관리자 로그인이 필요합니다.'});
      const b=req.body||{},id=cleanText(b.id,100),row=await findPostRow(id),isSeed=/^demo_news_\d+$/.test(id);
      if(!row&&!isSeed)return res.status(404).json({ok:false,error:'기사를 찾을 수 없습니다.'});
      if(action==='admin-delete'){
        if(row)await cmd(['LREM',POSTS,'1',row.raw]);if(isSeed)await cmd(['SADD',HIDDEN_SEEDS,id]).catch(()=>{});await cmd(['DEL',IMAGE_PREFIX+id]).catch(()=>{});return res.json({ok:true,deletedId:id});
      }
      const title=cleanText(b.title,100),content=cleanText(b.content,12000);let excerpt=cleanText(b.excerpt,260);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 본문을 2자 이상 입력해주세요.'});if(!excerpt)excerpt=content.replace(/\s+/g,' ').slice(0,180);
      let hasImage=Boolean(row?.post?.hasImage),imageUrl=row?.post?.imageUrl||(isSeed?SEED_IMAGE_URLS[id]:null),imageChanged=false;
      if(b.removeImage===true){await cmd(['DEL',IMAGE_PREFIX+id]).catch(()=>{});hasImage=false;imageUrl=null;imageChanged=true;}
      let imageRevision=null;if(b.imageData){const image=parseImageData(b.imageData);await setJSON(IMAGE_PREFIX+id,image);hasImage=true;imageUrl=null;imageChanged=true;imageRevision=image.revision;}
      const now=new Date().toISOString();
      const base=row?.post||{id,author:'정참시 운영팀',authorId:`admin:${admin.id||'admin'}`,role:'ADMIN',createdAt:now,schemaVersion:1,seedOverride:true,imageUrl};
      const next={...base,category:safeCategory(b.category),title,excerpt,content,hasImage,imageUrl,imageVersion:imageChanged?(imageRevision||`rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`):(base.imageVersion||base.updatedAt||base.createdAt||now),updatedAt:now,adminEditedAt:now,adminEditedBy:`${admin.source}:${String(admin.id||'admin')}`};
      if(row)await cmd(['LSET',POSTS,String(row.index),JSON.stringify(next)]);else{await cmd(['LPUSH',POSTS,JSON.stringify(next)]);await cmd(['LTRIM',POSTS,'0',String(MAX_POSTS-1)]);}
      if(isSeed)await cmd(['SREM',HIDDEN_SEEDS,id]).catch(()=>{});return res.json({ok:true,post:await publicPost(next)});
    }
    if(action==='create'){
      const writer=await writerContext(req);if(!writer)return res.status(403).json({ok:false,error:'정참시News 작성은 PRO 이상 회원만 가능합니다.'});
      const lim=await rateLimit(req,'news-create',20,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'짧은 시간에 기사 발행이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
      const b=req.body||{},title=cleanText(b.title,100),content=cleanText(b.content,12000);let excerpt=cleanText(b.excerpt,260);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 본문을 2자 이상 입력해주세요.'});if(!excerpt)excerpt=content.replace(/\s+/g,' ').slice(0,180);
      const id=`n_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,image=parseImageData(b.imageData),createdAt=new Date().toISOString();
      if(image)await setJSON(IMAGE_PREFIX+id,image);
      const post={id,category:safeCategory(b.category),title,excerpt,content,author:writer.nickname,authorId:writer.id,role:writer.role,createdAt,imageVersion:image?.revision||createdAt,hasImage:Boolean(image),schemaVersion:1};
      await cmd(['LPUSH',POSTS,JSON.stringify(post)]);await cmd(['LTRIM',POSTS,'0',String(MAX_POSTS-1)]);if(writer.id&&!String(writer.id).startsWith('admin:'))await recordActivity(writer.id,'columns',1);return res.json({ok:true,post:await publicPost(post)});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
