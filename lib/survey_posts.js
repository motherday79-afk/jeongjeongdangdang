const {getJSON,setJSON,cmd}=require('./store');

const ARCHIVE_KEY='jjdd:survey:archive-posts:v1';
const COMMENT_PREFIX='jjdd:survey:comments:v1:';

const DEFAULT_ARCHIVES=[
  {
    id:'survey_archive_economy_v1',status:'ENDED',
    title:'민생경제 정책에서 가장 먼저 체감돼야 할 분야는?',
    subtitle:'생활비와 주거·일자리 부담 가운데 시민이 가장 먼저 변화를 기대하는 분야를 묻습니다.',
    options:['물가·생활비','주거비·대출','일자리·소득','소상공인 지원'],
    counts:[462,391,284,173],createdAt:'2026-08-12T03:00:00.000Z',endedAt:'2026-08-16T12:00:00.000Z',schemaVersion:1
  },
  {
    id:'survey_archive_local_v1',status:'ENDED',
    title:'지역정치에서 가장 중요하게 보는 기준은 무엇인가요?',
    subtitle:'지역 현안을 판단할 때 시민이 우선하는 기준을 확인한 정참시 설문입니다.',
    options:['공약 실행력','지역경제 성과','소통·현장성','도덕성·투명성'],
    counts:[318,246,221,197],createdAt:'2026-08-08T03:00:00.000Z',endedAt:'2026-08-11T12:00:00.000Z',schemaVersion:1
  },
  {
    id:'survey_archive_compare_v1',status:'ENDED',
    title:'정치인을 비교할 때 가장 먼저 확인하는 정보는?',
    subtitle:'정치인 비교분석에서 어떤 정보가 첫 판단에 영향을 주는지 묻습니다.',
    options:['정책·공약','현재 이슈·관심도','의정·행정 경력','8 AXIS 데이터'],
    counts:[355,289,203,176],createdAt:'2026-08-03T03:00:00.000Z',endedAt:'2026-08-07T12:00:00.000Z',schemaVersion:1
  }
];

function clean(v,max=1200){return String(v??'').replace(/\u0000/g,'').trim().slice(0,max);}
function cleanOptions(v){return (Array.isArray(v)?v:[]).slice(0,5).map(x=>clean(x,80)).filter(Boolean);}
function cleanCounts(v,n){return Array.from({length:n},(_,i)=>Math.max(0,Math.round(Number(Array.isArray(v)?v[i]:0)||0)));}

async function getArchivePosts(){
  const stored=await getJSON(ARCHIVE_KEY).catch(()=>null);
  const map=stored&&typeof stored==='object'&&!Array.isArray(stored)?stored:{};
  return DEFAULT_ARCHIVES.map(seed=>{
    const row={...seed,...(map[seed.id]||{})};
    row.options=cleanOptions(row.options);
    row.counts=cleanCounts(row.counts,row.options.length);
    row.status=String(row.status||'ENDED')==='ACTIVE'?'ACTIVE':'ENDED';
    return row;
  }).filter(x=>x.hidden!==true);
}

async function updateArchivePost(id,input,admin){
  const all=await getArchivePosts();
  const current=all.find(x=>String(x.id)===String(id));
  if(!current)throw new Error('설문을 찾을 수 없습니다.');
  const title=clean(input?.title,100),subtitle=clean(input?.subtitle,500),options=cleanOptions(input?.options);
  if(title.length<2)throw new Error('설문 제목을 2자 이상 입력해주세요.');
  if(options.length<2)throw new Error('설문 선택지는 2개 이상 입력해주세요.');
  const counts=cleanCounts(input?.counts??current.counts,options.length);
  const stored=(await getJSON(ARCHIVE_KEY).catch(()=>null))||{};
  stored[id]={...current,title,subtitle,options,counts,status:String(input?.status||current.status)==='ACTIVE'?'ACTIVE':'ENDED',updatedAt:new Date().toISOString(),updatedBy:String(admin?.id||'admin'),schemaVersion:1};
  await setJSON(ARCHIVE_KEY,stored);
  return stored[id];
}

function commentKey(id){return COMMENT_PREFIX+String(id||'');}
async function listComments(id,limit=120){
  const rows=await cmd(['LRANGE',commentKey(id),'0',String(Math.max(0,Math.min(299,Number(limit||120)-1)))]).catch(()=>[]),out=[];
  for(const raw of (rows||[])){try{out.push(JSON.parse(String(raw)));}catch(_){}}
  return out;
}
async function commentCount(id){return Math.max(0,Number(await cmd(['LLEN',commentKey(id)]).catch(()=>0)||0));}
async function addComment(id,user,content){
  const text=clean(content,1400);if(!text)throw new Error('댓글 내용을 입력해주세요.');
  const row={id:`sc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`,surveyId:String(id),author:String(user?.nickname||user?.username||'회원').slice(0,30),authorId:user?.id||null,role:user?.role||'FREE',content:text,createdAt:new Date().toISOString()};
  await cmd(['LPUSH',commentKey(id),JSON.stringify(row)]);await cmd(['LTRIM',commentKey(id),'0','299']);
  return row;
}
async function deleteComment(id,commentId){
  const key=commentKey(id),rows=await cmd(['LRANGE',key,'0','299']).catch(()=>[]);
  for(const raw of (rows||[])){try{const row=JSON.parse(String(raw));if(String(row.id)===String(commentId)){await cmd(['LREM',key,'1',String(raw)]);return true;}}catch(_){}}
  return false;
}

module.exports={DEFAULT_ARCHIVES,getArchivePosts,updateArchivePost,listComments,commentCount,addComment,deleteComment};
