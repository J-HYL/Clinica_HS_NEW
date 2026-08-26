// sw.js — Service Worker de HS Dental.
//
// Existe para que el navegador ofrezca instalar la app: Chrome solo lanza el
// prompt de instalacion si hay un service worker con manejador de fetch.
//
// Es deliberadamente minimo. NO cachea:
//   - /api/ ni /uploads/  -> llevan datos de pacientes; no deben quedar en el
//     disco del movil (la API ya responde con Cache-Control: no-store, private).
//   - JS/CSS/HTML del panel -> el despliegue es por SFTP sin versionar assets,
//     asi que una copia en cache serviria codigo viejo tras cada deploy.
// Lo unico que se guarda es la pantalla de "sin conexion" y su icono.

const CACHE = 'hsdental-shell-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/assets/favicon/web-app-manifest-192x192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // Uno a uno: si un fichero fallase, el SW se instala igual.
        await Promise.all(PRECACHE.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        ));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;

    // Solo se tocan las navegaciones (abrir una pagina). Todo lo demas —las
    // llamadas a /api/DB.php, las fotos de /uploads/, el JS y el CSS— sale por
    // aqui y va a la red sin pasar por cache.
    //
    // Filtrar por modo y no por ruta es intencionado: las paginas de entrada
    // (api/index.php, api/login.php) viven dentro de /api/, asi que excluir esa
    // carpeta entera dejaria sin respaldo justo a la pantalla de acceso.
    // Los datos de pacientes siguen a salvo porque aqui NUNCA se escribe en
    // cache: lo unico que se guarda es PRECACHE, en el evento install.
    if (req.method !== 'GET' || req.mode !== 'navigate') return;
    if (new URL(req.url).origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            return await fetch(req);
        } catch {
            const cached = await caches.match(OFFLINE_URL);
            return cached || new Response('Sin conexion', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' }
            });
        }
    })());
});
