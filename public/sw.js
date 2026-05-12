// v3.5.0-rc1 — Service Worker minimal OpenQuittance.
//
// Permet l'install PWA + activation immédiate. Pas de cache offline v1
// (les utilisateurs accèdent en ligne ; offline = nice-to-have v2 via
// serwist si demande).
//
// Le fetch handler est un passthrough explicite : sans handler, Chrome
// refuse parfois d'installer la PWA (heuristique "ne sert pas le
// network").

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Passthrough — laisse le browser fetch normalement.
});
