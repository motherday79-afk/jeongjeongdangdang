const crypto=require('crypto');
const {getJSON,setJSON,del,setNx,cmd}=require('./store');
const {resolvePersonPhoto}=require('./local_photo');

const MASTER_SCHEMA=1;
const MASTER_VERSION='v260-photo-master-1';
const VARIANTS={
  160:{width:160,height:160,quality:76},
  360:{width:360,height:360,quality:80}
};
// v2.7.3: PHOTO MASTER는 화면 캐시가 아니라 정참시의 영구 인물 자산입니다.
const POSITIVE_TTL=null;
const LOCK_TTL=35;
const INDEX_KEY=`jjdd:photo-master:index:${MASTER_VERSION}`;

function variantSize(v){const n=Number(v);return n>=300?360:160;}
function key(id,size){return `jjdd:photo-master:${MASTER_VERSION}:${Number(id)}:${variantSize(size)}`;}
function lockKey(id){return `jjdd:photo-master:lock:${MASTER_VERSION}:${Number(id)}`;}
function statusKey(id){return `jjdd:photo-master:status:${MASTER_VERSION}:${Number(id)}`;}
function safeHttpUrl(v){try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.toString():'';}catch(_){return '';}}
function sourceFingerprint(photo){return crypto.createHash('sha1').update(`${photo?.url||''}|${photo?.source||''}|${photo?.profileUrl||''}`).digest('hex').slice(0,16);}

