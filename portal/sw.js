// portal/sw.js — Service Worker del Portal de Pacientes.
//
// REGLA CRITICA: NUNCA se cachea /api/* (son datos del paciente: PII medica).
// El SW solo cachea el "shell" estatico (HTML/CSS/JS/iconos) para arranque
// rapido y uso offline de la interfaz; los datos siempre van a la red.
//
// Al publicar cambios en el shell, SUBE la version del cache (CACHE) para que
// los clientes reciban la nueva versión (el activate borra las anteriores).

const CACHE = "hsd-portal-v8";

const SHELL = [
  "/",
  "/index.html",
  "/login.html",
  "/activar.html",
  "/reset.html",
  "/manifest.webmanifest",
  "/css/portal.css",
  "/js/app.js",
  "/js/api.js",
  "/js/util.js",
  "/js/icons.js",
  "/js/install.js",
  "/js/auth-pages.js",
  "/js/views/inicio.js",
  "/js/views/tratamientos.js",
  "/js/views/citas.js",
  "/js/views/perfil.js",
  "/js/views/pedirCita.js",
  "/js/views/notificaciones.js",
  "/js/views/tratamientoDetalle.js",
  "/assets/icon.svg",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla si un solo recurso no existe; los iconos deben estar subidos.
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // solo mismo origen
  if (url.pathname.startsWith("/api/")) return;         // NUNCA cachear datos del paciente

  // Navegaciones (documentos): red primero, con respaldo a la cache si no hay red.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // Recursos estaticos (css/js/iconos): RED primero, para que los cambios de
  // codigo se vean al instante; la cache queda como respaldo offline.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
