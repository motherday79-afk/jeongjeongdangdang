const {requireAdmin}=require('../../lib/auth');
const {photoRoster,findEntity}=require('../../lib/political_roster');
const {buildPhotoMaster,invalidatePhotoMaster,photoMasterStatus,MASTER_VERSION}=require('../../lib/photo_master');

module.exports=async function(req,res){
  if(!requireAdmin(req,res))return;
  res.setHeader('Cache-Control','no-store');
  const roster=photoRoster(),ids=roster.map(x=>Number(x.id)).filter(Boolean);
  try{
    if(req.method==='GET'){
      const st=await photoMasterStatus(ids);return res.json({ok:true,total:ids.length,masterVersion:MASTER_VERSION,...st});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{},action=String(b.action||'warm');
    if(action==='warm'){
      const batch=[...(Array.isArray(b.ids)?b.ids:[])].map(Number).filter(id=>findEntity(id)).slice(0,4);
      if(!batch.length)return res.status(400).json({ok:false,error:'사진 MASTER로 만들 인물 ID가 없습니다.'});
      const rows=await Promise.all(batch.map(async id=>{
        try{const out=await buildPhotoMaster(id,{force:Boolean(b.force)}),recs=out.records||[];return {id,ok:true,cached:Boolean(out.cached),bytes:recs.reduce((n,x)=>n+Number(x.bytes||0),0)};}catch(e){return {id,ok:false,error:String(e?.message||e)};}
      }));
      return res.json({ok:true,rows});
    }
    if(action==='invalidate'){
      const batch=[...(Array.isArray(b.ids)?b.ids:[b.id])].map(Number).filter(id=>findEntity(id)).slice(0,20);for(const id of batch)await invalidatePhotoMaster(id);return res.json({ok:true,invalidated:batch});
    }
    return res.status(400).json({ok:false,error:'지원하지 않는 action입니다.'});
  }catch(e){return res.status(500).json({ok:false,error:e?.message||String(e)});}
};
