/**
 * Soporte.js — Widget flotante de soporte para el panel de gestión.
 *
 * Inyecta un botón circular abajo a la derecha en cualquier pantalla del panel.
 * Al pulsarlo abre un panel donde el usuario describe un problema y (opcional)
 * adjunta capturas. El reporte se envía por correo vía /api/soporte.php.
 *
 * Crea su propio HTML; su aspecto está en css/components/soporte.css (lo importa
 * shell.css, el marco común). Se importa una sola vez desde main.js (y en las
 * pocas páginas sin main.js, que cargan soporte.css por su cuenta).
 */

const ENDPOINT = "/api/soporte.php";
const MAX_FICHEROS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

function buildWidget() {
    if (document.getElementById("hs-support-root")) return;

    const root = document.createElement("div");
    root.id = "hs-support-root";
    root.innerHTML = `
    <button class="hs-support-fab" id="hs-support-fab" type="button" aria-label="Soporte" title="¿Necesitas ayuda?">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12" y2="17"></line>
        </svg>
    </button>
    <div class="hs-support-panel" id="hs-support-panel" role="dialog" aria-labelledby="hs-support-title">
        <div class="hs-support-head">
            <button class="hs-support-close" id="hs-support-close" type="button" aria-label="Cerrar">&times;</button>
            <h3 id="hs-support-title">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                Soporte técnico
            </h3>
            <p>¿Algo no funciona o tienes una duda con el panel? Cuéntame qué ocurre y, si puedes, adjunta una captura. Lo reviso y te echo una mano.</p>
        </div>
        <div class="hs-support-body">
            <label class="hs-support-label" for="hs-support-text">Describe el problema</label>
            <textarea class="hs-support-textarea" id="hs-support-text" placeholder="Ej.: Al guardar una cita aparece un error y no se registra…"></textarea>

            <div class="hs-support-drop" id="hs-support-drop" role="button" tabindex="0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                Adjuntar capturas (opcional)
            </div>
            <input type="file" id="hs-support-file" accept="image/*" multiple hidden>
            <div class="hs-support-thumbs" id="hs-support-thumbs"></div>

            <button class="hs-support-send" id="hs-support-send" type="button">
                <span class="hs-support-send-label">Enviar reporte</span>
            </button>
            <div class="hs-support-msg" id="hs-support-msg"></div>
        </div>
    </div>`;
    document.body.appendChild(root);
    wireEvents();
}

let selectedFiles = [];

function wireEvents() {
    const fab    = document.getElementById("hs-support-fab");
    const panel  = document.getElementById("hs-support-panel");
    const close  = document.getElementById("hs-support-close");
    const drop   = document.getElementById("hs-support-drop");
    const input  = document.getElementById("hs-support-file");
    const thumbs = document.getElementById("hs-support-thumbs");
    const send   = document.getElementById("hs-support-send");
    const text   = document.getElementById("hs-support-text");
    const msg    = document.getElementById("hs-support-msg");

    const showMsg = (kind, txt) => { msg.className = "hs-support-msg " + kind; msg.textContent = txt; };
    const clearMsg = () => { msg.className = "hs-support-msg"; msg.textContent = ""; };

    const togglePanel = () => {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) text.focus();
    };
    fab.addEventListener("click", togglePanel);
    close.addEventListener("click", () => panel.classList.remove("open"));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.classList.remove("open"); });

    const renderThumbs = () => {
        thumbs.innerHTML = "";
        selectedFiles.forEach((file, i) => {
            const url = URL.createObjectURL(file);
            const el = document.createElement("div");
            el.className = "hs-support-thumb";
            el.innerHTML = `<img src="${url}" alt=""><button type="button" data-i="${i}" aria-label="Quitar">&times;</button>`;
            el.querySelector("button").addEventListener("click", () => {
                selectedFiles.splice(i, 1);
                renderThumbs();
            });
            thumbs.appendChild(el);
        });
    };

    const addFiles = (files) => {
        clearMsg();
        for (const f of files) {
            if (!f.type.startsWith("image/")) { showMsg("err", "Solo se permiten imágenes."); continue; }
            if (f.size > MAX_BYTES) { showMsg("err", "Cada imagen debe pesar menos de 5 MB."); continue; }
            if (selectedFiles.length >= MAX_FICHEROS) { showMsg("err", `Máximo ${MAX_FICHEROS} imágenes.`); break; }
            selectedFiles.push(f);
        }
        renderThumbs();
    };

    drop.addEventListener("click", () => input.click());
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { addFiles(input.files); input.value = ""; });

    ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => { if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); });

    send.addEventListener("click", async () => {
        clearMsg();
        const mensaje = text.value.trim();
        if (!mensaje) { showMsg("err", "Escribe una breve descripción del problema."); text.focus(); return; }

        const labelEl = send.querySelector(".hs-support-send-label");
        send.disabled = true;
        send.innerHTML = `<span class="hs-support-spin"></span><span>Enviando…</span>`;

        const fd = new FormData();
        fd.append("mensaje", mensaje);
        fd.append("pagina", window.location.href);
        selectedFiles.forEach(f => fd.append("imagenes[]", f, f.name));

        try {
            const res = await fetch(ENDPOINT, { method: "POST", body: fd, credentials: "include" });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                showMsg("ok", "¡Reporte enviado! Gracias, lo revisaremos lo antes posible.");
                text.value = "";
                selectedFiles = [];
                renderThumbs();
                setTimeout(() => { panel.classList.remove("open"); clearMsg(); }, 2600);
            } else {
                showMsg("err", data.error || "No se pudo enviar el reporte. Inténtalo de nuevo.");
            }
        } catch (err) {
            showMsg("err", "Error de conexión. Comprueba tu red e inténtalo de nuevo.");
        } finally {
            send.disabled = false;
            send.innerHTML = "";
            const lbl = document.createElement("span");
            lbl.className = "hs-support-send-label";
            lbl.textContent = "Enviar reporte";
            send.appendChild(lbl);
        }
    });
}

function init() {
    buildWidget();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
