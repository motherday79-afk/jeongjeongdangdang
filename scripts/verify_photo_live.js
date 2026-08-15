#!/usr/bin/env node
// Usage: JJDD_BASE_URL=https://your-production.example node scripts/verify_photo_live.js
// 실제 배포 서버의 562명 사진 프록시를 전원 호출합니다. 1명이라도 실패하면 exit code 1.
const {photoRoster}=require('../lib/political_roster');
const base=String(process.env.JJDD_BASE_URL||process.argv[2]||'').replace(/\/$/,'');
if(!/^https?:\/\//i.test(base)){console.error('JJDD_BASE_URL 또는 첫 번째 인자로 배포 URL을 입력하세요.');process.exit(2);}
const roster=photoRoster();
const concurrency=Math.max(1,Math.min(4,Number(process.env.PHOTO_CHECK_CONCURRENCY||2)));
const results=new Array(roster.length);let next=0;
async function one(i){
  const m=roster[i],url=`${base}/api/person-photo?id=${encodeURIComponent(m.id)}&v=8&livecheck=${Date.now()}-${i}`;
  const started=Date.now();let status=0,ct='',bytes=0,error=null;
  try{
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
    try{
      const r=await fetch(url,{signal:ctl.signal,headers:{'Accept':'image/*,*/*;q=0.8','Cache-Control':'no-cache'}});
      status=r.status;ct=String(r.headers.get('content-type')||'');
      const buf=Buffer.from(await r.arrayBuffer());bytes=buf.length;
      if(status!==200)error=`HTTP_${status}`;
      else if(!ct.startsWith('image/'))error=`NOT_IMAGE:${ct}`;
      else if(bytes<2500)error=`TOO_SMALL:${bytes}`;
    }finally{clearTimeout(timer);}
  }catch(e){error=e?.name==='AbortError'?'TIMEOUT':String(e?.message||e);}
  results[i]={id:m.id,name:m.name,entityType:m.entityType,status,contentType:ct,bytes,error,elapsedMs:Date.now()-started};
  const mark=error?'FAIL':'OK';console.log(`${i+1}/${roster.length} ${mark} ${m.id} ${m.name}${error?' '+error:''}`);
}
async function worker(){while(true){const i=next++;if(i>=roster.length)return;await one(i);}}
(async()=>{
  await Promise.all(Array.from({length:concurrency},worker));
  const failed=results.filter(x=>x.error),ok=results.length-failed.length;
  const byType={};for(const r of results){byType[r.entityType]??={ok:0,failed:0};byType[r.entityType][r.error?'failed':'ok']++;}
  const report={checkedAt:new Date().toISOString(),base,total:results.length,ok,failed:failed.length,byType,failures:failed};
  console.log('\n'+JSON.stringify(report,null,2));
  if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
