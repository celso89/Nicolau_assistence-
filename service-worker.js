// Network-first: com Internet carrega sempre a versão mais recente; sem Internet usa a cópia guardada.
const CACHE_NAME='nicolau-assistance-shell-v3';
const APP_SHELL=['./','./index.html','./styles.css','./config.js','./app.js','./pwa.js','./manifest.webmanifest','./assets/logo.png','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  const cdn=url.hostname==='cdn.jsdelivr.net'||url.hostname==='unpkg.com';
  if(url.origin!==self.location.origin&&!cdn)return; // Supabase (API) nunca passa pela cache
  e.respondWith(fetch(req).then(res=>{
    if(res&&(res.ok||res.type==='opaque')){const copy=res.clone();caches.open(CACHE_NAME).then(c=>c.put(req.mode==='navigate'?'./index.html':req,copy))}
    return res;
  }).catch(()=>caches.match(req).then(r=>r||(req.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