async function fetchOriginal(photo,{timeout=8500}={}){
  const url=safeHttpUrl(photo?.url);if(!url)return null;
  const tries=[
    {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',...(photo?.profileUrl?{'Referer':photo.profileUrl}:{})},
    {'User-Agent':'Mozilla/5.0','Accept':'image/*,*/*;q=0.8'}
  ];
  for(const headers of tries){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const r=await fetch(url,{signal:ctl.signal,redirect:'follow',headers,cache:'no-store'});
      if(!r.ok)continue;
      const ct=String(r.headers.get('content-type')||'').toLowerCase();if(!ct.startsWith('image/'))continue;
      const buf=Buffer.from(await r.arrayBuffer());if(buf.length<2500||buf.length>9*1024*1024)continue;
      return {buf,ct};
    }catch(_){}finally{clearTimeout(timer);}
  }
  return null;
}
async function sharpModule(){try{return require('sharp');}catch(_){return null;}}
async function optimize(buf,size){
  const sharp=await sharpModule();
  if(!sharp)return {buf,mime:'application/octet-stream',optimized:false,width:null,height:null};
  const cfg=VARIANTS[variantSize(size)];
  const out=await sharp(buf,{failOn:'none'})
    .rotate()
    .resize(cfg.width,cfg.height,{fit:'cover',position:'attention',withoutEnlargement:false})
    .webp({quality:cfg.quality,effort:4,smartSubsample:true})
    .toBuffer({resolveWithObject:true});
  return {buf:out.data,mime:'image/webp',optimized:true,width:out.info.width||cfg.width,height:out.info.height||cfg.height};
}
function recordFrom(id,size,photo,opt){
  const s=variantSize(size);return {
    schemaVersion:MASTER_SCHEMA,masterVersion:MASTER_VERSION,id:Number(id),size:s,
    mime:opt.mime==='application/octet-stream'?'image/jpeg':opt.mime,
    data:opt.buf.toString('base64'),bytes:opt.buf.length,width:opt.width,height:opt.height,
    optimized:Boolean(opt.optimized),source:String(photo?.source||'verified-photo').slice(0,180),
    profileUrl:photo?.profileUrl||null,sourceUrl:photo?.url||null,sourceFingerprint:sourceFingerprint(photo),
    generatedAt:new Date().toISOString()
  };
}
async function getPhotoMaster(id,size=160){return getJSON(key(id,size)).catch(()=>null);}
async function persistMasterKeys(id){const n=Number(id);if(!n)return;await Promise.all([cmd(['PERSIST',key(n,160)]).catch(()=>{}),cmd(['PERSIST',key(n,360)]).catch(()=>{}),cmd(['PERSIST',statusKey(n)]).catch(()=>{})]);}
async function saveRecord(rec){await setJSON(key(rec.id,rec.size),rec);return rec;}
async function invalidatePhotoMaster(id){
  const n=Number(id);if(!n)return 0;
  await Promise.all([del(key(n,160)).catch(()=>{}),del(key(n,360)).catch(()=>{}),del(statusKey(n)).catch(()=>{}),cmd(['HDEL',INDEX_KEY,String(n)]).catch(()=>{})]);return 1;
}
async function buildPhotoMaster(id,{force=false}={}){
  const n=Number(id);if(!n)throw new Error('인물 ID가 없습니다.');
  if(!force){const [a,b]=await Promise.all([getPhotoMaster(n,160),getPhotoMaster(n,360)]);if(a&&b){await persistMasterKeys(n);return {ok:true,cached:true,records:[a,b]};}}
  const locked=await setNx(lockKey(n),String(Date.now()),LOCK_TTL).catch(()=>false);
  if(!locked){
    for(let i=0;i<6;i++){await new Promise(r=>setTimeout(r,180));const [a,b]=await Promise.all([getPhotoMaster(n,160),getPhotoMaster(n,360)]);if(a&&b)return {ok:true,cached:true,waited:true,records:[a,b]};}
    throw new Error('사진 MASTER 생성이 진행 중입니다.');
  }
  try{
    const photo=await resolvePersonPhoto(n,{force:Boolean(force),searchMode:force?'repair':'normal',persist:true});
    if(!photo?.url)throw new Error('검증된 사진 원본을 찾지 못했습니다.');
    const got=await fetchOriginal(photo);if(!got)throw new Error('사진 원본을 가져오지 못했습니다.');
    const [o160,o360]=await Promise.all([optimize(got.buf,160),optimize(got.buf,360)]);
    const r160=recordFrom(n,160,photo,o160),r360=recordFrom(n,360,photo,o360);
    const stat={ok:true,id:n,sourceFingerprint:r160.sourceFingerprint,generatedAt:r160.generatedAt,bytes160:r160.bytes,bytes360:r360.bytes};
    await Promise.all([saveRecord(r160),saveRecord(r360),setJSON(statusKey(n),stat),cmd(['HSET',INDEX_KEY,String(n),JSON.stringify(stat)]).catch(()=>{})]);
    return {ok:true,cached:false,records:[r160,r360]};
  }catch(e){
    await setJSON(statusKey(n),{ok:false,id:n,error:String(e?.message||e),failedAt:new Date().toISOString()},3600).catch(()=>{});
    throw e;
  }finally{
    await del(lockKey(n)).catch(()=>{});
  }
}
async function getOrBuildPhotoMaster(id,size=160,{allowBuild=true}={}){
  const n=Number(id),s=variantSize(size);if(!n)return null;
  const cached=await getPhotoMaster(n,s);if(cached?.data)return {...cached,cached:true};
  if(!allowBuild)return null;
  try{const built=await buildPhotoMaster(n);return built.records.find(x=>Number(x.size)===s)||null;}catch(_){return null;}
}
async function photoMasterStatus(ids=[]){
  const arr=[...new Set((ids||[]).map(Number).filter(Boolean))];
  const raw=await cmd(['HGETALL',INDEX_KEY]).catch(()=>null),map={};
  if(Array.isArray(raw)){for(let i=0;i<raw.length;i+=2){try{map[String(raw[i])]=JSON.parse(raw[i+1]);}catch(_){}}}
  else if(raw&&typeof raw==='object')Object.assign(map,raw);
  const targets=arr.length?arr:Object.keys(map).map(Number).filter(Boolean);
  const rows=targets.map(id=>{const s=map[String(id)]||null;return {id,ready160:Boolean(s?.ok),ready360:Boolean(s?.ok),bytes160:Number(s?.bytes160||0),bytes360:Number(s?.bytes360||0),generatedAt:s?.generatedAt||null,error:s?.ok===false?s.error:null};});
  const ready=rows.filter(x=>x.ready160&&x.ready360).length;return {masterVersion:MASTER_VERSION,total:rows.length,ready,pending:Math.max(0,rows.length-ready),bytes:rows.reduce((n,x)=>n+x.bytes160+x.bytes360,0),rows};
}

module.exports={MASTER_VERSION,variantSize,getPhotoMaster,getOrBuildPhotoMaster,buildPhotoMaster,invalidatePhotoMaster,photoMasterStatus,fetchOriginal,persistMasterKeys};
