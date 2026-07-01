/**
 * Soporte.js — Widget flotante de soporte para el panel de gestión.
 *
 * Inyecta un botón circular abajo a la derecha en cualquier pantalla del panel.
 * Al pulsarlo abre un panel donde el usuario describe un problema y (opcional)
 * adjunta capturas. El reporte se envía por correo vía /api/soporte.php.
 *
 * Es autocontenido: crea su propio CSS y HTML, no depende de librerías externas.
 * Se importa una sola vez desde main.js (y en las pocas páginas sin main.js).
 */

const ENDPOINT = "/api/soporte.php";
const MAX_FICHEROS = 5;
const MAX_BYTES = 5 * 1024 * 1024;

function injectStyles() {
    if (document.getElementById("hs-support-styles")) return;
    const style = document.createElement("style");
    style.id = "hs-support-styles";
    style.textContent = `
    .hs-support-fab{position:fixed;bottom:24px;right:24px;z-index:99998;width:60px;height:60px;border:none;border-radius:50%;
        background:linear-gradient(135deg,#5671EB,#3a56d4);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;
        box-shadow:0 8px 24px rgba(58,86,212,.42);transition:transform .2s ease,box-shadow .2s ease;}
    .hs-support-fab:hover{transform:translateY(-3px) scale(1.04);box-shadow:0 12px 30px rgba(58,86,212,.55);}
    .hs-support-fab:active{transform:scale(.96);}
    .hs-support-fab svg{width:28px;height:28px;}
    .hs-support-fab::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid #5671EB;opacity:.6;
        animation:hs-support-pulse 2.4s ease-out infinite;}
    @keyframes hs-support-pulse{0%{transform:scale(1);opacity:.5;}100%{transform:scale(1.55);opacity:0;}}

    .hs-support-panel{position:fixed;bottom:96px;right:24px;z-index:99999;width:360px;max-width:calc(100vw - 32px);
        background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(17,24,39,.24);overflow:hidden;
        font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
        transform:translateY(16px) scale(.96);opacity:0;pointer-events:none;transform-origin:bottom right;
        transition:transform .22s cubic-bezier(.16,1,.3,1),opacity .18s ease;}
    .hs-support-panel.open{transform:translateY(0) scale(1);opacity:1;pointer-events:auto;}

    .hs-support-head{background:linear-gradient(135deg,#3a56d4,#1e2a5e);color:#fff;padding:20px 22px;position:relative;}
    .hs-support-head h3{margin:0;font-size:16px;font-weight:700;display:flex;align-items:center;gap:8px;}
    .hs-support-head p{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:rgba(255,255,255,.82);}
    .hs-support-close{position:absolute;top:14px;right:14px;width:28px;height:28px;border:none;border-radius:50%;
        background:rgba(255,255,255,.15);color:#fff;cursor:pointer;font-size:18px;line-height:1;display:flex;align-items:center;justify-content:center;
        transition:background .15s ease;}
    .hs-support-close:hover{background:rgba(255,255,255,.28);}

    .hs-support-body{padding:18px 22px 22px;}
    .hs-support-label{display:block;font-size:12px;font-weight:600;color:#374151;margin:0 0 6px;}
    .hs-support-textarea{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:11px 13px;font-size:13.5px;
        font-family:inherit;color:#111827;border:1px solid #d1d5db;border-radius:10px;outline:none;transition:border-color .15s ease,box-shadow .15s ease;}
    .hs-support-textarea:focus{border-color:#5671EB;box-shadow:0 0 0 3px rgba(86,113,235,.15);}

    .hs-support-drop{margin-top:14px;border:1.5px dashed #cbd5e1;border-radius:10px;padding:14px;text-align:center;cursor:pointer;
        color:#6b7280;font-size:12.5px;transition:border-color .15s ease,background .15s ease;}
    .hs-support-drop:hover,.hs-support-drop.drag{border-color:#5671EB;background:#f8f9ff;color:#3a56d4;}
    .hs-support-drop svg{width:20px;height:20px;display:block;margin:0 auto 6px;opacity:.7;}

    .hs-support-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;}
    .hs-support-thumb{position:relative;width:56px;height:56px;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;}
    .hs-support-thumb img{width:100%;height:100%;object-fit:cover;display:block;}
    .hs-support-thumb button{position:absolute;top:2px;right:2px;width:18px;height:18px;border:none;border-radius:50%;
        background:rgba(17,24,39,.72);color:#fff;font-size:12px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}

    .hs-support-send{margin-top:16px;width:100%;border:none;border-radius:10px;padding:12px;font-size:14px;font-weight:600;color:#fff;
        background:linear-gradient(135deg,#5671EB,#3a56d4);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;
        transition:filter .15s ease,transform .1s ease;}
    .hs-support-send:hover{filter:brightness(1.06);}
    .hs-support-send:active{transform:scale(.98);}
    .hs-support-send:disabled{opacity:.6;cursor:not-allowed;filter:none;}
    .hs-support-spin{width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:hs-support-rot .7s linear infinite;}
    @keyframes hs-support-rot{to{transform:rotate(360deg);}}

    .hs-support-msg{margin-top:12px;font-size:12.5px;padding:10px 12px;border-radius:8px;display:none;line-height:1.5;}
    .hs-support-msg.ok{display:block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;}
    .hs-support-msg.err{display:block;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;}

    @media (max-width:480px){
        .hs-support-panel{right:12px;left:12px;width:auto;bottom:88px;}
        .hs-support-fab{bottom:16px;right:16px;}
    }`;
    document.head.appendChild(style);
}

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
            <p>¿Algo no funciona o tienes una duda con el panel? Cuéntanos qué ocurre y, si puedes, adjunta una captura. El equipo lo revisará.</p>
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
    injectStyles();
    buildWidget();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
