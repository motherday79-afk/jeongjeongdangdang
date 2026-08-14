const {getJSON,setJSON}=require('./store');
const {findEntity}=require('./political_roster');

const CACHE_TTL=30*24*3600;
const REGIONS={
  '서울특별시':[2],'부산광역시':[3],'대구광역시':[4],'인천광역시':[5],'대전광역시':[7],'울산광역시':[8],
  '경기도':[9],'강원특별자치도':[10],'충청북도':[11],'충청남도':[12],'전북특별자치도':[13],
  '경상북도':[15],'경상남도':[16],'제주특별자치도':[17],'전남광주통합특별시':[6,14]
};
const TRUSTED_ASSOCIATION_ROOTS=['namk.or.kr','gaok.or.kr'];
function absUrl(raw,base){try{return new URL(String(raw||'').replace(/&amp;/g,'&'),base).toString();}catch(_){return null;}}
function cleanText(v){return String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();}
function imageCandidates(chunk,base){
  const out=[];let m;
  const re=/(?:src|data-src|data-original)\s*=\s*["']([^"']+)["']/gi;
  while((m=re.exec(chunk)))out.push({url:absUrl(m[1],base),pos:m.index});
  const bg=/url\(\s*["']?([^"')]+)["']?\s*\)/gi;while((m=bg.exec(chunk)))out.push({url:absUrl(m[1],base),pos:m.index});
  return out.filter(x=>x.url && !/logo|ico[-_/]|\/ico\/|banner|btn[-_/]|search|loading|blank|symbol|\.svg(?:\?|$)/i.test(x.url));
}
function shortPlace(member){
  const j=String(member?.jurisdiction||member?.region||'').trim();
  const parts=j.split(/\s+/).filter(Boolean);return parts[parts.length-1]||j;
}
function findImageNearIdentity(html,member,base){
  const name=String(member.name||'').trim();if(!name)return null;
  let from=0,best=null;
  while(true){
    const idx=html.indexOf(name,from);if(idx<0)break;from=idx+name.length;
    const left=Math.max(0,idx-4500),right=Math.min(html.length,idx+2200),chunk=html.slice(left,right),plain=cleanText(chunk);
    const place=shortPlace(member),office=String(member.office||'').replace(/\s+/g,'');
    const contextOk=!place || plain.includes(place) || (office&&plain.replace(/\s+/g,'').includes(office));
    if(!contextOk)continue;
    const namePos=idx-left,cands=imageCandidates(chunk,base);
    for(const c of cands){const dist=Math.abs(c.pos-namePos);if(!best||dist<best.dist)best={url:c.url,dist};}
  }
  return best?.url||null;
}
async function fetchText(url){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6500);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{'User-Agent':'Mozilla/5.0 (compatible; JJDD-OfficialPhoto/1.0)'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.text();}finally{clearTimeout(timer);}
}
async function associationPhoto(member){
  if(member.entityType==='local'){
    const codes=REGIONS[member.region]||REGIONS[String(member.jurisdiction||'').split(' ')[0]]||[];
    for(const code of codes){
      const url=`https://namk.or.kr/state/member.php?gsp_srch_cate=${code}`;
      try{const html=await fetchText(url);const image=findImageNearIdentity(html,member,url);if(image)return {url:image,profileUrl:url,source:'대한민국시장군수구청장협의회 회원소개'};}catch(_){}
    }
  }
  if(member.entityType==='metro'){
    const url='https://gaok.or.kr/front/organizational.do';
    try{const html=await fetchText(url);const image=findImageNearIdentity(html,member,url);if(image)return {url:image,profileUrl:url,source:'대한민국시도지사협의회 구성원'};}catch(_){}
  }
  return null;
}
function trustedAssociation(url){try{const h=new URL(url).hostname.toLowerCase();return TRUSTED_ASSOCIATION_ROOTS.some(root=>h===root||h.endsWith('.'+root));}catch(_){return false;}}
async function resolveLocalPhoto(id){
  const member=findEntity(id);if(!member||!['metro','local'].includes(member.entityType))return null;
  if(member.photoVerified===true&&member.officialPhoto)return {url:member.officialPhoto,profileUrl:member.officialProfileUrl||null,source:'등록된 공식 프로필',verified:true};
  const override=await getJSON(`jjdd:local-photo:override:${member.id}`).catch(()=>null);
  if(override?.url&&/^https:\/\//i.test(override.url))return {...override,verified:true,manual:true};
  const ck=`jjdd:local-photo:resolved:${member.id}:v2`;
  const cached=await getJSON(ck).catch(()=>null);if(cached?.url&&trustedAssociation(cached.url))return cached;
  const found=await associationPhoto(member);if(found&&trustedAssociation(found.url)){
    const rec={...found,verified:true,resolvedAt:new Date().toISOString()};await setJSON(ck,rec,CACHE_TTL).catch(()=>{});return rec;
  }
  return null;
}
module.exports={resolveLocalPhoto,findImageNearIdentity,associationPhoto};
