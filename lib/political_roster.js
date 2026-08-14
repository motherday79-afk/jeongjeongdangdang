const assemblyRaw=require('../data/roster.json');
const localRaw=require('../data/local_leaders.json');

function decorate(){
  const assembly=(Array.isArray(assemblyRaw)?assemblyRaw:[]).map(x=>({
    ...x,
    entityType:'assembly',
    office:x.id===300?'국회의원 공석':'국회의원',
    jurisdiction:x.constituency||x.region||'',
    photoPolicy:'official-only'
  }));
  const local=(Array.isArray(localRaw)?localRaw:[]).map(x=>({...x}));
  const all=[...assembly.filter(x=>Number(x.id)!==300),...local, ...assembly.filter(x=>Number(x.id)===300)];
  const counts=all.filter(x=>Number(x.id)!==300&&String(x.party||'')!=='공석').reduce((m,x)=>{const n=String(x.name||'').trim();if(n)m[n]=(m[n]||0)+1;return m;},{});
  return all.map(x=>{
    const dup=(counts[String(x.name||'').trim()]||0)>1;
    if(!dup)return {...x,ambiguousName:Boolean(x.ambiguousName)};
    const clues=[...(Array.isArray(x.disambiguation)?x.disambiguation:[]),x.jurisdiction,x.office,x.region,x.constituency]
      .map(v=>String(v||'').trim()).filter(v=>v.length>=2);
    return {...x,ambiguousName:true,disambiguation:[...new Set(clues)]};
  });
}

const allRoster=decorate();
function getAllRoster(){return allRoster.map(x=>({...x,disambiguation:Array.isArray(x.disambiguation)?[...x.disambiguation]:x.disambiguation}));}
function activeRoster(){return getAllRoster().filter(x=>Number(x.id)!==300&&String(x.party||'')!=='공석');}
function assemblyRoster(){return getAllRoster().filter(x=>x.entityType==='assembly');}
function localLeaders(){return getAllRoster().filter(x=>x.entityType==='metro'||x.entityType==='local');}
function findEntity(id){return getAllRoster().find(x=>Number(x.id)===Number(id))||null;}
function counts(){const a=activeRoster();return {active:a.length,assembly:a.filter(x=>x.entityType==='assembly').length,metro:a.filter(x=>x.entityType==='metro').length,local:a.filter(x=>x.entityType==='local').length,vacancy:getAllRoster().filter(x=>Number(x.id)===300).length};}
module.exports={getAllRoster,activeRoster,assemblyRoster,localLeaders,findEntity,counts};
