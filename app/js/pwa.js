// pwa.js — Registro del service worker + aviso para instalar la app.
//
// Va suelto (no es modulo ES) y se inyecta sus propios estilos a proposito:
// tiene que funcionar igual en las paginas de entrada (api/index.php,
// api/login.php), que son PHP autocontenidos sin el sistema de modulos ni el
// CSS del panel, y en el panel (index.html).
//
// Por que hace falta un boton propio y no basta el prompt nativo:
//   - iOS/Safari NUNCA lanza prompt de instalacion: solo existe Compartir >
//     "Anadir a pantalla de inicio". Sin este aviso, en iPhone no aparece nada.
//   - Chrome solo dispara beforeinstallprompt tras ~30s en el sitio y con
//     interaccion previa, asi que en el login rara vez salta por si solo.
(function () {
    'use strict';

    var CLAVE_OCULTO = 'hsdental_instalar_oculto';
    var promptDiferido = null;

    // --- Registro del service worker -------------------------------------
    // Sin SW, Chrome no ofrece instalar. Si falla, la app sigue funcionando.
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            navigator.serviceWorker.register('/sw.js').catch(function () {});
        });
    }

    function yaInstalada() {
        return window.matchMedia('(display-mode: standalone)').matches ||
            navigator.standalone === true;
    }

    function esIOS() {
        // iPadOS 13+ se identifica como Mac, se distingue por el tactil.
        return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    function ocultado() {
        try { return localStorage.getItem(CLAVE_OCULTO) === '1'; }
        catch (e) { return false; }
    }

    function ocultar() {
        try { localStorage.setItem(CLAVE_OCULTO, '1'); } catch (e) {}
        var aviso = document.getElementById('pwa-aviso');
        if (aviso) aviso.remove();
    }

    function inyectarEstilos() {
        if (document.getElementById('pwa-estilos')) return;
        var css = document.createElement('style');
        css.id = 'pwa-estilos';
        css.textContent = [
            '#pwa-aviso{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);',
            'z-index:9999;display:flex;align-items:center;gap:12px;width:calc(100% - 32px);',
            'max-width:400px;padding:12px 14px;background:#fff;border:1px solid #DCE0EA;',
            'border-radius:14px;box-shadow:0 8px 28px rgba(29,36,46,.16);',
            'font-family:"Figtree",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;',
            'animation:pwa-entra .25s ease-out}',
            '@keyframes pwa-entra{from{opacity:0;transform:translateX(-50%) translateY(8px)}',
            'to{opacity:1;transform:translateX(-50%) translateY(0)}}',
            '#pwa-aviso img{width:40px;height:40px;border-radius:9px;flex-shrink:0}',
            '#pwa-aviso .pwa-txt{flex:1;min-width:0}',
            '#pwa-aviso strong{display:block;font-size:.9rem;color:#1D242E;line-height:1.3}',
            '#pwa-aviso span{display:block;font-size:.78rem;color:#6D6D6D;line-height:1.3}',
            '#pwa-aviso .pwa-btn{font:inherit;font-size:.82rem;font-weight:600;color:#fff;',
            'background:#191fbe;border:0;border-radius:9px;padding:9px 14px;cursor:pointer;flex-shrink:0}',
            '#pwa-aviso .pwa-btn:hover{opacity:.9}',
            '#pwa-aviso .pwa-x{font:inherit;font-size:1.1rem;line-height:1;color:#9197B3;',
            'background:0;border:0;padding:4px;cursor:pointer;flex-shrink:0}',
            '#pwa-aviso .pwa-x:hover{color:#1D242E}',
            '#pwa-ios{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;',
            'justify-content:center;padding:24px;background:rgba(29,36,46,.5)}',
            '#pwa-ios .pwa-ios-caja{background:#fff;border-radius:16px;padding:24px;max-width:340px;',
            'width:100%;font-family:"Figtree",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;',
            'text-align:center}',
            '#pwa-ios h2{font-size:1.05rem;color:#1D242E;margin:0 0 10px}',
            '#pwa-ios ol{text-align:left;margin:0 0 18px;padding-left:20px;color:#6D6D6D;',
            'font-size:.88rem;line-height:1.7}',
            '#pwa-ios .pwa-btn{font:inherit;font-size:.85rem;font-weight:600;color:#fff;',
            'background:#191fbe;border:0;border-radius:9px;padding:10px 20px;cursor:pointer;width:100%}'
        ].join('');
        document.head.appendChild(css);
    }

    function instruccionesIOS() {
        inyectarEstilos();
        var capa = document.createElement('div');
        capa.id = 'pwa-ios';
        capa.innerHTML =
            '<div class="pwa-ios-caja">' +
                '<h2>Instalar HS Dental</h2>' +
                '<ol>' +
                    '<li>Pulsa el boton <strong>Compartir</strong> de Safari (el cuadrado con la flecha hacia arriba).</li>' +
                    '<li>Elige <strong>Anadir a pantalla de inicio</strong>.</li>' +
                    '<li>Pulsa <strong>Anadir</strong>.</li>' +
                '</ol>' +
                '<button type="button" class="pwa-btn">Entendido</button>' +
            '</div>';
        capa.addEventListener('click', function (e) {
            if (e.target === capa || e.target.classList.contains('pwa-btn')) capa.remove();
        });
        document.body.appendChild(capa);
    }

    function mostrarAviso(alInstalar) {
        if (document.getElementById('pwa-aviso')) return;
        inyectarEstilos();

        var aviso = document.createElement('div');
        aviso.id = 'pwa-aviso';
        aviso.innerHTML =
            '<img src="/assets/favicon/web-app-manifest-192x192.png" alt="">' +
            '<div class="pwa-txt">' +
                '<strong>Instalar HS Dental</strong>' +
                '<span>Accede como una app desde tu movil</span>' +
            '</div>' +
            '<button type="button" class="pwa-btn">Instalar</button>' +
            '<button type="button" class="pwa-x" aria-label="Cerrar">&times;</button>';

        aviso.querySelector('.pwa-btn').addEventListener('click', alInstalar);
        aviso.querySelector('.pwa-x').addEventListener('click', ocultar);
        document.body.appendChild(aviso);
    }

    if (yaInstalada() || ocultado()) return;

    // Android / escritorio: Chrome avisa cuando la app es instalable.
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();          // Evita el mini-infobar; lo lanzamos nosotros.
        promptDiferido = e;
        mostrarAviso(function () {
            if (!promptDiferido) return;
            promptDiferido.prompt();
            promptDiferido.userChoice.finally(function () {
                promptDiferido = null;
                ocultar();
            });
        });
    });

    window.addEventListener('appinstalled', ocultar);

    // iOS: no hay evento ni prompt, solo se puede explicar el proceso manual.
    if (esIOS()) {
        window.addEventListener('load', function () {
            mostrarAviso(instruccionesIOS);
        });
    }
})();
