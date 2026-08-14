const {disambiguationTerms}=require('./member_key');
function typeOf(m){return String(m?.entityType||'assembly');}
function titleTerm(m){
  if(typeOf(m)==='metro') return String(m?.office||'광역단체장');
  if(typeOf(m)==='local') return String(m?.office||'기초단체장');
  return '국회의원';
}
function roleAliases(m){
  if(typeOf(m)==='metro') return [titleTerm(m),'광역단체장','시도지사','지방정부'];
  if(typeOf(m)==='local'){
    const office=String(m?.office||'');
    const generic=/구청장/.test(office)?'구청장':/군수/.test(office)?'군수':'시장';
    return [titleTerm(m),generic,'기초단체장','지방정부'];
  }
  return ['국회의원','의원','국회'];
}
function identityTerms(m){
  return [...new Set([m?.name,m?.party,m?.jurisdiction,m?.region,m?.constituency,...roleAliases(m),...disambiguationTerms(m)].map(x=>String(x||'').trim()).filter(Boolean))];
}
function searchQualifier(m){
  const clue=m?.ambiguousName?disambiguationTerms(m)[0]:'';
  return [m?.name,titleTerm(m),clue].filter(Boolean).join(' ');
}
function contextTerms(m){
  const base=['정치','정당','정부','선거','공약','정책','예산','행정','의회'];
  return [...new Set([...base,...roleAliases(m),m?.party,m?.jurisdiction,m?.region,m?.constituency,...disambiguationTerms(m)].map(x=>String(x||'').trim()).filter(x=>x.length>=2))];
}
function categoryLabel(m){return typeOf(m)==='metro'?'광역단체장':typeOf(m)==='local'?'기초단체장':'국회의원';}
module.exports={typeOf,titleTerm,roleAliases,identityTerms,searchQualifier,contextTerms,categoryLabel};
