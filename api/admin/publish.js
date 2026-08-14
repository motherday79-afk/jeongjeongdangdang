const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {publicSnapshot}=require('../../lib/public_snapshot');
const {appendRankHistory}=require('../../lib/rank_history');
module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res)) return;
  try{
    const draftId=String((req.body||{}).draftId||'');
    const key=`jjdd:draft:${draftId}`;
    const draft=await store.getJSON(key);
    if(!draft?.preview) return res.status(409).json({ok:false,error:'게시할 미리보기가 없습니다.'});

    // Publish consistency rule:
    // 1) immutable snapshot -> 2) history -> 3) current pointer LAST.
    // A reader that sees the new current is therefore guaranteed to have its history entry ready.
    const snapId=String(Date.now());
    const publishedAt=new Date().toISOString();
    const snap={...draft.preview,publicationId:snapId,publishedAt};
    await store.setJSON(`jjdd:snapshot:${snapId}`,snap);
    await store.lpush('jjdd:history',snapId);
    await store.ltrim('jjdd:history',0,111); // short full snapshots remain for rollback/admin diagnostics
    await appendRankHistory(snap,'MANUAL'); // lightweight long-term rank-only time series
    await store.setJSON('jjdd:current',snap); // full admin/current snapshot
    await store.setJSON('jjdd:current:public',publicSnapshot(snap)); // compact public pointer LAST

    draft.status='published';
    draft.publishedAt=publishedAt;
    draft.publicationId=snapId;
    await store.setJSON(key,draft,3600);
    return res.status(200).json({ok:true,publicationId:snapId,timestamp:snap.timestamp,top:snap.members.slice(0,10),publicSnapshot:publicSnapshot(snap)});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
