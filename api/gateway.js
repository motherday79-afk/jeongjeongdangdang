// NOW Rank v1.10.5 Hobby Gateway
// A single Vercel Function dispatches all API routes internally.
const routes = {
  'admin/login': require('./admin/login'),
  'admin/logout': require('./admin/logout'),
  'admin/status': require('./admin/status'),
  'admin/refresh': require('./admin/refresh'),
  'admin/publish': require('./admin/publish'),
  'admin/rollback': require('./admin/rollback'),
  'admin/name-pulse': require('./admin/name-pulse'),
  'admin/users': require('./admin/users'),
  'admin/password': require('./admin/password'),
  'admin/local-photo': require('./admin/local-photo'),
  'admin/photo-audit': require('./admin/photo-audit'),
  'admin/visitor-stats': require('./admin/visitor-stats'),
  'admin/content': require('./admin/content'),
  'admin/site-settings': require('./admin/site-settings'),
  'account/signup': require('./account/signup'),
  'account/login': require('./account/login'),
  'account/logout': require('./account/logout'),
  'account/me': require('./account/me'),
  'account/profile': require('./account/profile'),
  'account/watchlist': require('./account/watchlist'),
  'account/delete': require('./account/delete'),
  'site-settings': require('./site-settings'),
  'billing/checkout': require('./billing/checkout'),
  'stats/visit': require('./stats/visit'),
  'community': require('./community'),
  'news': require('./news'),
  'local-photo': require('./local-photo'),
  'person-photo': require('./person-photo'),
  'rank/current': require('./rank/current'),
  'rank/history': require('./rank/history'),
  'member-master': require('./member-master'),
  'track': require('./track'),
  'name-pulse-test': require('./name-pulse-test')
};

function cleanPath(v){
  return String(v || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.js$/i, '');
}

module.exports = async function gateway(req, res){
  // Vercel rewrite passes the requested API path in __path.
  let key = cleanPath(req.query?.__path);
  if(!key){
    try{
      const u = new URL(req.url, 'https://local.invalid');
      key = cleanPath(u.pathname.replace(/^\/api\/?/, ''));
    }catch(e){}
  }
  if(key === 'gateway') key = '';
  const handler = routes[key];
  if(!handler){
    return res.status(404).json({ok:false,error:'API route not found',route:key||null});
  }
  // Do not expose internal routing marker to endpoint handlers.
  if(req.query && Object.prototype.hasOwnProperty.call(req.query,'__path')) delete req.query.__path;
  try{
    return await handler(req,res);
  }catch(e){
    console.error('gateway route error', key, e);
    if(res.headersSent) return;
    return res.status(500).json({ok:false,error:e?.message||String(e),route:key});
  }
};
