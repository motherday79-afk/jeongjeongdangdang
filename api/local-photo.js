const {resolveLocalPhoto}=require('../lib/local_photo');
module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).end();
  const id=Number(req.query?.id||0);if(!id)return res.status(400).end();
  try{
    const photo=await resolveLocalPhoto(id);if(!photo?.url)return res.status(404).end();
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7000);let r;
    try{r=await fetch(photo.url,{signal:ctl.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; JJDD-OfficialPhoto/1.0)','Referer':photo.profileUrl||undefined}});}finally{clearTimeout(timer);}
    if(!r?.ok)return res.status(404).end();const ct=String(r.headers.get('content-type')||'');if(!ct.startsWith('image/'))return res.status(415).end();
    const buf=Buffer.from(await r.arrayBuffer());if(buf.length<500||buf.length>5*1024*1024)return res.status(404).end();
    res.setHeader('Content-Type',ct);res.setHeader('Cache-Control','public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000');
    return res.status(200).send(buf);
  }catch(_){return res.status(404).end();}
};
