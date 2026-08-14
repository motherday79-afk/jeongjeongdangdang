const zlib=require('zlib');

const COMPRESSED_PREFIX='__JJDD_GZIP_B64_V1__:';
// Keep a generous margin under Upstash's 10 MiB single-request limit because
// the REST request also contains the Redis command/key JSON wrapper.
const COMPRESS_THRESHOLD_BYTES=1024*1024; // 1 MiB
const SAFE_REQUEST_VALUE_BYTES=8*1024*1024; // 8 MiB encoded value guard

function config(){
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
    process.env.STORAGE_KV_REST_API_URL ||
    process.env.UPSTASH_KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
    process.env.STORAGE_KV_REST_API_TOKEN ||
    process.env.UPSTASH_KV_REST_API_TOKEN;
  if(!url||!token) throw new Error('Persistent store is not configured. Redis URL/TOKEN environment variables were not found.');
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

function encodeJSON(value){
  const raw=JSON.stringify(value);
  const rawBytes=Buffer.byteLength(raw,'utf8');
  if(rawBytes<COMPRESS_THRESHOLD_BYTES)return raw;
  const gz=zlib.gzipSync(Buffer.from(raw,'utf8'),{level:6});
  const encoded=COMPRESSED_PREFIX+gz.toString('base64');
  const encodedBytes=Buffer.byteLength(encoded,'utf8');
  if(encodedBytes>SAFE_REQUEST_VALUE_BYTES){
    throw new Error(`Redis 저장 데이터가 압축 후에도 너무 큽니다. encoded=${encodedBytes} bytes. 스냅샷 분할 저장이 필요합니다.`);
  }
  return encoded;
}
function parseJSONValue(v){
  if(v==null)return null;
  if(typeof v!=='string')return typeof v==='object'?v:null;
  try{
    if(v.startsWith(COMPRESSED_PREFIX)){
      const b64=v.slice(COMPRESSED_PREFIX.length);
      const raw=zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
      return JSON.parse(raw);
    }
    return JSON.parse(v);
  }catch(_){return null;}
}
async function getJSON(key){
  const v=await cmd(['GET',key]);
  return parseJSONValue(v);
}
async function setJSON(key,value,ttlSec){
  const encoded=encodeJSON(value);
  if(ttlSec) return cmd(['SET',key,encoded,'EX',String(ttlSec)]);
  return cmd(['SET',key,encoded]);
}
async function del(key){ return cmd(['DEL',key]); }
async function lpush(key,value){ return cmd(['LPUSH',key,value]); }
async function ltrim(key,start,stop){ return cmd(['LTRIM',key,String(start),String(stop)]); }
async function lrange(key,start,stop){ return cmd(['LRANGE',key,String(start),String(stop)]); }

async function setNx(key,value,ttlSec){
  const args=['SET',key,String(value),'NX'];
  if(ttlSec) args.push('EX',String(ttlSec));
  const r=await cmd(args);
  return r==='OK';
}
async function hincrby(key,field,inc=1){ return cmd(['HINCRBY',key,field,String(inc)]); }
async function hgetall(key){ return cmd(['HGETALL',key]); }
async function expire(key,ttlSec){ return cmd(['EXPIRE',key,String(ttlSec)]); }

module.exports={config,cmd,getJSON,setJSON,parseJSONValue,encodeJSON,del,lpush,ltrim,lrange,setNx,hincrby,hgetall,expire};
