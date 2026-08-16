const {requireAdmin}=require('../../lib/auth');
const store=require('../../lib/store');
const {AXES,getAllOverrides,saveOverride,resetOverride,applyOverride,roster}=require('../../lib/member_metrics');

function fallbackMetrics(){return AXES.map(x=>[x,'D',50]);}
module.exports=async function(req,res){
  const admin=requireAdmin(req,res);if(!admin)return;
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method==='GET'){
      const [overrides,currentPublic,currentFull]=await Promise.all([
        getAllOverrides(),store.getJSON('jjdd:current:public').catch(()=>null),store.getJSON('jjdd:current').catch(()=>null)
      ]);
      const current=currentPublic?.members?.length?currentPublic:currentFull;
      const byId=new Map((Array.isArray(current?.members)?current.members:[]).map(x=>[Number(x.id),x]));
      const items=roster().map(p=>{
        const live=byId.get(Number(p.id));const base=Array.isArray(live?.metrics)&&live.metrics.length?live.metrics:fallbackMetrics();const ov=overrides[String(p.id)]||null;
        return {id:Number(p.id),name:p.name,party:p.party,region:p.region||'',constituency:p.constituency||p.jurisdiction||'',entityType:p.entityType,office:p.office||'',baseMetrics:base,metrics:applyOverride(base,ov),override:ov?{values:ov.values,updatedAt:ov.updatedAt||null,updatedBy:ov.updatedBy||null}:null};
      });
      return res.json({ok:true,axes:AXES,items,total:items.length});
    }
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
    const b=req.body||{},action=String(b.action||'save'),id=Number(b.id);
    if(action==='save')return res.json({ok:true,override:await saveOverride(id,b.values,admin)});
    if(action==='reset'){await resetOverride(id);return res.json({ok:true});}
    return res.status(400).json({ok:false,error:'지원하지 않는 작업입니다.'});
  }catch(e){return res.status(400).json({ok:false,error:e.message||String(e)});}
};
