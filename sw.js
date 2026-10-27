// 최우영고기야 후불 주문 — 서비스워커
// 앱을 열 때는 기기에 저장된 화면을 바로 띄워서 빠르게 실행하고,
// 동시에 뒤에서 새 버전을 확인합니다. 새 버전이 있으면 저장해 두고
// 앱에 알려서, 테이블 목록 화면에 있을 때 자동으로 새로고침됩니다.
const CACHE_NAME = 'gogiya-v53';
const URLS_TO_CACHE = ['./', './index.html', './manifest.json', './favicon.png', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => Promise.all(URLS_TO_CACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 새 버전 설치되면 옛 저장본 삭제 → 열려 있는 화면을 모두 새 버전으로 자동 새로고침
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    await self.clients.claim();
    const wins = await self.clients.matchAll({ type: 'window' });
    wins.forEach((w) => { try { w.navigate(w.url); } catch (e) {} });
  })());
});

async function notifyUpdated() {
  const list = await self.clients.matchAll({ type: 'window' });
  list.forEach((c) => c.postMessage('gogiya-updated'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase·번역·글꼴 등 외부 요청은 그대로
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {
    const key = new Request(url.origin + url.pathname); // ?table=N 주소도 같은 저장본 사용
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // 주문 앱(index)만 저장본으로 빠르게. 다른 페이지(practice.html 등)는 그 페이지 자체를 받아옴
      const isMain = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
      const cached = (await cache.match(key)) || (isMain ? await cache.match('./index.html') : null);
      const network = fetch(req, { cache: 'no-cache' }).then(async (res) => {
        if (res && res.ok) {
          const fresh = res.clone();
          const oldText = cached ? await cached.clone().text() : null;
          const newText = await fresh.clone().text();
          await cache.put(key, fresh);
          if (oldText !== null && oldText !== newText) notifyUpdated();
        }
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      return (await network) || new Response('오프라인입니다', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })());
  } else {
    event.respondWith(caches.match(req).then((r) => r || fetch(req)));
  }
});
