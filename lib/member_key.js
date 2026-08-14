function memberKey(member){
  if(member && Number.isFinite(Number(member.id))) return `id:${Number(member.id)}`;
  const name=String(member?.name||'').trim();
  const constituency=String(member?.constituency||'').trim();
  return `name:${name}|${constituency}`;
}
function sameIdentity(a,b){
  if(!a||!b)return false;
  if(Number.isFinite(Number(a.id))&&Number.isFinite(Number(b.id))&&Number(a.id)!==Number(b.id))return false;
  return String(a.name||'').trim()===String(b.name||'').trim();
}
function findPreviousMember(previous,member){
  const rows=previous?.members||[];
  const byId=rows.find(p=>Number(p?.id)===Number(member?.id));
  if(byId) return sameIdentity(byId,member)?byId:null;
  const sameName=rows.filter(p=>String(p?.name||'')===String(member?.name||''));
  if(member?.ambiguousName)return sameName.find(p=>String(p?.constituency||'')===String(member?.constituency||''))||null;
  if(sameName.length===1)return sameName[0];
  return sameName.find(p=>String(p?.constituency||'')===String(member?.constituency||''))||null;
}
function signalFor(map,member){
  if(!map)return undefined;
  const direct=map[memberKey(member)];
  if(direct!==undefined)return direct;
  if(member?.ambiguousName)return undefined;
  return map[String(member?.name||'')];
}
function disambiguationTerms(member){
  const explicit=Array.isArray(member?.disambiguation)?member.disambiguation:[];
  const constituency=String(member?.constituency||'').replace(/^\S+\s+/,'');
  const chunks=constituency.split(/시|군|구|읍|면|동|·|\s+/).map(x=>x.replace(/[갑을병정]$/,'').trim()).filter(x=>x.length>=2);
  const region=String(member?.region||'').trim();
  const jurisdiction=String(member?.jurisdiction||'').trim();
  const office=String(member?.office||'').trim();
  return [...new Set([...explicit,jurisdiction,office,region,...chunks].map(x=>String(x||'').trim()).filter(x=>x.length>=2))];
}
module.exports={memberKey,sameIdentity,findPreviousMember,signalFor,disambiguationTerms};
