const crypto=require('crypto');
const {requireAdmin}=require('../_lib/auth');
const store=require('../_lib/store');
const {collectMember,collectEnrichmentMember,preliminaryHeat}=require('../_lib/collector');
const {computeSnapshot}=require('../_lib/score');
const {readTrafficSignals}=require('../_lib/traffic');
const roster=require('../../data/roster.json');

const DRAFT_TTL=12*60*60;
function id(){return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;}
function body(req){return req.body||{};}
function active(){return roster.filter(x=>x.id!==300&&x.party!=='공석');}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'POST only'});
  if(!requireAdmin(req,res))return;
  const b=body(req),action=b.action||'start';
  try{
    if(action==='start'){
      const draftId=id(),eventTitle=String(b.eventTitle||process.env.DEFAULT_EVENT_TITLE||'현재 주요 정치 이슈').trim();
      const eventKeywords=(Array.isArray(b.eventKeywords)?b.eventKeywords:String(b.eventKeywords||'').split(',')).map(x=>String(x).trim()).filter(Boolean).slice(0,12);
      const draft={id:draftId,status:'collecting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),eventTitle,eventKeywords,signals:{},enrichmentNames:[],enrichmentDone:0};
      await store.setJSON(`jjdd:draft:${draftId}`,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:active().length,nextOffset:0,eventTitle,eventKeywords});
    }
    const draftId=String(b.draftId||''),key=`jjdd:draft:${draftId}`,draft=await store.getJSON(key);
    if(!draft)return res.status(404).json({ok:false,error:'Refresh draft를 찾을 수 없습니다. 다시 시작해주세요.'});

    if(action==='batch'){
      const members=active(),offset=Math.max(0,Number(b.offset)||0),size=Math.min(8,Math.max(1,Number(b.size)||6)),batch=members.slice(offset,offset+size);
      const results=await Promise.all(batch.map(async m=>[m.name,await collectMember(m,draft.eventKeywords||[])]));
      for(const [name,signal] of results)draft.signals[name]=signal;
      const nextOffset=offset+batch.length;draft.updatedAt=new Date().toISOString();if(nextOffset>=members.length)draft.status='collected';
      await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,processed:Object.keys(draft.signals).length,total:members.length,nextOffset,done:nextOffset>=members.length,batch:results.map(([name,s])=>({name,news6:s.channels?.news?.count6||0,portal6:['web','blog','cafe'].reduce((a,k)=>a+(s.channels?.[k]?.count6||0),0),warning:s.warning||null}))});
    }
    if(action==='prepare-enrichment'){
      const count=active().length;if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const n=Math.max(5,Math.min(25,Number(process.env.ENRICH_TOP_N)||20));
      const ranked=active().map(m=>({name:m.name,heat:preliminaryHeat(draft.signals[m.name])})).sort((a,b)=>b.heat-a.heat);
      const eventNames=ranked.filter(x=>{
        const c=draft.signals[x.name]?.channels||{};return Object.values(c).some(s=>(s?.event6||0)>0);
      }).map(x=>x.name);
      draft.enrichmentNames=[...new Set([...eventNames.slice(0,n),...ranked.slice(0,n).map(x=>x.name)])].slice(0,n);
      draft.enrichmentDone=0;draft.status='enriching';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,draftId,total:draft.enrichmentNames.length,names:draft.enrichmentNames,configured:{youtube:Boolean(process.env.YOUTUBE_API_KEY),x:Boolean(process.env.X_BEARER_TOKEN)}});
    }
    if(action==='enrich'){
      const offset=Math.max(0,Number(b.offset)||0),size=Math.min(5,Math.max(1,Number(b.size)||4)),names=(draft.enrichmentNames||[]).slice(offset,offset+size);
      const map=new Map(active().map(m=>[m.name,m]));
      const results=await Promise.all(names.map(async name=>[name,await collectEnrichmentMember(map.get(name),draft.eventKeywords||[])]));
      for(const [name,en] of results){draft.signals[name]=draft.signals[name]||{channels:{},evidenceItems:[]};Object.assign(draft.signals[name].channels,en.channels||{});if(en.warning)draft.signals[name].warning=[draft.signals[name].warning,en.warning].filter(Boolean).join('; ');}
      const nextOffset=offset+names.length;draft.enrichmentDone=nextOffset;if(nextOffset>=(draft.enrichmentNames||[]).length)draft.status='enriched';await store.setJSON(key,draft,DRAFT_TTL);
      return res.status(200).json({ok:true,nextOffset,total:(draft.enrichmentNames||[]).length,done:nextOffset>=(draft.enrichmentNames||[]).length});
    }
    if(action==='finalize'){
      const count=active().length;if(Object.keys(draft.signals||{}).length<count)return res.status(409).json({ok:false,error:`수집이 아직 끝나지 않았습니다. ${Object.keys(draft.signals||{}).length}/${count}`});
      const previous=await store.getJSON('jjdd:current'),traffic=await readTrafficSignals(active());
      draft.preview=computeSnapshot(roster,draft.signals,{eventTitle:draft.eventTitle,eventKeywords:draft.eventKeywords},previous,traffic);draft.status='preview';draft.updatedAt=new Date().toISOString();await store.setJSON(key,draft,DRAFT_TTL);
      const movers=draft.preview.members.slice(0,299).filter(x=>Number.isFinite(x.change6h)).sort((a,b)=>Math.abs(b.change6h)-Math.abs(a.change6h)).slice(0,15);
      return res.status(200).json({ok:true,draftId,preview:{timestamp:draft.preview.timestamp,top30:draft.preview.members.slice(0,30),movers,quality:draft.preview.quality,configuredSources:draft.preview.configuredSources,detectedIssues:draft.preview.detectedIssues}});
    }
    return res.status(400).json({ok:false,error:'Unknown action'});
  }catch(e){return res.status(500).json({ok:false,error:e.message||String(e)});}
};
