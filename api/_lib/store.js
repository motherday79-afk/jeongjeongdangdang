function config(){
  const url=process.env.UPSTASH_REDIS_REST_URL||process.env.KV_REST_API_URL;
  const token=process.env.UPSTASH_REDIS_REST_TOKEN||process.env.KV_REST_API_TOKEN;
  if(!url||!token) throw new Error('Persistent store is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  return {url:url.replace(/\/$/,''),token};
}
async function cmd(args){
  const {url,token}=config();
  const r=await fetch(url,{
    method:'POST',
    headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok || body.error) throw new Error(body.error||`Redis HTTP ${r.status}`);
  return body.result;
}
async function getJSON(key){
  const v=await cmd(['GET',key]);
  if(v==null) return null;
  try{return JSON.parse(v)}catch(e){return null}
}
async function setJSON(key,value,ttlSec){
  if(ttlSec) return cmd(['SET',key,JSON.stringify(value),'EX',String(ttlSec)]);
  return cmd(['SET',key,JSON.stringify(value)]);
}
async function del(key){ return cmd(['DEL',key]); }
async function lpush(key,value){ return cmd(['LPUSH',key,value]); }
async function ltrim(key,start,stop){ return cmd(['LTRIM',key,String(start),String(stop)]); }
async function lrange(key,start,stop){ return cmd(['LRANGE',key,String(start),String(stop)]); }

module.exports={config,cmd,getJSON,setJSON,del,lpush,ltrim,lrange};
