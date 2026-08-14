const {requireAdmin}=require('../../lib/auth');
const {findEntity}=require('../../lib/political_roster');
const {getJSON,setJSON,del}=require('../../lib/store');
module.exports=async function(req,res){
  if(!requireAdmin(req,res))return;const id=Number(req.body?.id||req.query?.id||0),m=findEntity(id);if(!m||!['metro','local'].includes(m.entityType))return res.status(404).json({ok:false,error:'지방단체장을 찾을 수 없습니다.'});
  const key=`jjdd:local-photo:override:${id}`;
  if(req.method==='GET')return res.json({ok:true,member:{id:m.id,name:m.name,office:m.office},photo:await getJSON(key).catch(()=>null)});
  if(req.method==='DELETE'){await del(key);return res.json({ok:true,deleted:true});}
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const url=String(req.body?.url||'').trim(),profileUrl=String(req.body?.profileUrl||'').trim();if(!/^https:\/\//i.test(url))return res.status(400).json({ok:false,error:'공식 HTTPS 사진 URL을 입력해주세요.'});
  const rec={url,profileUrl:/^https:\/\//i.test(profileUrl)?profileUrl:null,source:String(req.body?.source||'관리자 검증 공식 출처').slice(0,100),verified:true,savedAt:new Date().toISOString()};await setJSON(key,rec);return res.json({ok:true,photo:rec});
};
