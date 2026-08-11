const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res)) return;
  try{
    const ids=await store.lrange('jjdd:history',0,2);
    if(!Array.isArray(ids)||ids.length<2) return res.status(409).json({ok:false,error:'롤백할 이전 스냅샷이 없습니다.'});
    const prev=await store.getJSON(`jjdd:snapshot:${ids[1]}`);
    if(!prev) return res.status(404).json({ok:false,error:'이전 스냅샷 데이터가 없습니다.'});
    await store.setJSON('jjdd:current',prev);
    return res.status(200).json({ok:true,timestamp:prev.timestamp,top:prev.members?.slice?.(0,10)||[]});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};