const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res)) return;
  try{
    const draftId=String((req.body||{}).draftId||'');
    const key=`jjdd:draft:${draftId}`;
    const draft=await store.getJSON(key);
    if(!draft?.preview) return res.status(409).json({ok:false,error:'게시할 미리보기가 없습니다.'});
    const snap=draft.preview;
    const snapId=String(Date.now());
    await store.setJSON(`jjdd:snapshot:${snapId}`,snap);
    await store.setJSON('jjdd:current',snap);
    await store.lpush('jjdd:history',snapId);
    await store.ltrim('jjdd:history',0,111); // 28 days at 6h cadence
    draft.status='published'; draft.publishedAt=new Date().toISOString();
    await store.setJSON(key,draft,3600);
    return res.status(200).json({ok:true,timestamp:snap.timestamp,top:snap.members.slice(0,10)});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};