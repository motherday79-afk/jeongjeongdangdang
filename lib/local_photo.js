const {getJSON,setJSON,del}=require('./store');
const {findEntity}=require('./political_roster');
const {getMaster}=require('./member_master');

const CACHE_TTL=30*24*3600;
const NEGATIVE_CACHE_TTL=6*3600;
const SEARCH_CACHE_VERSION='v5-hq-web-search';
const REGIONS={
  '서울특별시':[2],'부산광역시':[3],'대구광역시':[4],'인천광역시':[5],'대전광역시':[7],'울산광역시':[8],
  '경기도':[9],'강원특별자치도':[10],'충청북도':[11],'충청남도':[12],'전북특별자치도':[13],
  '경상북도':[15],'경상남도':[16],'제주특별자치도':[17],'전남광주통합특별시':[6,14]
};
const TRUSTED_ASSOCIATION_ROOTS=['namk.or.kr','gaok.or.kr'];
const BAD_IMAGE_WORDS=/logo|symbol|banner|icon|ico[-_/]|\/ico\/|btn[-_/]|search|loading|blank|sprite|emblem|seal|map|qr|poster|cardnews|thumbnail_default|\.svg(?:\?|$)/i;
const BAD_CONTEXT_WORDS=/배우|가수|선수|모델|작가|교수|유튜버|방송인|기업인|동명이인/i;
let assemblyMasterPromise=null;
function assemblyMaster(){if(!assemblyMasterPromise)assemblyMasterPromise=getMaster().catch(e=>{assemblyMasterPromise=null;throw e;});return assemblyMasterPromise;}

