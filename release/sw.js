/* Sonae のサービスワーカー。
   アプリ本体は index.html 1枚なので、それとアイコン・フォントを
   キャッシュしておけば、圏外でも起動できる。
   index.html を更新したら CACHE の数字を上げること。 */
const CACHE = 'sonae-v1';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys()
      .then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

/* 本体は network-first（更新をすぐ拾う）、それ以外は cache-first。
   Google Fonts は取れたらキャッシュし、圏外ではシステムフォントに落ちる。 */
self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');

  if(isDoc){
    e.respondWith(
      fetch(req)
        .then(res=>{
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put('./index.html', copy));
          return res;
        })
        .catch(()=>caches.match('./index.html').then(r=>r || caches.match('./')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit=>
      hit || fetch(req).then(res=>{
        if(res.ok && (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))){
          const copy = res.clone();
          caches.open(CACHE).then(c=>c.put(req, copy));
        }
        return res;
      }).catch(()=>hit)
    )
  );
});
