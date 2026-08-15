const crypto=require('crypto');
const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {activeRoster}=require('../../lib/political_roster');
const {auditMember,summarize}=require('../../lib/photo_audit');

const TTL=24*60*60;
const LATEST='jjdd:photo-audit:latest:v1';
function key(id){return `jjdd:photo-audit:run:${id}:v1`;}
function runId(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
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
    const run={id,startedAt:now,updatedAt:now,completedAt:null,total:roster.length,processed:0,results:[],summary:summarize([],roster.length)};
    await store.setJSON(key(id),run,TTL);await store.setJSON(LATEST,run,TTL);
    return res.json({ok:true,runId:id,total:roster.length,summary:run.summary});
  }
  if(action==='batch'){
    const id=String(req.body?.runId||'');if(!id)return res.status(400).json({ok:false,error:'runId가 필요합니다.'});
    const run=await store.getJSON(key(id));if(!run)return res.status(404).json({ok:false,error:'사진 검수 작업을 찾을 수 없습니다.'});
    const offset=Math.max(0,Number(req.body?.offset||run.processed||0));const size=Math.max(1,Math.min(4,Number(req.body?.size||4)));
    const slice=roster.slice(offset,offset+size);
    const batch=await Promise.all(slice.map(m=>auditMember(m)));
    const byId=new Map((run.results||[]).map(x=>[String(x.id),x]));for(const x of batch)byId.set(String(x.id),x);
    const results=[...byId.values()].sort((a,b)=>Number(a.id)-Number(b.id));
    const processed=Math.min(roster.length,offset+slice.length),done=processed>=roster.length,now=new Date().toISOString();
    const next={...run,updatedAt:now,completedAt:done?now:null,processed,results,summary:summarize(results,roster.length)};
    await store.setJSON(key(id),next,TTL);await store.setJSON(LATEST,next,TTL);
    return res.json({ok:true,runId:id,processed,total:roster.length,nextOffset:processed,done,batch,summary:next.summary,completedAt:next.completedAt});
  }
  return res.status(400).json({ok:false,error:'지원하지 않는 action입니다.'});
};
