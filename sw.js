/* =====================================================================
   SERVICE WORKER — Lịch Giỗ Chạp Gia Đình
   - Lưu sẵn "vỏ ứng dụng" để mở được khi mất mạng.
   - Trang chính: ưu tiên mạng (luôn lấy bản mới), mất mạng thì dùng bản đã lưu.
   - Tailwind CDN & Google Fonts: dùng bản đã lưu ngay, đồng thời cập nhật ngầm.
   Khi sửa index.html, TĂNG số phiên bản CACHE để người dùng nhận bản mới.
   ===================================================================== */
const CACHE = 'lich-gio-chap-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 1) Mở trang: mạng trước, mất mạng thì dùng bản lưu
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); return res; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 2) CDN giao diện/phông chữ: trả bản lưu ngay, cập nhật ngầm
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then(res => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 3) File cùng nguồn (icon, manifest…): bản lưu trước, không có thì tải
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }))
    );
  }
});

// Bấm vào thông báo nhắc giỗ → mở / chuyển tới ứng dụng
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./index.html');
    })
  );
});
