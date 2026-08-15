const crypto=require('crypto');
const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {activeRoster,findEntity}=require('../../lib/political_roster');
const {auditMember,repairMember,recheckMember,summarize}=require('../../lib/photo_audit');

const TTL=24*60*60;
const LATEST='jjdd:photo-audit:latest:v1';
function key(id){return `jjdd:photo-audit:run:${id}:v1`;}
function runId(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
async function saveRun(run){await store.setJSON(key(run.id),run,TTL);await store.setJSON(LATEST,run,TTL);return run;}
function mergeResults(run,rows,rosterLength){const byId=new Map((run.results||[]).map(x=>[String(x.id),x]));for(const x of rows||[])byId.set(String(x.id),x);const results=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id));return {...run,results,summary:summarize(results,rosterLength),updatedAt:new Date().toISOString()};}
module.exports=async function(req,res){
  if(!requireAdmin(req,res))return;
  const roster=activeRoster();
  if(req.method==='GET'){
    const latest=await store.getJSON(LATEST).catch(()=>null);
    return res.json({ok:true,total:roster.length,run:latest||null});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const action=String(req.body?.action||'');
  if(action==='start'){
    const id=runId(),now=new Date().toISOString();
    const run={id,startedAt:now,updatedAt:now,completedAt:null,total:roster.length,processed:0,results:[],summary:summarize([],roster.length),repairRuns:0};
    await saveRun(run);
    return res.json({ok:true,runId:id,total:roster.length,summary:run.summary});
  }
  if(action==='batch'){
    const id=String(req.body?.runId||'');if(!id)return res.status(400).json({ok:false,error:'runId가 필요합니다.'});
    const run=await store.getJSON(key(id));if(!run)return res.status(404).json({ok:false,error:'사진 검수 작업을 찾을 수 없습니다.'});
    const offset=Math.max(0,Number(req.body?.offset||run.processed||0));const size=Math.max(1,Math.min(2,Number(req.body?.size||2)));
    const slice=roster.slice(offset,offset+size),batch=[];
    for(const m of slice){batch.push(await auditMember(m));if(slice.length>1)await new Promise(r=>setTimeout(r,120));}
    const processed=Math.min(roster.length,offset+slice.length),done=processed>=roster.length,now=new Date().toISOString();
    let next=mergeResults(run,batch,roster.length);next={...next,completedAt:done?now:null,processed,updatedAt:now};
    await saveRun(next);
    return res.json({ok:true,runId:id,processed,total:roster.length,nextOffset:processed,done,batch,summary:next.summary,completedAt:next.completedAt});
  }
  if(action==='repair-start'){
    const run=await store.getJSON(LATEST).catch(()=>null);if(!run)return res.status(404).json({ok:false,error:'먼저 전체 사진 검수를 실행해주세요.'});
    const ids=(run.results||[]).filter(x=>x.status==='REVIEW'||x.status==='FAILED').map(x=>Number(x.id)).filter(Boolean);
    return res.json({ok:true,runId:run.id,total:ids.length,ids,summary:run.summary});
  }
  if(action==='repair-batch'){
    const id=String(req.body?.runId||'');if(!id)return res.status(400).json({ok:false,error:'runId가 필요합니다.'});
    const run=await store.getJSON(key(id)).catch(()=>null);if(!run)return res.status(404).json({ok:false,error:'사진 검수 작업을 찾을 수 없습니다.'});
    const ids=[...(Array.isArray(req.body?.ids)?req.body.ids:[])].map(Number).filter(Boolean).slice(0,2),batch=[];
    for(const mid of ids){const m=findEntity(mid);if(!m)continue;batch.push(await repairMember(m));await new Promise(r=>setTimeout(r,280));}
    let next=mergeResults(run,batch,roster.length);next={...next,repairRuns:Number(run.repairRuns||0)+batch.length,lastRepairAt:new Date().toISOString()};
    await saveRun(next);
    return res.json({ok:true,runId:id,batch,summary:next.summary,run:next});
  }
  if(action==='repair-one'){
    const mid=Number(req.body?.id||0),m=findEntity(mid);if(!m)return res.status(404).json({ok:false,error:'정치인을 찾을 수 없습니다.'});
    const run=await store.getJSON(LATEST).catch(()=>null);if(!run)return res.status(404).json({ok:false,error:'먼저 전체 사진 검수를 실행해주세요.'});
    const row=await repairMember(m);let next=mergeResults(run,[row],roster.length);next={...next,repairRuns:Number(run.repairRuns||0)+1,lastRepairAt:new Date().toISOString()};await saveRun(next);
    return res.json({ok:true,result:row,summary:next.summary,run:next});
  }
  if(action==='recheck-one'){
    const mid=Number(req.body?.id||0),m=findEntity(mid);if(!m)return res.status(404).json({ok:false,error:'정치인을 찾을 수 없습니다.'});
    const run=await store.getJSON(LATEST).catch(()=>null);if(!run)return res.status(404).json({ok:false,error:'먼저 전체 사진 검수를 실행해주세요.'});
    const row=await recheckMember(m);const next=mergeResults(run,[row],roster.length);await saveRun(next);return res.json({ok:true,result:row,summary:next.summary,run:next});
  }
  return res.status(400).json({ok:false,error:'지원하지 않는 action입니다.'});
};
