// Nexus Service Worker — network-first, sem cache offline
// Necessário para o prompt de instalação PWA funcionar nos navegadores.

const VERSION = "nexus-v1";

self.addEventListener("install",  () => self.skipWaiting());
self.addEventListener("activate", e  => e.waitUntil(clients.claim()));

self.addEventListener("fetch", e => {
  // Deixa o Firebase SDK (IndexedDB, WebSocket) e outros requests passarem normalmente.
  // Não interceptamos nada — o app requer conexão com o Firebase.
  if(e.request.method !== "GET") return;
  e.respondWith(fetch(e.request));
});
