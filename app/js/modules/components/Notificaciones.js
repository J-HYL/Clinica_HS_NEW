/**
 * Notificaciones.js — Campana de solicitudes de cita para el panel.
 *
 * Inyecta una campana flotante ARRIBA A LA DERECHA en cualquier pantalla del
 * panel (mismo estilo autocontenido que Soporte.js). Consulta las solicitudes de
 * cita pendientes (/api/solicitudes.php); si hay, se resalta con badge + pulso.
 * Al pulsarla abre un desplegable con las solicitudes; cada una lleva a la ficha
 * del paciente. Se autoinicializa al importarse desde main.js.
 */

const ENDPOINT = "/api/solicitudes.php";
const ENDPOINT_FACT = "/api/facturas_solicitudes.php";
const POLL_MS = 60000;

function injectStyles() {
  if (document.getElementById("hs-notif-styles")) return;
  const style = document.createElement("style");
  style.id = "hs-notif-styles";
  style.textContent = `
  .hs-notif-fab{position:fixed;top:14px;right:20px;z-index:99997;width:46px;height:46px;border:none;border-radius:50%;
    background:#fff;color:#3a56d4;cursor:pointer;display:flex;align-items:center;justify-content:center;
    box-shadow:0 4px 16px rgba(17,24,39,.14);transition:transform .2s ease,box-shadow .2s ease;}
  .hs-notif-fab:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(17,24,39,.2);}
  .hs-notif-fab:active{transform:scale(.95);}
  .hs-notif-fab svg{width:24px;height:24px;}
  .hs-notif-fab.has{color:#3a56d4;}
  .hs-notif-fab.has::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:2px solid #ff3b30;opacity:.6;
    animation:hs-notif-pulse 2.2s ease-out infinite;}
  @keyframes hs-notif-pulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.5);opacity:0}}
  .hs-notif-badge{position:absolute;top:-5px;right:-5px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;
    background:#ff3b30;color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;
    box-shadow:0 0 0 2px #fff;}
  .hs-notif-badge.show{display:flex;}

  .hs-notif-panel{position:fixed;top:70px;right:20px;z-index:99998;width:350px;max-width:calc(100vw - 32px);
    background:#fff;border-radius:14px;box-shadow:0 18px 50px rgba(17,24,39,.24);overflow:hidden;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    transform:translateY(-12px) scale(.97);opacity:0;pointer-events:none;transform-origin:top right;
    transition:transform .2s cubic-bezier(.16,1,.3,1),opacity .16s ease;}
  .hs-notif-panel.open{transform:none;opacity:1;pointer-events:auto;}
  .hs-notif-head{background:linear-gradient(135deg,#3a56d4,#1e2a5e);color:#fff;padding:15px 18px;font-size:15px;font-weight:700;
    display:flex;align-items:center;justify-content:space-between;}
  .hs-notif-close{border:none;background:rgba(255,255,255,.15);color:#fff;width:26px;height:26px;border-radius:50%;
    cursor:pointer;font-size:17px;line-height:1;display:flex;align-items:center;justify-content:center;}
  .hs-notif-list{max-height:min(62vh,440px);overflow:auto;}
  .hs-notif-item{display:flex;gap:11px;padding:13px 16px;border-bottom:1px solid #f0f1f4;cursor:pointer;transition:background .12s;}
  .hs-notif-item:hover{background:#f6f8ff;}
  .hs-notif-ic{flex:0 0 auto;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;
    background:#eef1fe;color:#3a56d4;}
  .hs-notif-ic.wait{background:#fff4e5;color:#b46a00;}
  .hs-notif-ic.fact{background:#e7f8ee;color:#1e8e3e;}
  .hs-notif-ic svg{width:19px;height:19px;}
  .hs-notif-name{font-size:14px;font-weight:700;color:#1e2a5e;}
  .hs-notif-when{font-size:12.5px;color:#6b7280;margin-top:2px;}
  .hs-notif-empty{padding:34px 20px;text-align:center;color:#9ca3af;font-size:13px;}
  .hs-notif-foot{padding:12px 16px;text-align:center;border-top:1px solid #eef0f4;}
  .hs-notif-foot a{color:#3a56d4;font-weight:600;font-size:13px;text-decoration:none;}
  @media (max-width:480px){ .hs-notif-panel{right:12px;left:12px;width:auto;top:66px;} .hs-notif-fab{top:12px;right:14px;} }`;
  document.head.appendChild(style);
}

const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
const DOC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h8"/></svg>`;

