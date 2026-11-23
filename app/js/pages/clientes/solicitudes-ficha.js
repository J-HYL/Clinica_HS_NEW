// app/js/pages/clientes/solicitudes-ficha.js
// Historial de solicitudes de cita del paciente, dentro de su ficha. Lista TODAS
// sus solicitudes y permite aceptar / rechazar / ofrecer otra hora en las abiertas
// (mismo endpoint /api/solicitudes.php que usa la campana). Estilos en
// css/pages/ficha.css (.solicitudes, .pestanas__contador).
import { elegirFechaHora } from "../../modules/components/SelectorCita.js";
import { escapeHtml } from "../../modules/html.js";

const ENDPOINT = "/api/solicitudes.php";
const id = new URLSearchParams(location.search).get("id");
const wrap = document.getElementById("solicitudes-ficha-wrap");

if (wrap && id) cargar();

// Texto y tono de la pastilla de cada estado.
const ESTADOS = {
  solicitada: { texto: "Pendiente", tono: "aviso" },
  contraoferta: { texto: "Esperando al paciente", tono: "acento" },
  confirmada: { texto: "Confirmada", tono: "exito" },
  rechazada: { texto: "Rechazada", tono: "peligro" },
  cancelada: { texto: "Cancelada", tono: "peligro" },
};

async function cargar() {
  try {
    const res = await fetch(ENDPOINT + "?accion=cliente&client_id=" + encodeURIComponent(id), { credentials: "include" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Error");
    render(data.solicitudes || []);
  } catch (e) {
    wrap.innerHTML = `<p class="estado-error"><i class="ri-error-warning-line" aria-hidden="true"></i>${escapeHtml(e.message)}</p>`;
  }
}

function render(items) {
  actualizarTabBadge(items);
  const lista = items.length
    ? `<ul class="solicitudes">${items.map(item).join("")}</ul>`
    : `<p class="estado-vacio"><i class="ri-inbox-line" aria-hidden="true"></i>Este paciente no tiene solicitudes de cita.</p>`;
  wrap.innerHTML = `
    <div class="lista__cabecera">
      <div>
        <h3 class="container__heading">Solicitudes de cita</h3>
        <p class="tarjeta__subtitulo">Las que pide el paciente desde su portal.</p>
      </div>
    </div>
    ${lista}`;
  wrap.querySelectorAll("[data-accion]").forEach((b) => (b.onclick = () => accionar(b.dataset.accion, b.dataset.id)));
}

// Resalta la pestaña "Solicitudes" con el nº de solicitudes abiertas
// (solicitada / contraoferta), como el resto de avisos del panel.
function actualizarTabBadge(items) {
  const abiertas = items.filter((s) => s.estado === "solicitada" || s.estado === "contraoferta").length;
  const tab = document.querySelector('.pestanas__opcion[data-tab="solicitudes"]');
  if (!tab) return;
  let badge = tab.querySelector(".pestanas__contador");
  if (abiertas > 0) {
    if (!badge) { badge = document.createElement("span"); badge.className = "pestanas__contador"; tab.appendChild(badge); }
    badge.textContent = abiertas > 9 ? "9+" : String(abiertas);
    tab.classList.add("pestanas__opcion--aviso");
  } else {
    if (badge) badge.remove();
    tab.classList.remove("pestanas__opcion--aviso");
  }
}

function item(s) {
  const abierta = s.estado === "solicitada" || s.estado === "contraoferta";
  const estado = ESTADOS[s.estado] || { texto: s.estado, tono: "" };
  const detalle = (texto) => `<p class="solicitud__detalle">${texto}</p>`;
  const prop = s.estado === "contraoferta" && s.fecha_propuesta ? detalle(`Propuesto: ${escapeHtml(fmtFecha(s.fecha_propuesta))}`) : "";
  const resp = s.respuesta_clinica ? detalle(`Nota clínica: ${escapeHtml(s.respuesta_clinica)}`) : "";
  const sid = escapeHtml(s.id);
  const acc = abierta ? `<div class="solicitud__acciones">
        <button type="button" class="boton boton--primario boton--pequeno" data-accion="aceptar" data-id="${sid}"><i class="ri-check-line" aria-hidden="true"></i> Aceptar</button>
        <button type="button" class="boton boton--secundario boton--pequeno" data-accion="ofrecer" data-id="${sid}"><i class="ri-calendar-event-line" aria-hidden="true"></i> Ofrecer otra hora</button>
        <button type="button" class="boton boton--fantasma boton--pequeno" data-tono="peligro" data-accion="rechazar" data-id="${sid}"><i class="ri-close-line" aria-hidden="true"></i> Rechazar</button>
      </div>` : "";
  return `<li class="solicitud">
      <div class="solicitud__cabecera">
        <div>
          <p class="solicitud__fecha">${escapeHtml(fmtFecha(s.fecha_preferida))}</p>
          ${s.motivo ? detalle(`Motivo: ${escapeHtml(s.motivo)}`) : ""}
          ${s.notas ? detalle(`Nota del paciente: ${escapeHtml(s.notas)}`) : ""}
          ${prop}${resp}
        </div>
        <span class="pastilla" data-tono="${escapeHtml(estado.tono)}">${escapeHtml(estado.texto)}</span>
      </div>
      ${acc}
    </li>`;
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
    showCancelButton: true, confirmButtonText: "Confirmar cita", cancelButtonText: "Cancelar", confirmButtonColor: "var(--hs-exito)",
  });
  if (!medico) return;
  await enviar("aceptar", { solicitud_id: Number(sid), medico });
}

async function rechazar(sid) {
  const r = await Swal.fire({
    title: "Rechazar solicitud", input: "text", inputPlaceholder: "Motivo (opcional, lo verá el paciente)",
    showCancelButton: true, confirmButtonText: "Rechazar", cancelButtonText: "Cancelar", confirmButtonColor: "var(--hs-peligro)",
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

function fmtFecha(dt) { if (!dt) return ""; const d = new Date(String(dt).replace(" ", "T")); if (isNaN(d.getTime())) return dt; return d.toLocaleString("es-ES", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }); }
