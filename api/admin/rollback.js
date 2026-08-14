const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {publicSnapshot}=require('../../lib/public_snapshot');
const {appendRankHistory}=require('../../lib/rank_history');
const ROSTER_VERSION='2026-08-15-national-local-v1';
function parseJSON(v){try{return v==null?null:JSON.parse(v)}catch(e){return null}}
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res)) return;
  try{
    const ids=await store.lrange('jjdd:history',0,111);
    if(!Array.isArray(ids)||ids.length<2) return res.status(409).json({ok:false,error:'롤백할 이전 스냅샷이 없습니다.'});
    let raws=[];
    try{raws=await store.cmd(['MGET',...ids.slice(1).map(id=>`jjdd:snapshot:${id}`)]);}catch(_){raws=[];}
    const candidates=ids.slice(1).map((id,i)=>({id,snap:parseJSON(raws?.[i])})).filter(x=>x.snap);
    // Never roll the site back across a roster identity boundary. Old snapshots contain different occupants.
    const compatible=candidates.find(x=>String(x.snap.rosterVersion||'')===ROSTER_VERSION);
    if(!compatible) return res.status(409).json({ok:false,error:'현재 정치인 명단과 호환되는 이전 스냅샷이 없습니다. 새 명단으로 두 번 이상 게시한 뒤 롤백할 수 있습니다.'});
    const prev=compatible.snap;
    const snapId=String(Date.now());
    const publishedAt=new Date().toISOString();
    const rollbackSnap={...prev,publicationId:snapId,publishedAt,rollbackOf:prev.publicationId||String(compatible.id)};
    await store.setJSON(`jjdd:snapshot:${snapId}`,rollbackSnap);
    await store.lpush('jjdd:history',snapId);
    await store.ltrim('jjdd:history',0,111);
    await appendRankHistory(rollbackSnap,'ROLLBACK');
    await store.setJSON('jjdd:current',rollbackSnap);
    await store.setJSON('jjdd:current:public',publicSnapshot(rollbackSnap));
    return res.status(200).json({ok:true,publicationId:snapId,timestamp:rollbackSnap.timestamp,top:rollbackSnap.members?.slice?.(0,10)||[],publicSnapshot:publicSnapshot(rollbackSnap)});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