function absUrl(raw,base){try{return new URL(String(raw||'').replace(/&amp;/g,'&'),base).toString();}catch(_){return null;}}
function cleanText(v){return String(v||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();}
function htmlDecode(v=''){
  return String(v).replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x2F;/gi,'/');
}
function normalize(v=''){return cleanText(v).toLowerCase().replace(/[\s·,()\-_/]/g,'');}
function unique(xs){return [...new Set((xs||[]).map(x=>String(x||'').trim()).filter(Boolean))];}
function hostOf(url){try{return new URL(url).hostname.toLowerCase();}catch(_){return '';}}
function isHttpUrl(url){return /^https?:\/\//i.test(String(url||''));}
function imageCandidates(chunk,base){
  const out=[];let m;
  const re=/(?:src|data-src|data-original)\s*=\s*["']([^"']+)["']/gi;
  while((m=re.exec(chunk)))out.push({url:absUrl(m[1],base),pos:m.index});
  const bg=/url\(\s*["']?([^"')]+)["']?\s*\)/gi;while((m=bg.exec(chunk)))out.push({url:absUrl(m[1],base),pos:m.index});
  return out.filter(x=>x.url&&!BAD_IMAGE_WORDS.test(x.url));
}
function shortPlace(member){
  const j=String(member?.jurisdiction||member?.region||'').trim();
  const parts=j.split(/\s+/).filter(Boolean);return parts[parts.length-1]||j;
}
function genericOffice(member){
  const o=String(member?.office||'');
  if(/구청장/.test(o))return '구청장';
  if(/군수/.test(o))return '군수';
  if(/시장/.test(o))return '시장';
  if(/도지사/.test(o))return '도지사';
  return o||'지방자치단체장';
}
function memberClues(member){
  const place=shortPlace(member),j=String(member?.jurisdiction||''),region=String(member?.region||''),office=String(member?.office||''),generic=genericOffice(member);
  const dis=Array.isArray(member?.disambiguation)?member.disambiguation:[];
  return unique([office,generic,place,j,region,...dis]).filter(x=>x.length>=2);
}
function searchQueries(member){
  const name=String(member?.name||'').trim(),office=String(member?.office||'').trim(),place=shortPlace(member),j=String(member?.jurisdiction||'').trim(),generic=genericOffice(member);
  return unique([
    `${name} ${office} 프로필 사진`,
    `${name} ${office} 사진`,
    `${name} ${place} ${generic} 사진`,
    `${name} ${j} 당선인`,
    `${name} ${place} 정치인`,
    `${name} ${place} 프로필`
  ]).slice(0,6);
}
function contextScore(text,member){
  const raw=cleanText(text),n=normalize(raw),name=normalize(member?.name||'');
  if(!name||!n.includes(name))return -100;
  let score=24;
  const clues=memberClues(member);
  let clueHits=0;
  for(const c of clues){const cc=normalize(c);if(cc&&n.includes(cc)){score+=cc.length>=5?12:8;clueHits++;}}
  if(BAD_CONTEXT_WORDS.test(raw)&&!/시장|군수|구청장|도지사|정치|당선/.test(raw))score-=40;
  if(/시장|군수|구청장|도지사|정치|당선|지방선거/.test(raw))score+=6;
  if(clueHits===0)score-=18;
  return score;
}
function sourceHostScore(url){
  const h=hostOf(url);if(!h)return 0;
  if(/\.go\.kr$|(^|\.)gov\.kr$/.test(h))return 45;
  if(TRUSTED_ASSOCIATION_ROOTS.some(root=>h===root||h.endsWith('.'+root)))return 42;
  if(/assembly\.go\.kr$/.test(h))return 38;
  if(/yna\.co\.kr$|newsis\.com$|news1\.kr$|khan\.co\.kr$|hani\.co\.kr$|donga\.com$|chosun\.com$|joongang\.co\.kr$|mk\.co\.kr$|hankyung\.com$|seoul\.co\.kr$/.test(h))return 16;
  if(/blog\.|cafe\.|facebook\.|instagram\.|youtube\.|namu\.|pinterest\./.test(h))return -15;
  return 4;
}
function dimensionScore(w,h){
  w=Number(w)||0;h=Number(h)||0;
  if(!w||!h)return 0;
  if(w<260||h<260)return -45;
  const area=w*h;
  let score=Math.min(42,Math.max(0,Math.log2(Math.max(1,area/160000))*10));
  if(w>=900&&h>=900)score+=12;
  else if(w>=700&&h>=700)score+=8;
  else if(w>=500&&h>=500)score+=4;
  const ratio=w/h;
  if(ratio>.55&&ratio<1.45)score+=5;
  return score;
}
function candidateScore(c,member){
  const ctx=contextScore(`${c.title||''} ${c.snippet||''} ${c.siteName||''}`,member);
  return ctx+sourceHostScore(c.pageUrl||c.imageUrl)+dimensionScore(c.width,c.height)+(c.verifiedContext?22:0);
}
function findImageNearIdentity(html,member,base){
  const name=String(member.name||'').trim();if(!name)return null;
  let from=0,best=null;
  while(true){
    const idx=html.indexOf(name,from);if(idx<0)break;from=idx+name.length;
    const left=Math.max(0,idx-4500),right=Math.min(html.length,idx+2500),chunk=html.slice(left,right),plain=cleanText(chunk);
    if(contextScore(plain,member)<18)continue;
    const namePos=idx-left,cands=imageCandidates(chunk,base);
    for(const c of cands){const dist=Math.abs(c.pos-namePos);if(!best||dist<best.dist)best={url:c.url,dist};}
  }
  return best?.url||null;
}
async function fetchText(url,timeout=6500){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{signal:ctl.signal,redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7'}});
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return await r.text();
  }finally{clearTimeout(timer);}
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

function parseBingCandidates(html,query){
  const out=[];
  const re=/<a\b[^>]*class=["'][^"']*\biusc\b[^"']*["'][^>]*\bm=["']([^"']+)["'][^>]*>/gi;
  let m;
  while((m=re.exec(html))){
    try{
      const meta=JSON.parse(htmlDecode(m[1]));
      const imageUrl=meta.murl||meta.imgurl||'';
      const pageUrl=meta.purl||meta.surl||'';
      if(!isHttpUrl(imageUrl)||BAD_IMAGE_WORDS.test(imageUrl))continue;
      out.push({imageUrl,pageUrl,title:cleanText(meta.t||meta.desc||''),snippet:cleanText(meta.desc||''),width:Number(meta.w||meta.width||0),height:Number(meta.h||meta.height||0),query,provider:'bing-image'});
    }catch(_){}
  }
  // Bing occasionally emits JSON metadata in div attributes rather than anchors.
  if(!out.length){
    const any=/\bm=["'](\{[^"']*(?:&quot;|\\")[^"']*\})["']/gi;
    while((m=any.exec(html))){
      try{
        const meta=JSON.parse(htmlDecode(m[1]));
        const imageUrl=meta.murl||'';if(!isHttpUrl(imageUrl)||BAD_IMAGE_WORDS.test(imageUrl))continue;
        out.push({imageUrl,pageUrl:meta.purl||'',title:cleanText(meta.t||''),snippet:cleanText(meta.desc||''),width:Number(meta.w||0),height:Number(meta.h||0),query,provider:'bing-image'});
      }catch(_){}
    }
  }
  return out;
}
async function bingImageSearch(member){
  const qs=searchQueries(member).slice(0,3);
  const chunks=await Promise.all(qs.map(async query=>{
    const url=`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC3&first=1&tsc=ImageBasicHover`;
    try{const html=await fetchText(url,6500);return parseBingCandidates(html,query).slice(0,28);}catch(_){return [];}
  }));
  return chunks.flat();
}
async function kakaoImageSearch(member){
  const key=process.env.KAKAO_REST_API_KEY;if(!key)return [];
  const qs=searchQueries(member).slice(0,3);
  const chunks=await Promise.all(qs.map(async query=>{
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6000);
    try{
      const u=`https://dapi.kakao.com/v2/search/image?query=${encodeURIComponent(query)}&size=50`;
      const r=await fetch(u,{signal:ctl.signal,headers:{Authorization:`KakaoAK ${key}`}});if(!r.ok)return [];
      const j=await r.json();return (j.documents||[]).filter(d=>isHttpUrl(d.image_url)&&!BAD_IMAGE_WORDS.test(d.image_url)).map(d=>({imageUrl:d.image_url,pageUrl:d.doc_url||'',title:cleanText(d.display_sitename||''),snippet:cleanText(`${d.collection||''} ${d.display_sitename||''}`),siteName:d.display_sitename||'',width:Number(d.width||0),height:Number(d.height||0),query,provider:'kakao-image'}));
    }catch(_){return [];}finally{clearTimeout(timer);}
  }));
  return chunks.flat();
}
async function verifyCandidateContext(c,member){
  if(contextScore(`${c.title||''} ${c.snippet||''}`,member)>=34)return {...c,verifiedContext:true};
  if(!isHttpUrl(c.pageUrl))return c;
  try{
    const html=await fetchText(c.pageUrl,5000);
    const txt=cleanText(html).slice(0,220000);
    if(contextScore(txt,member)>=34)return {...c,verifiedContext:true};
  }catch(_){}
  return c;
}
function parseImageSize(buf,contentType=''){
  try{
    if(buf.length>=24&&buf.slice(1,4).toString('ascii')==='PNG')return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
    if(buf.length>=12&&buf.slice(0,4).toString('ascii')==='RIFF'&&buf.slice(8,12).toString('ascii')==='WEBP'){
      const kind=buf.slice(12,16).toString('ascii');
      if(kind==='VP8X'&&buf.length>=30)return {width:1+buf.readUIntLE(24,3),height:1+buf.readUIntLE(27,3)};
    }
    if(buf.length>=4&&buf[0]===0xff&&buf[1]===0xd8){
      let i=2;
      while(i+9<buf.length){
        if(buf[i]!==0xff){i++;continue;}
        const marker=buf[i+1];i+=2;
        if(marker===0xd8||marker===0xd9)continue;
        if(i+2>buf.length)break;const len=buf.readUInt16BE(i);if(len<2||i+len>buf.length)break;
        if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {height:buf.readUInt16BE(i+3),width:buf.readUInt16BE(i+5)};
        i+=len;
      }
    }
  }catch(_){}
  return null;
}
async function probeImage(c){
  if(Number(c.width)>=500&&Number(c.height)>=500)return c;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6000);
  try{
    const r=await fetch(c.imageUrl,{signal:ctl.signal,redirect:'follow',headers:{'User-Agent':'Mozilla/5.0','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8','Range':'bytes=0-131071',...(c.pageUrl?{'Referer':c.pageUrl}:{})}});
    if(!r.ok||!String(r.headers.get('content-type')||'').startsWith('image/'))return c;
    const b=Buffer.from(await r.arrayBuffer());
    const sz=parseImageSize(b,r.headers.get('content-type')||'');
    return sz?{...c,...sz}:c;
  }catch(_){return c;}finally{clearTimeout(timer);}
}
async function webSearchPhoto(member){
  const [kakao,bing]=await Promise.all([kakaoImageSearch(member),bingImageSearch(member)]);
  let candidates=[...kakao,...bing];
  const seen=new Set();
  candidates=candidates.filter(c=>{const k=String(c.imageUrl||'').replace(/^http:/,'https:');if(!k||seen.has(k))return false;seen.add(k);return true;});
  candidates.sort((a,b)=>candidateScore(b,member)-candidateScore(a,member));
  const checked=await Promise.all(candidates.slice(0,8).map(async c=>probeImage(await verifyCandidateContext(c,member))));
  let verified=checked.filter(c=>c.verifiedContext);
  if(!verified.length){
    verified=checked.filter(c=>contextScore(`${c.title||''} ${c.snippet||''}`,member)>=28&&sourceHostScore(c.pageUrl||c.imageUrl)>=16);
  }
  verified.sort((a,b)=>candidateScore(b,member)-candidateScore(a,member));
  const best=verified.find(c=>Number(c.width)>=500&&Number(c.height)>=500)||verified[0];
  if(!best)return null;
  return {url:best.imageUrl,profileUrl:best.pageUrl||null,source:`${best.provider} · 이름/직위/지역 교차검증`,width:Number(best.width)||null,height:Number(best.height)||null,query:best.query,verified:true};
}

