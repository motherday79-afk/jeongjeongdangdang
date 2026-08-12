const STATES={OBSERVED:'OBSERVED',ZERO:'ZERO',MISSING:'MISSING'};
function observation(state,provider='',detail='',extra={}){
  return {state,provider,observedAt:new Date().toISOString(),...(detail?{detail}:{}),...extra};
}
function countSignal(s={}){
  return Number(s.count6||0)+Number(s.count24||0)+Number(s.count7d||0)+Number(s.surfaceHits||0)+Number(s.freshHits||0)+Number(s.score||0)+Number(s.totalCount||0);
}
function mark(summary,provider='',state=null,detail='',extra={}){
  const out={...(summary||{})};
  const st=state||((countSignal(out)>0)?STATES.OBSERVED:STATES.ZERO);
  out.observation=observation(st,provider||out.provider||'',detail,extra);
  return out;
}
function missing(provider='',detail='',shape='count'){
  const base=shape==='surface'
    ?{provider,surfaceHits:0,nameHits:0,eventHits:0,freshHits:0,latest:null,totalCount:null,headlines:[]}
    :{provider,count6:0,count24:0,count7d:0,sources6:0,sources24:0,event6:0,title6:0,latest:null,totalCount:null,headlines:[]};
  return mark(base,provider,STATES.MISSING,detail);
}
function stateWeight(summary,legacyAvailable=false){
  const st=summary?.observation?.state;
  if(st===STATES.MISSING)return summary?.observation?.carried?0.45:0;
  if(st===STATES.ZERO||st===STATES.OBSERVED)return 1;
  return legacyAvailable?1:0;
}
function healthStateToObservation(health,hasSignal=false){
  const s=String(health?.state||'').toUpperCase();
  if(['BLOCKED','ERROR','ROBOTS_BLOCKED','ROBOTS_UNAVAILABLE','ROBOTS_SERVER_ERROR','ROBOTS_UNREACHABLE'].includes(s))return STATES.MISSING;
  if(['EMPTY'].includes(s))return STATES.ZERO;
  if(['OK','READY','DEGRADED','ADVISORY_DISALLOW','ADVISORY_UNKNOWN','OK_ROBOTS_DISALLOW','ALLOW_NO_ROBOTS'].includes(s))return hasSignal?STATES.OBSERVED:STATES.ZERO;
  return hasSignal?STATES.OBSERVED:STATES.MISSING;
}
function carryNumeric(summary,factor){
  const out={...(summary||{})};
  for(const k of ['count6','count24','count7d','sources6','sources24','event6','title6','surfaceHits','nameHits','eventHits','freshHits','score','traffic','views6','views24','views7d','totalCount','level7d','level30d','recent3','prior14']){
    if(Number.isFinite(Number(out[k])))out[k]=Number(out[k])*factor;
  }
  return out;
}
function carryIfMissing(current,previous,factor=0.62){
  const cur=current||{};
  if(cur?.observation?.state!==STATES.MISSING)return cur;
  if(!previous||previous?.observation?.state===STATES.MISSING&&!previous?.observation?.carried)return cur;
  const prevState=previous?.observation?.state||((countSignal(previous)>0)?STATES.OBSERVED:STATES.ZERO);
  if(prevState===STATES.ZERO)return {...cur,observation:{...(cur.observation||{}),carried:true,carryFactor:factor,carriedFromState:STATES.ZERO}};
  const out=carryNumeric(previous,factor);
  out.provider=cur.provider||previous.provider;
  out.observation={...(cur.observation||observation(STATES.MISSING,out.provider,'current collection missing')),carried:true,carryFactor:factor,carriedFromState:prevState,previousProvider:previous.provider||''};
  return out;
}
module.exports={STATES,observation,mark,missing,stateWeight,healthStateToObservation,carryIfMissing,countSignal};
