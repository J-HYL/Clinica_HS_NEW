// app/js/pages/clientes/solicitudes-ficha.js
// Historial de solicitudes de cita del paciente, dentro de su ficha. Lista TODAS
// sus solicitudes y permite aceptar / rechazar / ofrecer otra hora en las abiertas
// (mismo endpoint /api/solicitudes.php que usa la campana). Autocontenido.
import { elegirFechaHora } from "../../modules/components/SelectorCita.js";

const ENDPOINT = "/api/solicitudes.php";
const id = new URLSearchParams(location.search).get("id");
const wrap = document.getElementById("solicitudes-ficha-wrap");

if (wrap && id) { injectStyles(); cargar(); }

function injectStyles() {
  if (document.getElementById("hs-solf-styles")) return;
  const s = document.createElement("style");
  s.id = "hs-solf-styles";
  s.textContent = `
    #solicitudes-ficha-wrap{max-width:900px;margin:0 auto 1.5rem;}
    .solf-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:18px 20px;box-shadow:0 1px 3px rgba(16,24,40,.06);}
    .solf-h{font-size:1.05rem;font-weight:700;color:#1e2a5e;margin:0 0 6px;display:flex;align-items:center;gap:8px;}
    .solf-item{padding:12px 0;border-top:1px solid #f0f1f4;}
    .solf-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}
    .solf-when{font-size:14px;font-weight:600;color:#111827;}
    .solf-meta{font-size:12.5px;color:#6b7280;margin-top:3px;}
    .solf-tag{font-size:11.5px;font-weight:700;padding:4px 10px;border-radius:999px;white-space:nowrap;}
    .solf-tag--solicitada{background:#eef1fe;color:#3a56d4;}
    .solf-tag--contraoferta{background:#fff4e5;color:#b46a00;}
    .solf-tag--confirmada{background:#e7f8ee;color:#1e8e3e;}
    .solf-tag--rechazada,.solf-tag--cancelada{background:#fdeceb;color:#c62a22;}
    .solf-actions{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;}
    .solf-btn{border:none;border-radius:9px;padding:7px 13px;font-size:13px;font-weight:600;cursor:pointer;}
    .solf-btn--ok{background:#34c759;color:#fff;}
    .solf-btn--alt{background:#5671eb;color:#fff;}
    .solf-btn--no{background:#fff;color:#c62a22;border:1px solid #f0c9c6;}`;
  document.head.appendChild(s);
}

const ESTADOS = { solicitada: "Pendiente", contraoferta: "Esperando al paciente", confirmada: "Confirmada", rechazada: "Rechazada", cancelada: "Cancelada" };

async function cargar() {
  try {
    const res = await fetch(ENDPOINT + "?accion=cliente&client_id=" + encodeURIComponent(id), { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    render(data.solicitudes || []);
  } catch (e) {
    wrap.innerHTML = `<div class="solf-card" style="color:#b91c1c">${esc(e.message)}</div>`;
  }
}

function render(items) {
  if (!items.length) { wrap.innerHTML = ""; return; } // sin solicitudes: no ocupamos espacio
  wrap.innerHTML = `<div class="solf-card">
      <h3 class="solf-h"><i class="ri-inbox-fill"></i> Solicitudes de cita</h3>
      ${items.map(item).join("")}
    </div>`;
  wrap.querySelectorAll("[data-accion]").forEach((b) => (b.onclick = () => accionar(b.dataset.accion, b.dataset.id)));
}

function item(s) {
  const abierta = s.estado === "solicitada" || s.estado === "contraoferta";
  const prop = s.estado === "contraoferta" && s.fecha_propuesta ? `<div class="solf-meta">Propuesto: ${esc(fmtFecha(s.fecha_propuesta))}</div>` : "";
  const resp = s.respuesta_clinica ? `<div class="solf-meta">Nota clínica: ${esc(s.respuesta_clinica)}</div>` : "";
  const acc = abierta ? `<div class="solf-actions">
        <button class="solf-btn solf-btn--ok" data-accion="aceptar" data-id="${s.id}">Aceptar</button>
        <button class="solf-btn solf-btn--alt" data-accion="ofrecer" data-id="${s.id}">Ofrecer otra hora</button>
        <button class="solf-btn solf-btn--no" data-accion="rechazar" data-id="${s.id}">Rechazar</button>
      </div>` : "";
  return `<div class="solf-item">
      <div class="solf-top">
        <div>
          <div class="solf-when">${esc(fmtFecha(s.fecha_preferida))}</div>
          ${s.motivo ? `<div class="solf-meta">Motivo: ${esc(s.motivo)}</div>` : ""}
          ${s.notas ? `<div class="solf-meta">Nota del paciente: ${esc(s.notas)}</div>` : ""}
          ${prop}${resp}
        </div>
        <span class="solf-tag solf-tag--${esc(s.estado)}">${esc(ESTADOS[s.estado] || s.estado)}</span>
      </div>
      ${acc}
    </div>`;
}

function accionar(accion, sid) {
  if (accion === "aceptar") return aceptar(sid);
  if (accion === "rechazar") return rechazar(sid);
  if (accion === "ofrecer") return ofrecer(sid);
}

async function aceptar(sid) {
  const { value: medico } = await Swal.fire({
    title: "Confirmar cita", text: "¿En qué gabinete?", input: "select",
    inputOptions: { med1: "Gabinete 1", med2: "Gabinete 2" }, inputValue: "med1",
    showCancelButton: true, confirmButtonText: "Confirmar cita", cancelButtonText: "Cancelar", confirmButtonColor: "#34c759",
  });
  if (!medico) return;
  await enviar("aceptar", { solicitud_id: Number(sid), medico });
}

async function rechazar(sid) {
  const r = await Swal.fire({
    title: "Rechazar solicitud", input: "text", inputPlaceholder: "Motivo (opcional, lo verá el paciente)",
    showCancelButton: true, confirmButtonText: "Rechazar", cancelButtonText: "Cancelar", confirmButtonColor: "#c62a22",
  });
  if (!r.isConfirmed) return;
  await enviar("rechazar", { solicitud_id: Number(sid), motivo: r.value || "" });
}

async function ofrecer(sid) {
  const value = await elegirFechaHora({
    titulo: "Ofrecer otra hora",
    campos: [{ id: "nota", label: "Nota para el paciente (opcional)", type: "text", placeholder: "Ej.: mejor por la tarde" }],
  });
  if (!value) return;
  await enviar("ofrecer", { solicitud_id: Number(sid), fecha_propuesta: value.fecha, nota: value.nota || "" });
}

async function enviar(accion, payload) {
  Swal.fire({ title: "Enviando…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await fetch(ENDPOINT + "?accion=" + accion, {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || "Error");
    await Swal.fire({ icon: "success", title: "Hecho", text: data.message || "", timer: 1800, showConfirmButton: false });
    cargar();
  } catch (e) {
    Swal.fire("Error", e.message, "error");
  }
}

function esc(v) { return v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtFecha(dt) { if (!dt) return ""; const d = new Date(String(dt).replace(" ", "T")); if (isNaN(d.getTime())) return dt; return d.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
