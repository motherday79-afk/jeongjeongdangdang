const crypto=require('crypto');
const {cmd,getJSON,setJSON}=require('./store');

const DRAFTS='jjdd:editorial:drafts:v1';
const SCHEDULE='jjdd:editorial:schedule:v1';
const LOCK_PREFIX='jjdd:editorial:lock:v1:';
const DRAFT_IMAGE_PREFIX='jjdd:editorial:draft-image:v1:';
const COMMUNITY_POSTS='jjdd:community:posts:v1';
const NEWS_POSTS='jjdd:news:posts:v1';
const NEWS_IMAGE_PREFIX='jjdd:news:image:v1:';
const COMMUNITY_CATEGORIES=['자유토론','정책','지역정치','질문'];
const NEWS_CATEGORIES=['정치','국회','정책','지역','데이터','현장'];
const MAX_DRAFTS=400;
const MAX_NEWS_POSTS=200;
const MAX_COMMUNITY_POSTS=300;
const MAX_IMAGE_BYTES=1200*1024;

function cleanText(v,max){return String(v||'').replace(/\u0000/g,'').trim().slice(0,max);}
function safeType(v){return String(v)==='news'?'news':'community';}
function safeCategory(type,v){const list=type==='news'?NEWS_CATEGORIES:COMMUNITY_CATEGORIES,x=cleanText(v,20);return list.includes(x)?x:list[0];}
function parseHash(v){
  if(!v)return{};
  if(!Array.isArray(v)&&typeof v==='object')return v;
  const out={};for(let i=0;i<(v||[]).length;i+=2)out[String(v[i])]=v[i+1];return out;
}
function publicDraft(d){
  return {
    id:d.id,type:d.type,status:d.status||'DRAFT',category:d.category,title:d.title,excerpt:d.excerpt||'',content:d.content||'',
    author:d.author||'정참시 운영팀',role:d.role||'ADMIN',createdAt:d.createdAt,updatedAt:d.updatedAt,scheduledAt:d.scheduledAt||null,
    publishedAt:d.publishedAt||null,publishedPostId:d.publishedPostId||null,hasImage:Boolean(d.hasImage),lastError:d.lastError||null
  };
}
function looksLikeImage(buf,mime){
  if(mime==='image/jpeg')return buf.length>3&&buf[0]===0xff&&buf[1]===0xd8&&buf[2]===0xff;
  if(mime==='image/png')return buf.length>8&&buf.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mime==='image/webp')return buf.length>12&&buf.subarray(0,4).toString('ascii')==='RIFF'&&buf.subarray(8,12).toString('ascii')==='WEBP';
  return false;
}
function parseImageData(v){
  if(!v)return null;
  const m=String(v).match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if(!m)throw new Error('지원하지 않는 이미지 형식입니다.');
  const mime=m[1].toLowerCase(),buf=Buffer.from(m[2],'base64');
  if(!buf.length||buf.length>MAX_IMAGE_BYTES)throw new Error('최적화된 대표 이미지는 1.2MB 이하만 저장할 수 있습니다.');
  if(!looksLikeImage(buf,mime))throw new Error('이미지 파일 내용이 올바르지 않습니다.');
  const revision='img_'+crypto.createHash('sha256').update(buf).digest('hex').slice(0,24);
  return {mime,data:buf.toString('base64'),bytes:buf.length,revision};
}
async function getDraft(id){
  const raw=await cmd(['HGET',DRAFTS,String(id||'')]);
  if(!raw)return null;try{return JSON.parse(raw);}catch(_){return null;}
}
async function putDraft(d){await cmd(['HSET',DRAFTS,d.id,JSON.stringify(d)]);return d;}
async function trimDraftHistory(){
  const all=parseHash(await cmd(['HGETALL',DRAFTS]).catch(()=>null));
  const rows=Object.values(all).map(x=>{try{return JSON.parse(x);}catch(_){return null;}}).filter(Boolean);
  if(rows.length<=MAX_DRAFTS)return;
  const removable=rows.filter(x=>x.status==='PUBLISHED'||x.status==='CANCELLED').sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
  const n=Math.min(removable.length,rows.length-MAX_DRAFTS);
  for(let i=0;i<n;i++){await cmd(['HDEL',DRAFTS,removable[i].id]).catch(()=>{});await cmd(['DEL',DRAFT_IMAGE_PREFIX+removable[i].id]).catch(()=>{});}
}
async function saveDraft(input,admin){
  const type=safeType(input.type),now=new Date().toISOString(),existing=input.id?await getDraft(input.id):null;
  if(existing?.status==='PUBLISHED')throw new Error('이미 게시된 콘텐츠는 수정할 수 없습니다.');
  const title=cleanText(input.title,type==='news'?100:80),content=cleanText(input.content,type==='news'?12000:4000);
  if(title.length<2||content.length<2)throw new Error('제목과 내용을 2자 이상 입력해주세요.');
  let excerpt=type==='news'?cleanText(input.excerpt,260):'';if(type==='news'&&!excerpt)excerpt=content.replace(/\s+/g,' ').slice(0,180);
  const id=existing?.id||`ed_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
  const communityAuthor=type==='community'?cleanText(input.author||existing?.author||'정참시 운영팀',30):'정참시News 편집부';
  if(type==='community'&&communityAuthor.length<2)throw new Error('정뮤니티 작성자 표시명을 2자 이상 입력해주세요.');
  const d={
    id,type,status:existing?.status==='SCHEDULED'?'SCHEDULED':'DRAFT',category:safeCategory(type,input.category),title,excerpt,content,
    author:communityAuthor,authorId:`admin:${admin?.id||'admin'}`,role:type==='community'?'EDITOR':'ADMIN',
    createdAt:existing?.createdAt||now,updatedAt:now,scheduledAt:existing?.scheduledAt||null,publishedAt:null,publishedPostId:null,
    hasImage:Boolean(existing?.hasImage),lastError:null,schemaVersion:1
  };
  if(input.removeImage===true){await cmd(['DEL',DRAFT_IMAGE_PREFIX+id]).catch(()=>{});d.hasImage=false;}
  if(input.imageData){const image=parseImageData(input.imageData);await setJSON(DRAFT_IMAGE_PREFIX+id,image);d.hasImage=true;}
  await putDraft(d);await trimDraftHistory();return publicDraft(d);
}
async function listDrafts(type){
  const all=parseHash(await cmd(['HGETALL',DRAFTS]).catch(()=>null));
  return Object.values(all).map(x=>{try{return JSON.parse(x);}catch(_){return null;}}).filter(Boolean)
    .filter(x=>!type||x.type===type).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,200).map(publicDraft);
}
async function scheduleDraft(id,scheduledAt){
  const d=await getDraft(id);if(!d)throw new Error('작성 대기 콘텐츠를 찾을 수 없습니다.');if(d.status==='PUBLISHED')throw new Error('이미 게시된 콘텐츠입니다.');
  const ms=Date.parse(String(scheduledAt||''));if(!Number.isFinite(ms))throw new Error('예약 시간을 확인해주세요.');if(ms<Date.now()+30000)throw new Error('예약 시간은 현재보다 최소 30초 이후로 설정해주세요.');
  d.status='SCHEDULED';d.scheduledAt=new Date(ms).toISOString();d.updatedAt=new Date().toISOString();d.lastError=null;
  await putDraft(d);await cmd(['ZADD',SCHEDULE,String(ms),d.id]);return publicDraft(d);
}
async function unscheduleDraft(id){
  const d=await getDraft(id);if(!d)throw new Error('콘텐츠를 찾을 수 없습니다.');if(d.status==='PUBLISHED')throw new Error('이미 게시된 콘텐츠입니다.');
  d.status='DRAFT';d.scheduledAt=null;d.updatedAt=new Date().toISOString();d.lastError=null;await putDraft(d);await cmd(['ZREM',SCHEDULE,d.id]).catch(()=>{});return publicDraft(d);
}
async function deleteDraft(id){
  const d=await getDraft(id);if(!d)return true;if(d.status==='PUBLISHED')throw new Error('게시 완료 기록은 삭제할 수 없습니다.');
  await cmd(['ZREM',SCHEDULE,d.id]).catch(()=>{});await cmd(['HDEL',DRAFTS,d.id]);await cmd(['DEL',DRAFT_IMAGE_PREFIX+d.id]).catch(()=>{});return true;
}
async function publishDraft(id,{force=false}={}){
  const d=await getDraft(id);if(!d)throw new Error('콘텐츠를 찾을 수 없습니다.');if(d.status==='PUBLISHED')return publicDraft(d);
  if(!force&&d.status==='SCHEDULED'&&Date.parse(d.scheduledAt)>Date.now())return publicDraft(d);
  const lock=await cmd(['SET',LOCK_PREFIX+d.id,String(Date.now()),'NX','EX','30']).catch(()=>null);if(lock!=='OK')return publicDraft(d);
  try{
    const now=new Date().toISOString();let postId;
    if(d.type==='community'){
      postId=`p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
      const post={id:postId,category:d.category,title:d.title,content:d.content,author:d.author,authorId:d.authorId,role:d.role||'EDITOR',createdAt:now,commentCount:0,adminPublished:true};
      await cmd(['LPUSH',COMMUNITY_POSTS,JSON.stringify(post)]);await cmd(['LTRIM',COMMUNITY_POSTS,'0',String(MAX_COMMUNITY_POSTS-1)]);
    }else{
      postId=`n_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
      let image=null;if(d.hasImage)image=await getJSON(DRAFT_IMAGE_PREFIX+d.id).catch(()=>null);if(image?.data)await setJSON(NEWS_IMAGE_PREFIX+postId,image);
      const post={id:postId,category:d.category,title:d.title,excerpt:d.excerpt,content:d.content,author:d.author,authorId:d.authorId,role:d.role||'ADMIN',createdAt:now,imageVersion:image?.revision||now,hasImage:Boolean(image?.data),schemaVersion:1,adminPublished:true};
      await cmd(['LPUSH',NEWS_POSTS,JSON.stringify(post)]);await cmd(['LTRIM',NEWS_POSTS,'0',String(MAX_NEWS_POSTS-1)]);
      if(image?.data)await cmd(['DEL',DRAFT_IMAGE_PREFIX+d.id]).catch(()=>{});
    }
    d.status='PUBLISHED';d.publishedAt=now;d.publishedPostId=postId;d.updatedAt=now;d.lastError=null;
    await putDraft(d);await cmd(['ZREM',SCHEDULE,d.id]).catch(()=>{});return publicDraft(d);
  }catch(e){
    d.lastError=e.message||String(e);d.updatedAt=new Date().toISOString();await putDraft(d).catch(()=>{});throw e;
  }finally{await cmd(['DEL',LOCK_PREFIX+d.id]).catch(()=>{});}
}
async function flushDue(limit=12){
  const ids=await cmd(['ZRANGEBYSCORE',SCHEDULE,'-inf',String(Date.now()),'LIMIT','0',String(Math.max(1,Math.min(50,Number(limit)||12)))]).catch(()=>[]);
  const out=[];for(const id of (ids||[])){try{out.push(await publishDraft(id));}catch(_){}}
  return out.filter(Boolean);
}
async function getDraftImage(id){return getJSON(DRAFT_IMAGE_PREFIX+String(id||''));}

module.exports={
  COMMUNITY_CATEGORIES,NEWS_CATEGORIES,MAX_IMAGE_BYTES,looksLikeImage,parseImageData,
  saveDraft,listDrafts,getDraft,scheduleDraft,unscheduleDraft,deleteDraft,publishDraft,flushDue,getDraftImage,publicDraft
};