function normMatch(v=''){return normalize(v).replace(/(특별자치도|특별시|광역시|특별자치시|도|시|군|구)/g,'');}
function assemblyRowScore(row,member){
  if(!row||String(row.name||'').trim()!==String(member?.name||'').trim())return -999;
  let score=40;
  const target=[member?.constituency,member?.jurisdiction,member?.region].filter(Boolean).map(normMatch).filter(Boolean);
  const hay=normMatch(`${row.constituency||''} ${row.party||''}`);
  for(const t of target){if(t&&hay.includes(t))score+=18;}
  if(row.officialPhoto)score+=20;
  return score;
}
async function assemblyOfficialPhoto(member){
  if(!member||member.entityType!=='assembly')return null;
  try{
    const master=await assemblyMaster();
    const rows=(master?.members||[]).filter(x=>String(x.name||'').trim()===String(member.name||'').trim());
    if(!rows.length)return null;
    const best=rows.map(row=>({row,score:assemblyRowScore(row,member)})).sort((a,b)=>b.score-a.score)[0]?.row;
    if(!best?.officialPhoto)return null;
    return {url:best.officialPhoto,profileUrl:'https://open.assembly.go.kr/',source:'대한민국 국회 · 열린국회정보 공식사진',verified:true,official:true};
  }catch(_){return null;}
}
async function probePhotoRecord(photo,timeout=6500){
  if(!photo?.url||!isHttpUrl(photo.url))return {ok:false,width:0,height:0,bytes:0,error:'NO_URL'};
  const baseHeaders={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','Accept':'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',...(photo.profileUrl?{'Referer':photo.profileUrl}:{})};
  const tries=[{...baseHeaders,'Range':'bytes=0-262143'},baseHeaders];
  let last={ok:false,width:0,height:0,bytes:0,error:'FETCH_FAILED'};
  for(const headers of tries){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const r=await fetch(photo.url,{signal:ctl.signal,redirect:'follow',headers});
      const ct=String(r.headers.get('content-type')||'');
      if(!r.ok||!ct.startsWith('image/')){last={ok:false,width:0,height:0,bytes:0,httpStatus:r.status,contentType:ct,error:`HTTP_${r.status}`};continue;}
      const b=Buffer.from(await r.arrayBuffer());
      if(b.length>9*1024*1024){last={ok:false,width:0,height:0,bytes:b.length,httpStatus:r.status,contentType:ct,error:'TOO_LARGE'};continue;}
      const sz=parseImageSize(b,ct)||{};
      return {ok:b.length>=1200,width:Number(sz.width||photo.width||0),height:Number(sz.height||photo.height||0),bytes:b.length,httpStatus:r.status,contentType:ct,error:b.length>=1200?null:'TOO_SMALL'};
    }catch(e){last={ok:false,width:0,height:0,bytes:0,error:e?.name==='AbortError'?'TIMEOUT':'FETCH_FAILED'};}
    finally{clearTimeout(timer);}
  }
  return last;
}