function buildWidget() {
  if (document.getElementById("hs-notif-root")) return;
  const root = document.createElement("div");
  root.id = "hs-notif-root";
  root.innerHTML = `
    <button class="hs-notif-fab" id="hs-notif-fab" type="button" aria-label="Avisos">
      ${BELL}<span class="hs-notif-badge" id="hs-notif-badge">0</span>
    </button>
    <div class="hs-notif-panel" id="hs-notif-panel" role="dialog">
      <div class="hs-notif-head">Avisos
        <button class="hs-notif-close" id="hs-notif-close" aria-label="Cerrar">&times;</button>
      </div>
      <div class="hs-notif-list" id="hs-notif-list"></div>
      <div class="hs-notif-foot" style="font-size:12px;color:#9ca3af">Pulsa un aviso para gestionarlo</div>
    </div>`;
  document.body.appendChild(root);
  wire();
}

function fmtFecha(dt) {
  if (!dt) return "";
  const d = new Date(String(dt).replace(" ", "T"));
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function esc(v) {
  return v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function refreshCount() {
  try {
    const results = await Promise.all([
      fetch(ENDPOINT + "?accion=count", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(ENDPOINT_FACT + "?accion=count", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const count = results.reduce((n, d) => n + (d && d.count ? d.count : 0), 0);
    const fab = document.getElementById("hs-notif-fab");
    const badge = document.getElementById("hs-notif-badge");
    if (!fab || !badge) return;
    if (count > 0) {
      badge.textContent = count > 9 ? "9+" : String(count);
      badge.classList.add("show");
      fab.classList.add("has");
    } else {
      badge.classList.remove("show");
      fab.classList.remove("has");
    }
  } catch (e) { /* silencio */ }
}

async function loadList() {
  const list = document.getElementById("hs-notif-list");
  list.innerHTML = `<div class="hs-notif-empty">Cargando…</div>`;
  try {
    const [citasData, factData] = await Promise.all([
      fetch(ENDPOINT + "?accion=pendientes", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
      fetch(ENDPOINT_FACT + "?accion=pendientes", { credentials: "include" }).then((r) => r.json()).catch(() => ({})),
    ]);
    const citas = (citasData && citasData.solicitudes) || [];
    const facturas = (factData && factData.solicitudes) || [];
    if (!citas.length && !facturas.length) {
      list.innerHTML = `<div class="hs-notif-empty">No hay avisos pendientes 🎉</div>`;
      return;
    }
    // Cita -> ficha del paciente. Factura -> ese pago dentro del tratamiento.
    const citasHtml = citas.map((s) => {
      const wait = s.estado === "contraoferta";
      return `<div class="hs-notif-item" data-goto="/pages/clientes/historia-clinica.html?id=${s.client_id}&tab=solicitudes">
        <div class="hs-notif-ic ${wait ? "wait" : ""}">${BELL}</div>
        <div>
          <div class="hs-notif-name">${esc(s.nombre)}</div>
          <div class="hs-notif-when">${wait ? "Esperando respuesta · " : "Pide cita: "}${esc(fmtFecha(s.fecha_preferida))}</div>
        </div>
      </div>`;
    }).join("");
    const factHtml = facturas.map((s) => {
      const importe = s.monto != null ? Number(s.monto).toFixed(2) + " €" : "";
      return `<div class="hs-notif-item" data-goto="/pages/clientes/tratamientos.html?id=${s.treatment_id}&pago=${s.payment_id}">
        <div class="hs-notif-ic fact">${DOC}</div>
        <div>
          <div class="hs-notif-name">${esc(s.nombre)}</div>
          <div class="hs-notif-when">Pide factura · ${esc(importe)}</div>
        </div>
      </div>`;
    }).join("");
    list.innerHTML = citasHtml + factHtml;
    list.querySelectorAll("[data-goto]").forEach((el) => {
      el.onclick = () => { location.href = el.dataset.goto; };
    });
  } catch (e) {
    list.innerHTML = `<div class="hs-notif-empty" style="color:#b91c1c">${esc(e.message)}</div>`;
  }
}

function wire() {
  const fab = document.getElementById("hs-notif-fab");
  const panel = document.getElementById("hs-notif-panel");
  const close = document.getElementById("hs-notif-close");
  const toggle = () => {
    const open = panel.classList.toggle("open");
    if (open) loadList();
  };
  fab.addEventListener("click", toggle);
  close.addEventListener("click", () => panel.classList.remove("open"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.classList.remove("open"); });
  document.addEventListener("click", (e) => {
    if (panel.classList.contains("open") && !panel.contains(e.target) && !fab.contains(e.target)) {
      panel.classList.remove("open");
    }
  });
}

function init() {
  injectStyles();
  buildWidget();
  refreshCount();
  setInterval(refreshCount, POLL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
