const CACHE = "bmi-v3";
const SHELL = ["./", "index.html", "css/style.css", "js/i18n.js", "js/app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // ฟอนต์ Google: cache-first (ใช้ออฟไลน์ได้หลังโหลดครั้งแรก)
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // ไฟล์ของแอป: network-first แล้วค่อย fallback เป็นแคช
  // ตัด query string ออกจาก key เพื่อไม่ให้ลิงก์แชร์ (?h=..&w=..) สร้างแคชแยกทุกอัน
  if (url.origin === location.origin) {
    const key = new Request(url.origin + url.pathname);
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key).then((hit) => hit || caches.match("index.html")))
    );
  }
});
