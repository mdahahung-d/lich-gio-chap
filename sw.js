/* =====================================================================
   SERVICE WORKER — Lịch Giỗ Chạp Gia Đình
   - Lưu sẵn "vỏ ứng dụng" để mở được khi mất mạng.
   - Trang chính: ưu tiên mạng (luôn lấy bản mới), mất mạng thì dùng bản đã lưu.
   - Tailwind CDN & Google Fonts: dùng bản đã lưu ngay, đồng thời cập nhật ngầm.
   Khi sửa index.html, TĂNG số phiên bản CACHE để người dùng nhận bản mới.
   ===================================================================== */
const CACHE = 'lich-gio-chap-v7';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
// Phải khớp đúng URL trong index.html
const TAILWIND_URL = 'https://cdn.tailwindcss.com/3.4.17';
const FONTS_CSS_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Serif:wght@400;600;700&display=swap';

/* Lưu sẵn giao diện (Tailwind) và phông chữ ngay khi cài (RISK01):
   trước đây CDN chỉ được lưu khi request đi qua service worker, nên người mở lần đầu rồi
   mất mạng có thể thấy trang không có CSS. Lỗi tải CDN không làm hỏng việc cài đặt. */
async function precacheCdn(cache) {
  try {
    const tw = await fetch(new Request(TAILWIND_URL, { mode: 'no-cors' }));
    await cache.put(TAILWIND_URL, tw);
  } catch (e) { /* bỏ qua khi đang mất mạng */ }
  try {
    const cssRes = await fetch(FONTS_CSS_URL, { mode: 'cors' });
    if (cssRes.ok) {
      const css = await cssRes.clone().text();
      await cache.put(FONTS_CSS_URL, cssRes);
      const fontUrls = [...new Set(css.match(/https:\/\/fonts\.gstatic\.com\/[^)'"\s]+/g) || [])];
      await Promise.all(fontUrls.map(u =>
        fetch(u, { mode: 'cors' }).then(r => r.ok ? cache.put(u, r) : null).catch(() => null)));
    }
  } catch (e) { /* bỏ qua */ }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL).then(() => precacheCdn(c)))
      .then(() => self.skipWaiting())
  );
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
