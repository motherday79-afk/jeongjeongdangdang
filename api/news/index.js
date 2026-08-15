const crypto=require('crypto');
const {cmd,getJSON,setJSON}=require('../../lib/store');
const {authenticate,capabilities,rateLimit}=require('../../lib/user_auth');
const {getSession}=require('../../lib/auth');
const {flushDue}=require('../../lib/editorial');

const POSTS='jjdd:news:posts:v1';
const IMAGE_PREFIX='jjdd:news:image:v1:';
const CATEGORIES=['정치','국회','정책','지역','데이터','현장'];
const MAX_POSTS=200;
const MAX_IMAGE_BYTES=1200*1024;

function cleanText(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeCategory(v){const x=cleanText(v,20);return CATEGORIES.includes(x)?x:'정치';}
function publicPost(p){return {id:p.id,category:p.category,title:p.title,excerpt:p.excerpt,content:p.content,author:p.author,role:p.role,createdAt:p.createdAt,hasImage:Boolean(p.hasImage),imageUrl:p.hasImage?`/api/news?action=image&id=${encodeURIComponent(p.id)}`:null};}
function looksLikeImage(buf,mime){
  if(mime==='image/jpeg')return buf.length>3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff;
  if(mime==='image/png')return buf.length>8&&buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mime==='image/webp')return buf.length>12&&buf.subarray(0,4).toString('ascii')==='RIFF'&&buf.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}
function parseImageData(v){
  if(!v)return null;const m=String(v).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);if(!m)throw new Error('지원하지 않는 이미지 형식입니다.');
  const mime=m[1].toLowerCase(),buf=Buffer.from(m[2],'base64');if(!buf.length||buf.length>MAX_IMAGE_BYTES)throw new Error('최적화된 대표 이미지는 1.2MB 이하만 저장할 수 있습니다.');if(!looksLikeImage(buf,mime))throw new Error('이미지 파일 내용이 올바르지 않습니다.');
  return {mime,data:buf.toString('base64'),bytes:buf.length};
}
async function writerContext(req){
  const user=await authenticate(req).catch(()=>null);
  if(user&&capabilities(user.role).pro)return {id:user.id,nickname:String(user.nickname||user.username||'PRO 회원').slice(0,30),role:user.role};
  const admin=getSession(req);if(admin)return {id:`admin:${admin.id||'admin'}`,nickname:'정참시 운영팀',role:'ADMIN'};
  return null;
}
async function listPosts(limit=60){
  const rows=await cmd(['LRANGE',POSTS,'0',String(Math.max(0,Math.min(MAX_POSTS-1,Number(limit||60)-1))) ]).catch(()=>[]);
  return (Array.isArray(rows)?rows:[]).map(x=>{try{return publicPost(JSON.parse(x));}catch(_){return null;}}).filter(Boolean);
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query?.action||req.body?.action||'list');
  try{
    if(req.method==='GET'&&action==='image'){
      const id=cleanText(req.query?.id,100);if(!id)return res.status(400).end();const img=await getJSON(IMAGE_PREFIX+id);if(!img?.data||!/^image\/(jpeg|png|webp)$/.test(String(img.mime||'')))return res.status(404).end();
      const buf=Buffer.from(img.data,'base64');if(!looksLikeImage(buf,img.mime))return res.status(404).end();res.setHeader('Content-Type',img.mime);res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).end(buf);
    }
    if(req.method==='GET'||action==='list'){
      await flushDue(12).catch(()=>{});
      const [posts,writer]=await Promise.all([listPosts(req.query?.limit||60),writerContext(req)]);return res.json({ok:true,posts,canWrite:Boolean(writer),me:writer?{nickname:writer.nickname,role:writer.role}:null,minimumRole:'PRO'});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    if(action==='create'){
      const writer=await writerContext(req);if(!writer)return res.status(403).json({ok:false,error:'정참시News 작성은 PRO 이상 회원만 가능합니다.'});
      const lim=await rateLimit(req,'news-create',20,3600);if(!lim.ok)return res.status(429).json({ok:false,error:'짧은 시간에 기사 발행이 너무 많습니다. 잠시 후 다시 시도해주세요.'});
      const b=req.body||{},title=cleanText(b.title,100),content=cleanText(b.content,12000);let excerpt=cleanText(b.excerpt,260);if(title.length<2||content.length<2)return res.status(400).json({ok:false,error:'제목과 본문을 2자 이상 입력해주세요.'});if(!excerpt)excerpt=content.replace(/\s+/g,' ').slice(0,180);
      const id=`n_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`,image=parseImageData(b.imageData),createdAt=new Date().toISOString();
      if(image)await setJSON(IMAGE_PREFIX+id,image);
      const post={id,category:safeCategory(b.category),title,excerpt,content,author:writer.nickname,authorId:writer.id,role:writer.role,createdAt,hasImage:Boolean(image),schemaVersion:1};
      await cmd(['LPUSH',POSTS,JSON.stringify(post)]);await cmd(['LTRIM',POSTS,'0',String(MAX_POSTS-1)]);return res.json({ok:true,post:publicPost(post)});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
