/**
 * Cookie Banner - HSDental
 * Gestión de consentimiento de cookies conforme a LSSI-CE y RGPD
 */
(function() {
    'use strict';

    const COOKIE_NAME = 'hsdental_cookie_consent';
    let consentState = {
        accepted: false,
        analytics: false,
        maps: false,
        marketing: false,
        timestamp: null
    };

    function getStoredConsent() {
        try {
            const saved = localStorage.getItem(COOKIE_NAME);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    }

    function saveConsent() {
        consentState.timestamp = new Date().toISOString();
        localStorage.setItem(COOKIE_NAME, JSON.stringify(consentState));
    }

    function loadBlockedContent() {
        if (consentState.maps) {
            document.querySelectorAll('iframe[data-cookieconsent="google-maps"]').forEach(function(iframe) {
                var src = iframe.getAttribute('data-src');
                if (src) {
                    iframe.setAttribute('src', src);
                    iframe.removeAttribute('data-cookieconsent');
                    iframe.removeAttribute('data-src');
                }
            });
        }
    }

    function hideBanner() {
        var banner = document.getElementById('cookie-banner');
        if (banner) {
            banner.classList.add('cookie-banner--hidden');
            setTimeout(function() {
                banner.style.display = 'none';
            }, 300);
        }
    }

    function acceptAll() {
        consentState = { accepted: true, analytics: true, maps: true, marketing: true, timestamp: null };
        saveConsent();
        hideBanner();
        loadBlockedContent();
    }

    function rejectAll() {
        consentState = { accepted: false, analytics: false, maps: false, marketing: false, timestamp: null };
        saveConsent();
        hideBanner();
    }

    function saveConfiguration() {
        var analyticsToggle = document.getElementById('analytics-toggle');
        var mapsToggle = document.getElementById('maps-toggle');
        var marketingToggle = document.getElementById('marketing-toggle');

        consentState = {
            accepted: true,
            analytics: analyticsToggle ? analyticsToggle.checked : false,
            maps: mapsToggle ? mapsToggle.checked : false,
            marketing: marketingToggle ? marketingToggle.checked : false,
            timestamp: null
        };
        saveConsent();
        hideBanner();
        loadBlockedContent();
    }

    function showConfigPanel() {
        var panel = document.getElementById('cookie-config-panel');
        var content = document.querySelector('.cookie-banner__content');
        if (panel && content) {
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

    function addStyles() {
        var styles = document.createElement('style');
        styles.id = 'cookie-banner-styles';
        styles.textContent = `
            .cookie-banner {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                z-index: 9999;
                font-family: 'Montserrat', sans-serif;
            }
            .cookie-banner__overlay {
                position: absolute;
                inset: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(4px);
                opacity: 0;
                animation: cookieFadeIn 0.3s ease forwards;
            }
            .cookie-banner__content {
                position: relative;
                background: #ffffff;
                margin: 16px;
                padding: 24px;
                border-radius: 16px;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
                max-width: 560px;
                margin-left: auto;
                margin-right: auto;
                animation: cookieSlideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .cookie-banner__icon {
                width: 64px;
                height: 64px;
                background: linear-gradient(135deg, #5671eb 0%, #3f57cc 100%);
                border-radius: 16px;
                display: grid;
                place-items: center;
                margin: 0 auto 16px;
                color: #ffffff;
            }
            .cookie-banner__title {
                font-size: 1.25rem;
                font-weight: 700;
                color: #272626;
                text-align: center;
                margin-bottom: 12px;
            }
            .cookie-banner__description {
                font-size: 0.95rem;
                color: #949494;
                line-height: 1.6;
                text-align: center;
                margin-bottom: 8px;
            }
            .cookie-banner__legal {
                font-size: 0.85rem;
                color: #949494;
                text-align: center;
            }
            .cookie-banner__link {
                color: #5671eb;
                font-weight: 600;
                text-decoration: underline;
            }
            .cookie-banner__actions {
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 12px;
                margin-top: 20px;
            }
            .cookie-banner__btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 12px 20px;
                font-family: 'Montserrat', sans-serif;
                font-size: 0.9rem;
                font-weight: 600;
                border-radius: 9999px;
                cursor: pointer;
                transition: all 0.28s ease;
                border: none;
                white-space: nowrap;
            }
            .cookie-banner__btn--primary {
                background: #5671eb;
                color: #ffffff;
                box-shadow: 0 4px 18px rgba(86, 113, 235, 0.35);
            }
            .cookie-banner__btn--primary:hover {
                background: #3f57cc;
                transform: translateY(-2px);
                box-shadow: 0 8px 28px rgba(86, 113, 235, 0.42);
            }
            .cookie-banner__btn--outline {
                background: transparent;
                color: #5671eb;
                border: 2px solid #c3d0f8;
            }
            .cookie-banner__btn--outline:hover {
                background: #dde4fb;
                border-color: #5671eb;
                transform: translateY(-2px);
            }
            .cookie-banner__btn--ghost {
                background: transparent;
                color: #949494;
            }
            .cookie-banner__btn--ghost:hover {
                background: #f6f9f9;
                color: #272626;
            }
            .cookie-banner__btn--full {
                width: 100%;
            }
            .cookie-banner__panel {
                background: #ffffff;
                margin: 16px;
                padding: 24px;
                border-radius: 16px;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.2);
                max-width: 560px;
                margin-left: auto;
                margin-right: auto;
                display: none;
            }
            .cookie-banner__panel:not([hidden]) {
                display: block;
                animation: cookieSlideUp 0.3s ease;
            }
            .cookie-banner__panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 16px;
                border-bottom: 1px solid #c3d0f8;
            }
            .cookie-banner__panel-title {
                font-size: 1.1rem;
                font-weight: 700;
                color: #272626;
                margin: 0;
            }
            .cookie-banner__close {
                width: 32px;
                height: 32px;
                background: #f6f9f9;
                border: none;
                border-radius: 8px;
                display: grid;
                place-items: center;
                color: #949494;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .cookie-banner__close:hover {
                background: #5671eb;
                color: #ffffff;
            }
            .cookie-banner__panel-body {
                display: flex;
                flex-direction: column;
                gap: 16px;
                margin-bottom: 20px;
            }
            .cookie-option {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                padding: 16px;
                background: #f6f9f9;
                border-radius: 12px;
                border: 1.5px solid #c3d0f8;
            }
            .cookie-option--required {
                background: #e7f3ff;
                border-color: #5671eb;
            }
            .cookie-option__info {
                flex: 1;
            }
            .cookie-option__title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.95rem;
                font-weight: 600;
                color: #272626;
                margin: 0 0 6px;
            }
            .cookie-option__icon {
                color: #5671eb;
                display: grid;
                place-items: center;
            }
            .cookie-option__desc {
                font-size: 0.85rem;
                color: #949494;
                margin: 0;
                line-height: 1.5;
            }
            .cookie-option__toggle {
                position: relative;
                width: 48px;
                height: 28px;
                flex-shrink: 0;
                margin-left: 12px;
                cursor: pointer;
            }
            .cookie-option__toggle--disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .cookie-option__toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .cookie-option__switch {
                position: absolute;
                inset: 0;
                background: #c3d0f8;
                border-radius: 9999px;
                transition: all 0.3s ease;
            }
            .cookie-option__switch::before {
                content: '';
                position: absolute;
                width: 22px;
                height: 22px;
                background: #ffffff;
                border-radius: 50%;
                top: 3px;
                left: 3px;
                transition: transform 0.3s ease;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .cookie-option__toggle input:checked + .cookie-option__switch {
                background: #5671eb;
            }
            .cookie-option__toggle input:checked + .cookie-option__switch::before {
                transform: translateX(20px);
            }
            .cookie-banner__panel-footer {
                padding-top: 16px;
                border-top: 1px solid #c3d0f8;
            }
            @keyframes cookieFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes cookieSlideUp {
                from { opacity: 0; transform: translateY(24px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .cookie-banner--hidden {
                animation: cookieFadeOut 0.3s ease forwards;
            }
            @keyframes cookieFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            @media (max-width: 768px) {
                .cookie-banner__content,
                .cookie-banner__panel {
                    margin: 12px;
                    padding: 20px;
                }
                .cookie-banner__actions {
                    grid-template-columns: 1fr;
                    gap: 10px;
                }
                .cookie-option {
                    flex-direction: column;
                    gap: 12px;
                }
                .cookie-option__toggle {
                    align-self: flex-end;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    function createBanner() {
        var banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.className = 'cookie-banner';
        banner.innerHTML = `
            <div class="cookie-banner__overlay"></div>
            <div class="cookie-banner__content">
                <div class="cookie-banner__icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                </div>
                <div class="cookie-banner__text">
                    <h3 id="cookie-banner-title" class="cookie-banner__title">🍪 Uso de Cookies</h3>
                    <p id="cookie-banner-desc" class="cookie-banner__description">
                        Utilizamos cookies propias y de terceros para mejorar su experiencia de navegación,
                        analizar el uso del sitio y mostrarle contenido relevante.
                        <strong>Incluimos cookies de Google Maps</strong> para mostrar la ubicación de nuestras clínicas.
                        Puede aceptar todas, rechazar las no necesarias o configurar sus preferencias.
                    </p>
                    <p class="cookie-banner__legal">
                        Más información en nuestra
                        <a href="./politica-cookies.html" class="cookie-banner__link" target="_blank">Política de Cookies</a>
                    </p>
                </div>
                <div class="cookie-banner__actions">
                    <button type="button" class="cookie-banner__btn cookie-banner__btn--ghost" id="cookie-reject-btn">Rechazar todas</button>
                    <button type="button" class="cookie-banner__btn cookie-banner__btn--outline" id="cookie-config-btn">Configurar</button>
                    <button type="button" class="cookie-banner__btn cookie-banner__btn--primary" id="cookie-accept-btn">Aceptar todas</button>
                </div>
            </div>
            <div class="cookie-banner__panel" id="cookie-config-panel" hidden>
                <div class="cookie-banner__panel-header">
                    <h3 class="cookie-banner__panel-title">Configuración de Cookies</h3>
                    <button type="button" class="cookie-banner__close" id="cookie-panel-close" aria-label="Cerrar panel">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="cookie-banner__panel-body">
                    <div class="cookie-option cookie-option--required">
                        <div class="cookie-option__info">
                            <h4 class="cookie-option__title">
                                <span class="cookie-option__icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="20 6 9 17 4 12"/>
                                    </svg>
                                </span>
                                Cookies Necesarias
                            </h4>
                            <p class="cookie-option__desc">Esenciales para el funcionamiento del sitio web. No se pueden desactivar.</p>
                        </div>
                        <label class="cookie-option__toggle cookie-option__toggle--disabled">
                            <input type="checkbox" checked disabled>
                            <span class="cookie-option__switch"></span>
                        </label>
                    </div>
                    <div class="cookie-option">
                        <div class="cookie-option__info">
                            <h4 class="cookie-option__title">
                                <span class="cookie-option__icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                                    </svg>
                                </span>
                                Cookies de Análisis
                            </h4>
                            <p class="cookie-option__desc">Google Analytics - Nos ayudan a entender cómo usa nuestros visitantes el sitio web.</p>
                        </div>
                        <label class="cookie-option__toggle">
                            <input type="checkbox" id="analytics-toggle">
                            <span class="cookie-option__switch"></span>
                        </label>
                    </div>
                    <div class="cookie-option">
                        <div class="cookie-option__info">
                            <h4 class="cookie-option__title">
                                <span class="cookie-option__icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polygon points="3 11 22 2 13 21 11 13"/>
                                    </svg>
                                </span>
                                Google Maps
                            </h4>
                            <p class="cookie-option__desc">Mapa interactivo para mostrar la ubicación de nuestras clínicas. Google instalará cookies de seguimiento.</p>
                        </div>
                        <label class="cookie-option__toggle">
                            <input type="checkbox" id="maps-toggle">
                            <span class="cookie-option__switch"></span>
                        </label>
                    </div>
                    <div class="cookie-option">
                        <div class="cookie-option__info">
                            <h4 class="cookie-option__title">
                                <span class="cookie-option__icon">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                                    </svg>
                                </span>
                                Cookies de Marketing
                            </h4>
                            <p class="cookie-option__desc">Personalizan la publicidad y el contenido que ve en nuestro sitio y en otros.</p>
                        </div>
                        <label class="cookie-option__toggle">
                            <input type="checkbox" id="marketing-toggle">
                            <span class="cookie-option__switch"></span>
                        </label>
                    </div>
                </div>
                <div class="cookie-banner__panel-footer">
                    <button type="button" class="cookie-banner__btn cookie-banner__btn--outline cookie-banner__btn--full" id="cookie-save-config">Guardar configuración</button>
                </div>
            </div>
        `;
        return banner;
    }

    function init() {
        // Comprobar si ya hay consentimiento
        var stored = getStoredConsent();
        if (stored) {
            consentState = stored;
            loadBlockedContent();
            return;
        }

        // Añadir estilos y crear banner
        addStyles();
        document.body.appendChild(createBanner());

        // Añadir event listeners después de un pequeño delay
        setTimeout(function() {
            var acceptBtn = document.getElementById('cookie-accept-btn');
            var rejectBtn = document.getElementById('cookie-reject-btn');
            var configBtn = document.getElementById('cookie-config-btn');
            var closeBtn = document.getElementById('cookie-panel-close');
            var saveBtn = document.getElementById('cookie-save-config');

            if (acceptBtn) acceptBtn.addEventListener('click', acceptAll);
            if (rejectBtn) rejectBtn.addEventListener('click', rejectAll);
            if (configBtn) configBtn.addEventListener('click', showConfigPanel);
            if (closeBtn) closeBtn.addEventListener('click', hideConfigPanel);
            if (saveBtn) saveBtn.addEventListener('click', saveConfiguration);
        }, 50);
    }

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer función para resetear consentimiento (útil para testing)
    window.HSDentalCookies = {
        resetConsent: function() {
            localStorage.removeItem(COOKIE_NAME);
            location.reload();
        }
    };
})();
