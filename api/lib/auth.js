const crypto = require('crypto');

function parseCookies(req){
  const raw=req.headers?.cookie||'';
  return Object.fromEntries(raw.split(';').map(x=>x.trim()).filter(Boolean).map(x=>{
    const i=x.indexOf('='); return [decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))];
  }));
}
function b64url(input){ return Buffer.from(input).toString('base64url'); }
function sign(payload){
  const secret=process.env.ADMIN_SESSION_SECRET;
  if(!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const body=b64url(JSON.stringify(payload));
  const sig=crypto.createHmac('sha256',secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verify(token){
  try{
    if(!token) return null;
    const [body,sig]=token.split('.');
    const secret=process.env.ADMIN_SESSION_SECRET;
    if(!body||!sig||!secret) return null;
    const expected=crypto.createHmac('sha256',secret).update(body).digest('base64url');
    if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))) return null;
    const payload=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
    if(!payload.exp || Date.now()>payload.exp) return null;
    return payload;
  }catch(e){ return null; }
}
function getSession(req){ return verify(parseCookies(req).jjdd_admin); }
function requireAdmin(req,res){
  const s=getSession(req);
  if(!s){ res.status(401).json({ok:false,error:'관리자 로그인이 필요합니다.'}); return null; }
  return s;
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a??'')); const bb=Buffer.from(String(b??''));
  if(aa.length!==bb.length) return false;
  return crypto.timingSafeEqual(aa,bb);
}
function loginAllowed(id,password){
  const expectedId=process.env.ADMIN_ID||'admin';
  const expectedPw=process.env.ADMIN_PASSWORD;
  if(!expectedPw) throw new Error('ADMIN_PASSWORD is not configured');
  return safeEqual(id,expectedId) && safeEqual(password,expectedPw);
}
function sessionCookie(id){
  const token=sign({id,exp:Date.now()+12*60*60*1000});
  return `jjdd_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}
function clearCookie(){ return 'jjdd_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'; }

module.exports={getSession,requireAdmin,loginAllowed,sessionCookie,clearCookie};