function cacheKey(member){return `jjdd:local-photo:resolved:${member.id}:${SEARCH_CACHE_VERSION}`;}
function negativeKey(member){return `jjdd:local-photo:negative:${member.id}:${SEARCH_CACHE_VERSION}`;}
async function invalidatePersonPhoto(id){
  const member=findEntity(id);if(!member)return;
  await Promise.all([del(cacheKey(member)).catch(()=>{}),del(negativeKey(member)).catch(()=>{})]);
}
async function resolvePersonPhoto(id,{force=false}={}){
  const member=findEntity(id);if(!member||Number(member.id)===300||String(member.party||'')==='공석')return null;
  const registered=(member.photoVerified===true&&member.officialPhoto)?{url:member.officialPhoto,profileUrl:member.officialProfileUrl||null,source:member.entityType==='assembly'?'등록된 국회 공식 프로필':'등록된 지방정부 공식 프로필',verified:true,official:true}:null;
  if(registered&&!force)return registered;
  const override=await getJSON(`jjdd:local-photo:override:${member.id}`).catch(()=>null);
  if(override?.url&&/^https?:\/\//i.test(override.url)&&!force)return {...override,verified:true,manual:true};
  if(!force){
    const cached=await getJSON(cacheKey(member)).catch(()=>null);if(cached?.url)return cached;
    const neg=await getJSON(negativeKey(member)).catch(()=>null);if(neg?.missing)return null;
  }

  const official=member.entityType==='assembly'?await assemblyOfficialPhoto(member).catch(()=>null):(registered||(override?.url?{...override,verified:true,manual:true}:null));
  // 일반 화면 진입에서는 국회 공식사진을 가장 먼저 사용해 불필요한 외부 검색을 막습니다.
  if(official?.url&&!force){
    const rec={...official,resolvedAt:new Date().toISOString(),searchVersion:SEARCH_CACHE_VERSION};
    await setJSON(cacheKey(member),rec,CACHE_TTL).catch(()=>{});await del(negativeKey(member)).catch(()=>{});return rec;
  }

  // 강제 재검수 또는 지방단체장 처리에서는 이름+직위+지역 검색 후보와 공식 후보를 함께 비교합니다.
  const [assoc,web]=await Promise.all([
    ['metro','local'].includes(member.entityType)?associationPhoto(member).catch(()=>null):Promise.resolve(null),
    webSearchPhoto(member).catch(()=>null)
  ]);
  let found=web||null,bestScore=web?candidateScore({imageUrl:web.url,pageUrl:web.profileUrl,title:`${member.name} ${member.office}`,snippet:web.source,width:web.width,height:web.height,verifiedContext:true},member):-999;
  if(assoc){
    const c=await probeImage({imageUrl:assoc.url,pageUrl:assoc.profileUrl,title:`${member.name} ${member.office} ${member.jurisdiction}`,snippet:assoc.source,provider:'official-association'});
    const score=candidateScore(c,member)+20;
    if(score>=bestScore&&Number(c.width)>=500&&Number(c.height)>=500){found={url:assoc.url,profileUrl:assoc.profileUrl,source:assoc.source,width:c.width||null,height:c.height||null,verified:true,official:true};bestScore=score;}
  }
  if(official){
    const c=await probeImage({imageUrl:official.url,pageUrl:official.profileUrl,title:`${member.name} 국회의원 ${member.constituency||member.region||''}`,snippet:official.source,provider:'assembly-official'});
    const score=candidateScore({...c,verifiedContext:true},member)+28;
    // 정상 공식사진은 우선하되 저해상도면 고해상도 검색 후보가 이길 수 있게 합니다.
    if(Number(c.width)>=500&&Number(c.height)>=500&&score>=bestScore){found={...official,width:c.width||null,height:c.height||null};bestScore=score;}
    else if(!found&&c?.imageUrl){found={...official,width:c.width||null,height:c.height||null};}
  }
  if(found?.url){
    const rec={...found,resolvedAt:new Date().toISOString(),searchVersion:SEARCH_CACHE_VERSION};
    await setJSON(cacheKey(member),rec,CACHE_TTL).catch(()=>{});await del(negativeKey(member)).catch(()=>{});return rec;
  }
  await setJSON(negativeKey(member),{missing:true,checkedAt:new Date().toISOString()},NEGATIVE_CACHE_TTL).catch(()=>{});
  return null;
}
const invalidateLocalPhoto=invalidatePersonPhoto;
const resolveLocalPhoto=resolvePersonPhoto;

module.exports={resolvePersonPhoto,invalidatePersonPhoto,resolveLocalPhoto,invalidateLocalPhoto,probePhotoRecord,assemblyOfficialPhoto,findImageNearIdentity,associationPhoto,webSearchPhoto,parseBingCandidates,parseImageSize,searchQueries,contextScore};
