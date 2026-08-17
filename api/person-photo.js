const {resolvePersonPhoto,resolvePersonPhotoFast,cachePersonPhotoRecord}=require('../lib/local_photo');
const {getPhotoMaster,variantSize,MASTER_VERSION}=require('../lib/photo_master');

async function fetchImage(photo){
  const tries=[
    {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',...(photo.profileUrl?{'Referer':photo.profileUrl}:{})},
    {'User-Agent':'Mozilla/5.0','Accept':'image/*,*/*;q=0.8'}
  ];
  for(const headers of tries){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),4500);
    try{
      const r=await fetch(photo.url,{signal:ctl.signal,redirect:'follow',headers});
      if(!r.ok)continue;
      const ct=String(r.headers.get('content-type')||'');if(!ct.startsWith('image/'))continue;
      const buf=Buffer.from(await r.arrayBuffer());if(buf.length<2500||buf.length>9*1024*1024)continue;
      return {buf,ct};
    }catch(_){}finally{clearTimeout(timer);}
  }
  return null;
}
function sendMaster(res,rec){
  const buf=Buffer.from(rec.data,'base64');
  if(!buf.length)return false;
  res.setHeader('Content-Type',rec.mime||'image/webp');
  res.setHeader('Cache-Control','public, max-age=604800, stale-while-revalidate=2592000');
  res.setHeader('CDN-Cache-Control','public, max-age=31536000, stale-while-revalidate=31536000');
  res.setHeader('Vercel-CDN-Cache-Control','public, max-age=31536000, stale-while-revalidate=31536000');
  res.setHeader('X-JJDD-Photo-Cache','MASTER');
  res.setHeader('X-JJDD-Photo-Master',MASTER_VERSION);
  res.setHeader('X-JJDD-Photo-Size',String(rec.size||''));
  res.setHeader('X-JJDD-Photo-Source',String(rec.source||'master').replace(/[^\x20-\x7E]/g,'').slice(0,120)||'master');
  res.setHeader('Content-Length',String(buf.length));
  res.status(200).send(buf);return true;
}
module.exports=async function(req,res){
  if(req.method!=='GET'){res.setHeader('Cache-Control','no-store');return res.status(405).end();}
  const id=Number(req.query?.id||0);if(!id){res.setHeader('Cache-Control','no-store');return res.status(400).end();}
  const size=variantSize(req.query?.s||req.query?.size||160);
  try{
    // v2.6.0 SPEED: optimized self-stored MASTER image is always the first path.
    const master=await getPhotoMaster(id,size).catch(()=>null);
    if(master?.data&&sendMaster(res,master))return;

    // v2.6.2 SPEED: 화면 요청에서는 PHOTO MASTER를 절대 동기 생성하지 않습니다.
    // MASTER가 아직 없다면 즉시 기존 Last-Known-Good 경로로 내려가고, MASTER 구축은 관리자 배치에서만 수행합니다.
    // 첫 방문자가 외부 원본 다운로드/리사이즈 비용을 떠안지 않도록 display hot path를 짧게 유지합니다.

    // v2.2.23 last-known-good fallback remains untouched as the recovery path.
    const previous=await resolvePersonPhotoFast(id);if(!previous?.url){res.setHeader('Cache-Control','no-store, max-age=0');return res.status(404).end();}
    let photo=previous;
    let got=await fetchImage(previous);
    if(!got){
      const replacement=await resolvePersonPhoto(id,{force:true,searchMode:'repair',persist:false}).catch(()=>null);
      if(replacement?.url){
        const replacementGot=await fetchImage(replacement);
        if(replacementGot){
          photo=replacement;got=replacementGot;
          await cachePersonPhotoRecord(id,replacement).catch(()=>{});
        }
      }
      if(!got){const previousRetry=await fetchImage(previous);if(previousRetry){photo=previous;got=previousRetry;}}
    }
    if(!got){res.setHeader('Cache-Control','no-store, max-age=0');return res.status(404).end();}
    res.setHeader('Content-Type',got.ct);
    res.setHeader('Cache-Control','public, max-age=21600, stale-while-revalidate=604800');
    res.setHeader('CDN-Cache-Control','public, max-age=2592000, stale-while-revalidate=31536000');
    res.setHeader('Vercel-CDN-Cache-Control','public, max-age=31536000, stale-while-revalidate=31536000');
    res.setHeader('X-JJDD-Photo-Cache','LEGACY-LKG');
    res.setHeader('X-JJDD-Photo-Source',String(photo.source||'verified-search').replace(/[^\x20-\x7E]/g,'').slice(0,120)||'verified-search');
    return res.status(200).send(got.buf);
  }catch(_){res.setHeader('Cache-Control','no-store, max-age=0');return res.status(404).end();}
};
