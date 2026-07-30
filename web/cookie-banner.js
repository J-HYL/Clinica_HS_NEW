/**
 * Cookie Banner - HSDental
 * Gestión de consentimiento de cookies conforme a LSSI-CE (Ley 34/2002) y RGPD,
 * siguiendo la guía de la AEPD:
 *   - No se instalan cookies no necesarias hasta que el usuario consiente
 *     (Google Maps queda bloqueado hasta la aceptación).
 *   - "Aceptar" y "Rechazar" tienen la misma facilidad y prominencia.
 *   - Configuración granular por categoría, sin casillas premarcadas.
 *   - El consentimiento se puede retirar/cambiar en cualquier momento
 *     (enlace "Configuración de cookies" en el footer).
 *   - El consentimiento caduca y se vuelve a solicitar pasado un tiempo.
 *
 * Las categorías reflejan lo declarado en pages/politica-cookies.html:
 *   necesarias (siempre activas) · analíticas (Google Analytics) · maps (Google Maps).
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'hsdental_cookie_consent';
    // Caducidad del consentimiento (la AEPD recomienda no superar 24 meses).
    var CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

    function emptyState() {
        return { accepted: false, analytics: false, maps: false, timestamp: null };
    }

    var consentState = emptyState();

    /* ---------------------------------------------------------------
       Persistencia
       --------------------------------------------------------------- */
    function getStoredConsent() {
        try {
            var saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    function isExpired(stored) {
        if (!stored || !stored.timestamp) return true;
        var when = new Date(stored.timestamp).getTime();
        if (isNaN(when)) return true;
        return (Date.now() - when) > CONSENT_MAX_AGE_MS;
    }

    function saveConsent() {
        consentState.timestamp = new Date().toISOString();
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(consentState));
        } catch (e) {
            /* Si localStorage no está disponible, el banner reaparecerá en la próxima visita. */
        }
    }

    /* ---------------------------------------------------------------
       Aplicar el estado de consentimiento al contenido bloqueado (Google Maps).
       Funciona en ambos sentidos: carga el mapa y oculta el placeholder si se
       consiente; descarga el mapa y muestra el placeholder si se retira.
       --------------------------------------------------------------- */
    function applyMapsState() {
        var iframes = document.querySelectorAll('iframe[data-cookieconsent="google-maps"]');
        var placeholders = document.querySelectorAll('[data-cookie-placeholder]');

        if (consentState.maps) {
            iframes.forEach(function (iframe) {
                var src = iframe.getAttribute('data-src');
                if (src && !iframe.getAttribute('src')) {
                    iframe.setAttribute('src', src);
                }
                iframe.hidden = false;
            });
            placeholders.forEach(function (ph) { ph.hidden = true; });
        } else {
            iframes.forEach(function (iframe) {
                iframe.removeAttribute('src');
                iframe.hidden = true;
            });
            placeholders.forEach(function (ph) { ph.hidden = false; });
        }
    }

    /* ---------------------------------------------------------------
       Banner
       --------------------------------------------------------------- */
    function hideBanner() {
        var banner = document.getElementById('cookie-banner');
        if (!banner) return;
        banner.classList.add('cookie-banner--hidden');
        setTimeout(function () { banner.style.display = 'none'; }, 300);
    }

    function showBanner() {
        var banner = document.getElementById('cookie-banner');
        if (!banner) return;
        banner.style.display = '';
        banner.classList.remove('cookie-banner--hidden');
    }

    function syncTogglesFromState() {
        var analyticsToggle = document.getElementById('analytics-toggle');
        var mapsToggle = document.getElementById('maps-toggle');
        if (analyticsToggle) analyticsToggle.checked = !!consentState.analytics;
        if (mapsToggle) mapsToggle.checked = !!consentState.maps;
    }

    function acceptAll() {
        consentState = { accepted: true, analytics: true, maps: true, timestamp: null };
        saveConsent();
        hideBanner();
        applyMapsState();
    }

    function rejectAll() {
        consentState = { accepted: true, analytics: false, maps: false, timestamp: null };
        saveConsent();
        hideBanner();
        applyMapsState();
    }

    function saveConfiguration() {
        var analyticsToggle = document.getElementById('analytics-toggle');
        var mapsToggle = document.getElementById('maps-toggle');
        consentState = {
            accepted: true,
            analytics: analyticsToggle ? analyticsToggle.checked : false,
            maps: mapsToggle ? mapsToggle.checked : false,
            timestamp: null
        };
        saveConsent();
        hideBanner();
        applyMapsState();
    }

    // Aceptar únicamente los mapas (botón del propio placeholder del mapa).
    function acceptMapsOnly() {
        consentState.accepted = true;
        consentState.maps = true;
        saveConsent();
        hideBanner();
        applyMapsState();
    }

    function showConfigPanel() {
        var panel = document.getElementById('cookie-config-panel');
        var content = document.querySelector('.cookie-banner__content');
        if (panel && content) {
            syncTogglesFromState();
            content.style.display = 'none';
            panel.hidden = false;
        }
    }

    function hideConfigPanel() {
        var panel = document.getElementById('cookie-config-panel');
        var content = document.querySelector('.cookie-banner__content');
        if (panel && content) {
            panel.hidden = true;
            content.style.display = 'block';
        }
    }

    // Reabre el banner para revisar/retirar el consentimiento (enlace del footer).
    function openSettings() {
        if (!document.getElementById('cookie-banner')) {
            addStyles();
            buildAndAttach();
        }
        showBanner();
        showConfigPanel();
    }

    /* ---------------------------------------------------------------
       Estilos (inyectados: el banner es autónomo)
       --------------------------------------------------------------- */
    function addStyles() {
        if (document.getElementById('cookie-banner-styles')) return;
        var styles = document.createElement('style');
        styles.id = 'cookie-banner-styles';
        styles.textContent = [
            '.cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;font-family:"Montserrat",sans-serif;pointer-events:none;}',
            '.cookie-banner__content,.cookie-banner__panel{position:relative;pointer-events:auto;background:#fff;margin:16px auto;padding:24px;border-radius:16px;box-shadow:0 24px 48px rgba(0,0,0,.2);max-width:560px;}',
            '.cookie-banner__content{animation:cookieSlideUp .4s cubic-bezier(.4,0,.2,1);}',
            '.cookie-banner__icon{width:64px;height:64px;background:linear-gradient(135deg,#5671eb 0%,#3f57cc 100%);border-radius:16px;display:grid;place-items:center;margin:0 auto 16px;color:#fff;}',
            '.cookie-banner__title{font-size:1.25rem;font-weight:700;color:#272626;text-align:center;margin-bottom:12px;}',
            '.cookie-banner__description{font-size:.95rem;color:#5a5a5a;line-height:1.6;text-align:center;margin-bottom:8px;}',
            '.cookie-banner__legal{font-size:.85rem;color:#949494;text-align:center;}',
            '.cookie-banner__link{color:#5671eb;font-weight:600;text-decoration:underline;}',
            '.cookie-banner__actions{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px;}',
            '.cookie-banner__config-row{margin-top:12px;text-align:center;}',
            '.cookie-banner__btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 20px;font-family:"Montserrat",sans-serif;font-size:.9rem;font-weight:600;border-radius:9999px;cursor:pointer;transition:all .28s ease;border:none;white-space:nowrap;}',
            '.cookie-banner__btn--primary{background:#5671eb;color:#fff;box-shadow:0 4px 18px rgba(86,113,235,.35);}',
            '.cookie-banner__btn--primary:hover{background:#3f57cc;transform:translateY(-2px);box-shadow:0 8px 28px rgba(86,113,235,.42);}',
            // "Rechazar" con el mismo peso visual que "Aceptar" (requisito AEPD de igualdad).
            '.cookie-banner__btn--reject{background:#eef1fc;color:#3f57cc;border:2px solid #c3d0f8;}',
            '.cookie-banner__btn--reject:hover{background:#dde4fb;border-color:#5671eb;transform:translateY(-2px);}',
            '.cookie-banner__btn--link{background:transparent;color:#5671eb;text-decoration:underline;padding:6px 12px;}',
            '.cookie-banner__btn--link:hover{color:#3f57cc;}',
            '.cookie-banner__btn--full{width:100%;}',
            '.cookie-banner__panel{display:none;}',
            '.cookie-banner__panel:not([hidden]){display:block;animation:cookieSlideUp .3s ease;}',
            '.cookie-banner__panel-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #c3d0f8;}',
            '.cookie-banner__panel-title{font-size:1.1rem;font-weight:700;color:#272626;margin:0;}',
            '.cookie-banner__close{width:32px;height:32px;background:#f6f9f9;border:none;border-radius:8px;display:grid;place-items:center;color:#949494;cursor:pointer;transition:all .2s ease;}',
            '.cookie-banner__close:hover{background:#5671eb;color:#fff;}',
            '.cookie-banner__panel-body{display:flex;flex-direction:column;gap:16px;margin-bottom:20px;}',
            '.cookie-option{display:flex;justify-content:space-between;align-items:flex-start;padding:16px;background:#f6f9f9;border-radius:12px;border:1.5px solid #c3d0f8;}',
            '.cookie-option--required{background:#e7f3ff;border-color:#5671eb;}',
            '.cookie-option__info{flex:1;}',
            '.cookie-option__title{display:flex;align-items:center;gap:8px;font-size:.95rem;font-weight:600;color:#272626;margin:0 0 6px;}',
            '.cookie-option__icon{color:#5671eb;display:grid;place-items:center;}',
            '.cookie-option__desc{font-size:.85rem;color:#5a5a5a;margin:0;line-height:1.5;}',
            '.cookie-option__toggle{position:relative;width:48px;height:28px;flex-shrink:0;margin-left:12px;cursor:pointer;}',
            '.cookie-option__toggle--disabled{opacity:.5;cursor:not-allowed;}',
            '.cookie-option__toggle input{opacity:0;width:0;height:0;}',
            '.cookie-option__switch{position:absolute;inset:0;background:#c3d0f8;border-radius:9999px;transition:all .3s ease;}',
            '.cookie-option__switch::before{content:"";position:absolute;width:22px;height:22px;background:#fff;border-radius:50%;top:3px;left:3px;transition:transform .3s ease;box-shadow:0 2px 4px rgba(0,0,0,.1);}',
            '.cookie-option__toggle input:checked + .cookie-option__switch{background:#5671eb;}',
            '.cookie-option__toggle input:checked + .cookie-option__switch::before{transform:translateX(20px);}',
            '.cookie-option__toggle input:focus-visible + .cookie-option__switch{outline:2px solid #3f57cc;outline-offset:2px;}',
            '.cookie-banner__panel-footer{padding-top:16px;border-top:1px solid #c3d0f8;display:grid;grid-template-columns:1fr 1fr;gap:12px;}',
            '@keyframes cookieSlideUp{from{opacity:0;transform:translateY(24px);}to{opacity:1;transform:translateY(0);}}',
            '.cookie-banner--hidden{animation:cookieFadeOut .3s ease forwards;}',
            '@keyframes cookieFadeOut{from{opacity:1;}to{opacity:0;}}',
            '@media (max-width:768px){',
            '.cookie-banner__content,.cookie-banner__panel{margin:12px;padding:20px;}',
            '.cookie-banner__actions,.cookie-banner__panel-footer{grid-template-columns:1fr;gap:10px;}',
            '.cookie-option{flex-direction:column;gap:12px;}',
            '.cookie-option__toggle{align-self:flex-end;}',
            '}'
        ].join('');
        document.head.appendChild(styles);
    }

    /* ---------------------------------------------------------------
       Construcción del banner
       --------------------------------------------------------------- */
    function createBanner() {
        var banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.className = 'cookie-banner';
        banner.setAttribute('role', 'dialog');
        banner.setAttribute('aria-label', 'Aviso de cookies');
        banner.setAttribute('aria-labelledby', 'cookie-banner-title');
        banner.setAttribute('aria-describedby', 'cookie-banner-desc');
        banner.innerHTML = [
            '<div class="cookie-banner__content">',
            '  <div class="cookie-banner__icon">',
            '    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
            '  </div>',
            '  <div class="cookie-banner__text">',
            '    <h3 id="cookie-banner-title" class="cookie-banner__title">🍪 Uso de Cookies</h3>',
            '    <p id="cookie-banner-desc" class="cookie-banner__description">',
            '      Utilizamos cookies propias (técnicas) y de terceros para analizar el uso del sitio y mostrar',
            '      la ubicación de nuestras clínicas mediante <strong>Google Maps</strong>. Las cookies no necesarias',
            '      solo se instalarán con tu consentimiento. Puedes aceptarlas, rechazarlas o configurarlas.',
            '    </p>',
            '    <p class="cookie-banner__legal">Más información en nuestra <a href="./pages/politica-cookies.html" class="cookie-banner__link" target="_blank" rel="noopener">Política de Cookies</a></p>',
            '  </div>',
            '  <div class="cookie-banner__actions">',
            '    <button type="button" class="cookie-banner__btn cookie-banner__btn--reject" id="cookie-reject-btn">Rechazar todas</button>',
            '    <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" id="cookie-accept-btn">Aceptar todas</button>',
            '  </div>',
            '  <div class="cookie-banner__config-row">',
            '    <button type="button" class="cookie-banner__btn cookie-banner__btn--link" id="cookie-config-btn">Configurar preferencias</button>',
            '  </div>',
            '</div>',
            '<div class="cookie-banner__panel" id="cookie-config-panel" hidden>',
            '  <div class="cookie-banner__panel-header">',
            '    <h3 class="cookie-banner__panel-title">Configuración de Cookies</h3>',
            '    <button type="button" class="cookie-banner__close" id="cookie-panel-close" aria-label="Cerrar configuración">',
            '      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
            '    </button>',
            '  </div>',
            '  <div class="cookie-banner__panel-body">',
            '    <div class="cookie-option cookie-option--required">',
            '      <div class="cookie-option__info">',
            '        <h4 class="cookie-option__title"><span class="cookie-option__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg></span>Cookies Necesarias</h4>',
            '        <p class="cookie-option__desc">Esenciales para el funcionamiento del sitio y para recordar tu preferencia de cookies. No se pueden desactivar.</p>',
            '      </div>',
            '      <label class="cookie-option__toggle cookie-option__toggle--disabled"><input type="checkbox" checked disabled aria-label="Cookies necesarias (siempre activas)"><span class="cookie-option__switch"></span></label>',
            '    </div>',
            '    <div class="cookie-option">',
            '      <div class="cookie-option__info">',
            '        <h4 class="cookie-option__title"><span class="cookie-option__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span>Cookies de Análisis</h4>',
            '        <p class="cookie-option__desc">Google Analytics. Nos ayudan a entender cómo usan el sitio los visitantes. Solo se activan si las aceptas.</p>',
            '      </div>',
            '      <label class="cookie-option__toggle"><input type="checkbox" id="analytics-toggle" aria-label="Cookies de análisis"><span class="cookie-option__switch"></span></label>',
            '    </div>',
            '    <div class="cookie-option">',
            '      <div class="cookie-option__info">',
            '        <h4 class="cookie-option__title"><span class="cookie-option__icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13"/></svg></span>Google Maps</h4>',
            '        <p class="cookie-option__desc">Mapa interactivo con la ubicación de nuestras clínicas. Google instala cookies de terceros al cargarlo.</p>',
            '      </div>',
            '      <label class="cookie-option__toggle"><input type="checkbox" id="maps-toggle" aria-label="Cookies de Google Maps"><span class="cookie-option__switch"></span></label>',
            '    </div>',
            '  </div>',
            '  <div class="cookie-banner__panel-footer">',
            '    <button type="button" class="cookie-banner__btn cookie-banner__btn--reject" id="cookie-reject-config">Rechazar todas</button>',
            '    <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" id="cookie-save-config">Guardar preferencias</button>',
            '  </div>',
            '</div>'
        ].join('');
        return banner;
    }

    function buildAndAttach() {
        document.body.appendChild(createBanner());
        var on = function (id, ev, fn) {
            var el = document.getElementById(id);
            if (el) el.addEventListener(ev, fn);
        };
        on('cookie-accept-btn', 'click', acceptAll);
        on('cookie-reject-btn', 'click', rejectAll);
        on('cookie-config-btn', 'click', showConfigPanel);
        on('cookie-panel-close', 'click', hideConfigPanel);
        on('cookie-save-config', 'click', saveConfiguration);
        on('cookie-reject-config', 'click', rejectAll);
    }

    /* ---------------------------------------------------------------
       Cableado de elementos de la página (placeholders + footer)
       --------------------------------------------------------------- */
    function wirePageControls() {
        // Botón "Cargar mapa" dentro de cada placeholder.
        document.querySelectorAll('[data-accept-maps]').forEach(function (btn) {
            btn.addEventListener('click', acceptMapsOnly);
        });
        // Enlace "Configuración de cookies" del footer.
        var reopen = document.getElementById('open-cookie-settings');
        if (reopen) {
            reopen.addEventListener('click', function (e) {
                e.preventDefault();
                openSettings();
            });
        }
    }

    /* ---------------------------------------------------------------
       Inicio
       --------------------------------------------------------------- */
    function init() {
        wirePageControls();

        var stored = getStoredConsent();
        if (stored && !isExpired(stored)) {
            consentState = Object.assign(emptyState(), stored);
            applyMapsState();
            return; // Ya hay consentimiento vigente: no mostrar el banner.
        }

        // Sin consentimiento (o caducado): mostrar el banner y mantener todo bloqueado.
        addStyles();
        buildAndAttach();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // API pública: reabrir configuración (footer) y resetear (útil en pruebas).
    window.HSDentalCookies = {
        openSettings: openSettings,
        resetConsent: function () {
            try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
            location.reload();
        }
    };
})();
