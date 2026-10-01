/** Static inventory of live server.js routes; does not start server or access databases. */
import fs from 'node:fs';
const sources=[['server.js',''],['server/routes/authApi.js','/api/auth'],['server/routes/staffApi.js','/api/staff'],['server/routes/dbApi.js','/api/db'],['server/routes/reportsApi.js','/api/reports'],['server/routes/supplyApi.js','/api/supply'],['server/routes/privateMediaApi.js','private'],['server/routes/privateStorageApi.js','/api/private-storage']];
const rows=[];
for(const [file,prefix]of sources){
 const text=fs.readFileSync(file,'utf8');
 for(const match of text.matchAll(/\b(?:app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g)){
  const method=match[1].toUpperCase(),local=match[2];let route=(prefix==='private'?(local==='/:name'?'/api/media':'/api/upload'):prefix)+local;
  let auth='Yes',roles='admin',ownership='Admin-only; no caller ownership grant',risk='Cross-role read/write',status='Fixed';
  if(route==='/status'){auth='No';roles='Public health';ownership='No private data';risk='Low';status='Minimal public response';}
  else if(route.endsWith('/login')){auth='No';roles='Credential-verified login';ownership='Server account lookup';risk='Brute force / account enumeration';status='Generic failure + 15/min + 16KB JSON';}
  else if(route.endsWith('/session')){roles='admin/usta/asisten';ownership='Verified UID + current account + session version';risk='Stale/disabled session';}
  else if(route.startsWith('/api/staff')){roles=method==='GET'?'admin/usta/asisten':'admin';ownership=method==='GET'?'Admin all; usta own; asisten own + sanitized worker directory':'Admin; allowlisted data and private credentials';risk='Credential exposure / account takeover';}
  else if(route==='/api/workers'){roles='None';ownership='Use protected staff API';status='Denied (obsolete in-memory account route)';risk='Raw account disclosure';}
  else if(route.startsWith('/api/geo')){roles='admin/usta/asisten';ownership='Only caller-requested coordinates/IP; no records';risk='External proxy abuse';status='Authenticated + 60/min';}
  else if(route.startsWith('/api/master')){roles='admin/usta';ownership='Signed actor; submitted other owner IDs denied';risk='Forged worker activity';}
  else if(route.startsWith('/api/telegram/') && !/monthly-report|daily-attendance-report/.test(route)){roles='admin/usta/asisten';ownership='Signed actor; project assignment where required; scoped event namespace';risk='IDOR / forged event / SSRF';status='Fixed + 60/min; no external media fetch';}
  else if(route.startsWith('/api/media')){roles='admin/usta/asisten';ownership='Metadata owner + project access; admin legacy read';risk='Predictable private URL';status='Bearer download + private no-store + nosniff';}
  else if(route.startsWith('/api/private-storage')){roles='admin/usta/asisten';ownership='Verified owner + assigned project; admin all';risk='Public token URL / cross-user media';status='Authenticated server-only blob, no token URL';}
  else if(route.startsWith('/api/upload')){roles='admin/usta/asisten';ownership=route.endsWith('stage-video')?'Signed owner + assigned project; server metadata':'Signed actor; no persistent file';risk='Executable / oversize / forged owner';status='Authenticated + 20/min + MIME/signature/size';}
  else if(route.startsWith('/api/supply')){
   const adminOnly=/catalog\/admin|reload|products/.test(route);roles=adminOnly?'admin':'admin/asisten';ownership=/history|save/.test(route)?'Asisten own createdByUid only; admin all':'Role-scoped catalog/calculation';risk='Open history CRUD / forged creator / credential-header bypass';status='Fixed; no legacy secret/password headers';
  }
  else if(route.startsWith('/api/db')){status=/workers|sync-all/.test(route)?'Denied for raw accounts/sync':'Admin-only; raw worker/user/assistant/credential collections blocked';risk='Unrestricted generic CRUD/import';}
  rows.push({method,path:route,auth,roles,ownership,risk,status,file});
  if(prefix==='/api/auth')rows.push({...rows.at(-1),path:'/api'+local});
 }
}
rows.push({method:'GET/HEAD',path:'/api/telegram-export/*',auth:'Yes',roles:'admin',ownership:'Admin export access only',risk:'Public private export',status:'Fixed; no-store; dotfiles denied',file:'server.js'});
rows.sort((a,b)=>a.path.localeCompare(b.path)||a.method.localeCompare(b.method));
const header='# Live API authorization matrix вЂ” Stage 4\n\nGenerated from live route declarations. All `/api` requests except the two login URLs require a verified Firebase bearer before large body parsing. Role/record gates are additional. `/api/supply/compat/*` is normalized before authorization and has the same policy as its `/api/*` target. GET routes also cover implicit HEAD. CORS preflight grants no data permission.\n\n| Method | Path | Auth required | Allowed roles | Ownership check | Risk | Fix status |\n| --- | --- | --- | --- | --- | --- | --- |\n';
const table=rows.map(row=>`| ${row.method} | ${row.path} | ${row.auth} | ${row.roles} | ${row.ownership} | ${row.risk} | ${row.status} |`).join('\n');
const extra='\n\nNo live Telegram webhook is exposed: inbound processing uses server polling. Cron/reminder functions are invoked internally, not through a public general CRUD webhook. `/api/master/mark-login` is a browser-used own-user operation, not an unauthenticated internal endpoint.\n\nDormant Express/Mongo stack (`server/index.js`, `server/app.js`, `server/routes/index.js`, `telegramWork.js`, `upload.js`) is not imported/mounted by live `server.js`. Its legacy login/CRUD routes were inventoried as inactive, not authorized production alternatives; do not start that stack without a separate security migration. SPA static assets contain no private business export.\n';
fs.writeFileSync('docs/API_AUTHORIZATION_MATRIX.md',header+table+extra);
console.log(`Audited ${rows.length} live endpoint patterns; no server/database started.`);
