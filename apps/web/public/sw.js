/* sw.js —— 一只狡猾的狐狸 PWA Service Worker
 * 策略：
 *  - 静态资源（hash 文件名）：cache-first，仅缓存真实成功（2xx）的响应
 *  - /api/*：network-first，失败回退缓存
 *  - 导航请求：network-first，离线回退缓存的 index.html
 *
 * 重要：只缓存 res.ok 为真的响应。旧版会把 404/HTML 兜底页也写进缓存，
 * 导致「图片补上了但页面仍显示不出来」，只能清缓存恢复。
 */
const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest'];

function putIfOk(req, res) {
  // 只缓存同源、成功、非 opaque 的响应
  if (!res || !res.ok || res.type === 'opaque') return;
  const copy = res.clone();
  caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy)).catch(() => {});
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // API：网络优先，失败回缓存
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          putIfOk(req, res);
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (hit) =>
              hit ||
              new Response(JSON.stringify({ offline: true }), {
                headers: { 'Content-Type': 'application/json' },
                status: 503,
              })
          )
        )
    );
    return;
  }

  // 页面导航：网络优先，离线回壳
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // 带 hash 的构建产物 / 图片图标：缓存优先，只缓存成功的
  if (/\/assets\/|\/icons\/|\.png$|\.jpg$|\.svg$|\.webmanifest$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          putIfOk(req, res);
          return res;
        });
      })
    );
  }
});
