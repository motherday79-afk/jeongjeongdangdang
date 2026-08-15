const {requireAdmin}=require('../../lib/auth');
const {findEntity}=require('../../lib/political_roster');
const {getJSON,setJSON,del}=require('../../lib/store');
const {invalidatePersonPhoto,probePhotoRecord}=require('../../lib/local_photo');
const {recheckMember}=require('../../lib/photo_audit');

function key(id){return `jjdd:local-photo:override:${id}`;}
module.exports=async function(req,res){
  if(!requireAdmin(req,res))return;
  const id=Number(req.body?.id||req.query?.id||0),m=findEntity(id);
  if(!m||Number(m.id)===300||String(m.party||'')==='공석')return res.status(404).json({ok:false,error:'정치인을 찾을 수 없습니다.'});
  if(req.method==='GET'){
    const override=await getJSON(key(id)).catch(()=>null);
    return res.json({ok:true,member:{id:m.id,name:m.name,party:m.party,entityType:m.entityType,office:m.office,jurisdiction:m.jurisdiction||m.constituency||m.region||''},photo:override});
  }
  if(req.method==='DELETE'){
    await del(key(id)).catch(()=>{});await invalidatePersonPhoto(id);
    const audit=await recheckMember(m).catch(()=>null);
    return res.json({ok:true,deleted:true,audit});
  }
  if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const url=String(req.body?.url||'').trim(),profileUrl=String(req.body?.profileUrl||'').trim();
  if(!/^https:\/\//i.test(url))return res.status(400).json({ok:false,error:'HTTPS 사진 URL을 입력해주세요.'});
  const rec={url,profileUrl:/^https:\/\//i.test(profileUrl)?profileUrl:null,source:String(req.body?.source||'관리자 직접 검증 사진').trim().slice(0,120)||'관리자 직접 검증 사진',verified:true,manual:true,savedAt:new Date().toISOString()};
  const probe=await probePhotoRecord(rec,8500).catch(()=>({ok:false,error:'FETCH_FAILED'}));
  if(!probe?.ok)return res.status(400).json({ok:false,error:`사진 URL을 서버에서 불러올 수 없습니다.${probe?.httpStatus?` HTTP ${probe.httpStatus}`:''}`,probe});
  rec.width=Number(probe.width||0)||null;rec.height=Number(probe.height||0)||null;
  await setJSON(key(id),rec);await invalidatePersonPhoto(id);
  const audit=await recheckMember(m).catch(()=>null);
  return res.json({ok:true,photo:rec,probe,audit});
};
