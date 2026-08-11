const crypto=require('crypto');
const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
const {collectMember}=require('../_lib/collector');
const {computeSnapshot}=require('../_lib/score');
const roster=require('../../data/roster.json');

const DRAFT_TTL=12*60*60;
function id(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
function parseBody(req){return req.body||{};}

module.exports=async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res)) return;
  const body=parseBody(req),action=body.action||'start';
  try{
    if(action==='start'){
      const draftId=id();
      const eventTitle=String(body.eventTitle||process.env.DEFAULT_EVENT_TITLE||'현재 주요 정치 이슈').trim();
      const eventKeywords=(Array.isArray(body.eventKeywords)?body.eventKeywords:String(body.eventKeywords||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,12);
      const draft={id:draftId,status:'collecting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),eventTitle,eventKeywords,signals:{}};
      await store.setJSON(`jjdd:draft:${draftId}`,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:299,nextOffset:0,eventTitle,eventKeywords});
    }
    const draftId=String(body.draftId||'');
    const key=`jjdd:draft:${draftId}`;
    const draft=await store.getJSON(key);
    if(!draft) return res.status(404).json({ok:false,error:'Refresh draft를 찾을 수 없습니다. 다시 시작해주세요.'});

    if(action==='batch'){
      const active=roster.filter(x=>x.id!==300&&x.party!=='공석');
      const offset=Math.max(0,Number(body.offset)||0);
      const size=Math.min(15,Math.max(1,Number(body.size)||12));
      const batch=active.slice(offset,offset+size);
      const results=await Promise.all(batch.map(async m=>{
        const signal=await collectMember(m,draft.eventKeywords||[]);
        return [m.name,signal];
      }));
      for(const [name,signal] of results) draft.signals[name]=signal;
      draft.updatedAt=new Date().toISOString();
      const nextOffset=offset+batch.length;
      if(nextOffset>=active.length) draft.status='collected';
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({
        ok:true,draftId,processed:Object.keys(draft.signals).length,total:active.length,nextOffset,done:nextOffset>=active.length,
        batch:results.map(([name,s])=>({name,count6:s.count6,count24:s.count24,count7d:s.count7d,source:s.source,warning:s.warning||null}))
      });
    }
    if(action==='finalize'){
      const activeCount=roster.filter(x=>x.id!==300&&x.party!=='공석').length;
      if(Object.keys(draft.signals||{}).length<activeCount) return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${activeCount}`});
      const previous=await store.getJSON('jjdd:current');
      draft.preview=computeSnapshot(roster,draft.signals,{eventTitle:draft.eventTitle,eventKeywords:draft.eventKeywords},previous);
      draft.status='preview';
      draft.updatedAt=new Date().toISOString();
      await store.setJSON(key,draft,DRAFT_TTL);
      const movers=draft.preview.members.slice(0,299).filter(x=>Number.isFinite(x.change6h)).sort((a,b)=>Math.abs(b.change6h)-Math.abs(a.change6h)).slice(0,15);
      return res.status(200).json({ok:true,draftId,preview:{timestamp:draft.preview.timestamp,top30:draft.preview.members.slice(0,30),movers,sourceSummary:draft.preview.sourceSummary,quality:draft.preview.quality}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};