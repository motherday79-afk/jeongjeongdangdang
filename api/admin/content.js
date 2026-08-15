const {requireAdmin}=require('../../lib/auth');
const {saveDraft,listDrafts,getDraft,scheduleDraft,unscheduleDraft,deleteDraft,publishDraft,flushDue,getDraftImage,looksLikeImage}=require('../../lib/editorial');

function clean(v,max=100){return String(v||'').trim().slice(0,max);}
module.exports=async function(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store');
  const action=String(req.query?.action||req.body?.action||'list');
  try{
    if(req.method==='GET'&&action==='image'){
      const img=await getDraftImage(clean(req.query?.id));if(!img?.data||!/^image\/(jpeg|png|webp)$/.test(String(img.mime||'')))return res.status(404).end();
      const buf=Buffer.from(img.data,'base64');if(!looksLikeImage(buf,img.mime))return res.status(404).end();res.setHeader('Content-Type',img.mime);res.setHeader('X-Content-Type-Options','nosniff');return res.status(200).end(buf);
    }
    if(req.method==='GET'||action==='list'){
      await flushDue(20).catch(()=>{});const type=['community','news'].includes(String(req.query?.type||''))?String(req.query.type):null;
      return res.json({ok:true,items:await listDrafts(type)});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{};
    if(action==='save')return res.json({ok:true,item:await saveDraft(b,admin)});
    if(action==='schedule')return res.json({ok:true,item:await scheduleDraft(clean(b.id),b.scheduledAt)});
    if(action==='unschedule')return res.json({ok:true,item:await unscheduleDraft(clean(b.id))});
    if(action==='publish')return res.json({ok:true,item:await publishDraft(clean(b.id),{force:true})});
    if(action==='delete'){await deleteDraft(clean(b.id));return res.json({ok:true});}
    if(action==='flush')return res.json({ok:true,published:await flushDue(50)});
    if(action==='get'){const item=await getDraft(clean(b.id));return item?res.json({ok:true,item}):res.status(404).json({ok:false,error:'콘텐츠를 찾을 수 없습니다.'});}
    return res.status(400).json({ok:false,error:'지원하지 않는 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
