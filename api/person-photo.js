const {resolvePersonPhoto,cachePersonPhotoRecord}=require('../lib/local_photo');

async function fetchImage(photo){
  const tries=[
    {'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',...(photo.profileUrl?{'Referer':photo.profileUrl}:{})},
    {'User-Agent':'Mozilla/5.0','Accept':'image/*,*/*;q=0.8'}
  ];
  for(const headers of tries){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),8500);
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
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).end();
  const id=Number(req.query?.id||0);if(!id)return res.status(400).end();
  try{
    // v2.2.22: last-known-good 사진 메타데이터를 새 후보가 실제로 성공하기 전에는 버리지 않습니다.
    const previous=await resolvePersonPhoto(id);if(!previous?.url)return res.status(404).end();
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
      // 새 후보도 실패한 경우 기존 known-good 메타데이터는 유지하고 원본을 한 번 더 재시도합니다.
      if(!got){
        const previousRetry=await fetchImage(previous);
        if(previousRetry){photo=previous;got=previousRetry;}
      }
    }
    if(!got)return res.status(404).end();
    res.setHeader('Content-Type',got.ct);
    res.setHeader('Cache-Control','public, max-age=86400, s-maxage=2592000, stale-while-revalidate=2592000');
    res.setHeader('X-JJDD-Photo-Source',String(photo.source||'verified-search').replace(/[^\x20-\x7E]/g,'').slice(0,120)||'verified-search');
    return res.status(200).send(got.buf);
  }catch(_){return res.status(404).end();}
};
