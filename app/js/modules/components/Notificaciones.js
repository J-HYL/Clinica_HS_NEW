/**
 * Notificaciones.js — Campana de avisos del panel.
 *
 * Va en la barra superior (#topbar-acciones, la pone AppShell.js); en una
 * pantalla sin barra queda flotando arriba a la derecha. Consulta las
 * solicitudes de cita y de factura pendientes, y los TAC enviados por centros
 * de radiología que nadie ha visto aún (/api/tac.php?accion=avisos); si hay,
 * muestra el número. Al pulsarla abre un desplegable con los avisos; cada uno
 * lleva a donde se gestiona. Estilos en shell.css (sección "Avisos").
 *
 * Otra pantalla puede abrir el desplegable lanzando el evento "hs:abrir-avisos"
 * en window (lo usa el aviso de solicitudes del Resumen).
 * Se autoinicializa al importarse desde main.js.
 */

import { escapeHtml } from "../html.js";

const ENDPOINT = "/api/solicitudes.php";
const ENDPOINT_FACT = "/api/facturas_solicitudes.php";
const ENDPOINT_TAC = "/api/tac.php"; // TAC enviados desde centros de radiología, aún sin ver
const POLL_MS = 60000;

function buildWidget() {
  if (document.getElementById("hs-avisos")) return null;
  const hueco = document.getElementById("topbar-acciones");
  const root = document.createElement("div");
  root.id = "hs-avisos";
  root.className = hueco ? "avisos" : "avisos avisos--flotante";
  root.innerHTML = `
    <button class="avisos__boton" type="button" aria-label="Avisos" aria-haspopup="dialog" aria-expanded="false" aria-controls="hs-avisos-panel">
      <i class="ri-notification-3-line" aria-hidden="true"></i>
      <span class="avisos__contador" aria-hidden="true"></span>
    </button>
    <div class="avisos__panel" id="hs-avisos-panel" role="dialog" aria-label="Avisos">
      <div class="avisos__cabecera">Avisos
        <button class="boton boton--icono boton--fantasma" type="button" aria-label="Cerrar avisos" data-cerrar>
          <i class="ri-close-line" aria-hidden="true"></i>
        </button>
      </div>
      <div class="avisos__lista"></div>
      <p class="avisos__pie">Pulsa un aviso para gestionarlo</p>
    </div>`;
  (hueco || document.body).appendChild(root);
  return root;
}

function fmtFecha(dt) {
  if (!dt) return "";
  const d = new Date(String(dt).replace(" ", "T"));
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString("es-ES", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const pedir = (url) => fetch(url, { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

async function refreshCount(root) {
  const resultados = await Promise.all([
    pedir(ENDPOINT + "?accion=count"),
    pedir(ENDPOINT_FACT + "?accion=count"),
    pedir(ENDPOINT_TAC + "?accion=avisos"),
  ]);
  const count = resultados.reduce((n, d) => n + (d && d.count ? d.count : 0), 0);
  const contador = root.querySelector(".avisos__contador");
  const boton = root.querySelector(".avisos__boton");
  contador.textContent = count > 9 ? "9+" : String(count);
  contador.classList.toggle("visible", count > 0);
  boton.setAttribute("aria-label", count > 0 ? `Avisos (${count} pendientes)` : "Avisos");
}

// nombre y detalle llegan YA escapados.
function itemHtml(href, icono, variante, nombre, detalle) {
  return `<a class="avisos__item" href="${href}">
      <span class="avisos__icono${variante ? " avisos__icono--" + variante : ""}" aria-hidden="true"><i class="${icono}"></i></span>
      <span>
        <span class="avisos__nombre">${nombre}</span>
        <span class="avisos__detalle">${detalle}</span>
      </span>
    </a>`;
}

async function loadList(root) {
  const list = root.querySelector(".avisos__lista");
  list.innerHTML = `<div class="avisos__vacio">Cargando…</div>`;
  try {
    const [citasData, factData, tacData] = await Promise.all([
      pedir(ENDPOINT + "?accion=pendientes"),
      pedir(ENDPOINT_FACT + "?accion=pendientes"),
      pedir(ENDPOINT_TAC + "?accion=avisos"),
    ]);
    const citas = (citasData && citasData.solicitudes) || [];
    const facturas = (factData && factData.solicitudes) || [];
    const tacs = (tacData && tacData.estudios) || [];
    if (!citas.length && !facturas.length && !tacs.length) {
      list.innerHTML = `<div class="avisos__vacio">No hay avisos pendientes</div>`;
      return;
    }
    // Cita -> ficha del paciente. Factura -> ese pago dentro del tratamiento.
    const citasHtml = citas.map((s) => {
      const espera = s.estado === "contraoferta";
      return itemHtml(
        `/pages/clientes/historia-clinica.html?id=${encodeURIComponent(s.client_id)}&tab=solicitudes`,
        "ri-calendar-event-line", espera ? "espera" : "",
        escapeHtml(s.nombre),
        `${espera ? "Esperando respuesta · " : "Pide cita: "}${escapeHtml(fmtFecha(s.fecha_preferida))}`);
    }).join("");
    const factHtml = facturas.map((s) => {
      const importe = s.monto != null ? Number(s.monto).toFixed(2) + " €" : "";
      return itemHtml(
        `/pages/clientes/tratamientos.html?id=${encodeURIComponent(s.treatment_id)}&pago=${encodeURIComponent(s.payment_id)}`,
        "ri-file-text-line", "factura",
        escapeHtml(s.nombre),
        `Pide factura · ${escapeHtml(importe)}`);
    }).join("");
    // TAC enviado por un centro: con paciente -> al visor; sin asignar -> a asignarlo.
    const tacHtml = tacs.map((t) => {
      const destino = t.client_id
        ? `/pages/tac/visor.html?id=${encodeURIComponent(t.id)}`
        : `/pages/tac/control.html?asignar=${encodeURIComponent(t.id)}`;
      return itemHtml(
        destino, "ri-body-scan-line", "tac",
        `${escapeHtml(t.paciente || t.paciente_nombre)}${t.client_id ? "" : " · sin asignar"}`,
        `TAC recibido${t.centro ? " de " + escapeHtml(t.centro) : ""} · ${escapeHtml(fmtFecha(t.fecha_subida))}`);
    }).join("");
    list.innerHTML = tacHtml + citasHtml + factHtml;
  } catch (e) {
    list.innerHTML = `<div class="avisos__vacio avisos__vacio--error">${escapeHtml(e.message)}</div>`;
  }
}

function wire(root) {
  const boton = root.querySelector(".avisos__boton");
  const panel = root.querySelector(".avisos__panel");
  const abrir = () => {
    panel.classList.add("abierto");
    boton.setAttribute("aria-expanded", "true");
    loadList(root);
  };
  const cerrar = () => {
    if (!panel.classList.contains("abierto")) return;
    panel.classList.remove("abierto");
    boton.setAttribute("aria-expanded", "false");
  };
  boton.addEventListener("click", () => (panel.classList.contains("abierto") ? cerrar() : abrir()));
  root.querySelector("[data-cerrar]").addEventListener("click", cerrar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrar(); });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) cerrar(); });
  // Abrir desde otra pantalla (p. ej. el aviso del Resumen). El click que lo
  // lanza llega despues al listener de "fuera" de arriba: se abre en el
  // siguiente tick para que ese mismo click no lo cierre.
  window.addEventListener("hs:abrir-avisos", () => setTimeout(abrir));
}

function init() {
  const root = buildWidget();
  if (!root) return;
  wire(root);
  refreshCount(root);
  setInterval(() => refreshCount(root), POLL_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
