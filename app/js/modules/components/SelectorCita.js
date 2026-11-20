// app/js/modules/components/SelectorCita.js
// Selector de fecha/hora con CALENDARIO que muestra las citas existentes.
// Se usa en el panel para "Ofrecer otra hora" y "Dar cita": el usuario ve un
// mes, los días con citas llevan un punto, y al elegir un día ve las citas de
// ese día + una rejilla de horas (las llenas se deshabilitan).
// Va en el modal común (modal.css); lo propio, en css/components/selectorCita.css,
// que la página tiene que cargar.
//
// elegirFechaHora(opts) -> Promise<{ fecha:"YYYY-MM-DDTHH:MM", ...campos } | null>
//   opts.titulo  título del modal
//   opts.campos  campos extra: [{id,label,type,options?,placeholder?}]

import { escapeHtml } from "../html.js";

const CAP = 2; // gabinetes
const DEFAULT_SLOTS = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"];
const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/** Horas de la clínica de la sesión (del servidor); usa el default si falla. */
async function fetchSlots() {
  try {
    const r = await fetch("/api/solicitudes.php?accion=horarios", { credentials: "include" });
    if (r.ok) { const d = await r.json(); if (Array.isArray(d.slots) && d.slots.length) return d.slots; }
  } catch (e) { /* usa el default */ }
  return DEFAULT_SLOTS;
}

async function citasDelMes(y, m) {
  const p = String(m + 1).padStart(2, "0");
  const last = new Date(y, m + 1, 0).getDate();
  const start = `${y}-${p}-01 00:00:00`;
  const end = `${y}-${p}-${String(last).padStart(2, "0")} 23:59:59`;
  try {
    const res = await fetch(`/api/DB.php?table=appointments&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`, { credentials: "include" });
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}

function campoHtml(c) {
  const id = `selc-campo-${escapeHtml(c.id)}`;
  const control = c.type === "select"
    ? `<select id="${id}" class="form__input form__input--select">${(c.options || []).map((o) => `<option value="${escapeHtml(o.v)}">${escapeHtml(o.t)}</option>`).join("")}</select>`
    : `<input id="${id}" class="form__input" type="${escapeHtml(c.type || "text")}" placeholder="${escapeHtml(c.placeholder || "")}">`;
  return `<div class="form__group"><label class="form__label" for="${id}">${escapeHtml(c.label)}</label>${control}</div>`;
}

/** Fecha "YYYY-MM-DD" -> "13 de julio de 2025". */
function fechaLegible(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Marco del modal común: cabecera con título y cerrar, cuerpo y pie. */
function crearDialogo({ clase, titulo, cuerpo, pie }) {
  const dlg = document.createElement("dialog");
  dlg.className = `modal ${clase}`;
  dlg.setAttribute("aria-labelledby", `${clase}-titulo`);
  dlg.innerHTML = `
    <div class="modal__container">
      <section class="modal__card">
        <header class="modal__header">
          <h2 class="modal__heading" id="${clase}-titulo">${escapeHtml(titulo)}</h2>
          <button type="button" class="modal__close" data-cerrar aria-label="Cerrar"><i class="ri-close-line" aria-hidden="true"></i></button>
        </header>
        <div class="modal__body">${cuerpo}</div>
        <footer class="modal__footer">${pie}</footer>
      </section>
    </div>`;
  document.body.appendChild(dlg);
  return dlg;
}

/** Diálogo aparte con las citas de un día, para no estirar el modal principal. */
function verCitasDialog(fecha, citas) {
  const d = crearDialogo({
    clase: "selc-citas",
    titulo: "Citas del " + fechaLegible(fecha),
    cuerpo: `<ul class="selc-citas__lista">
      ${citas.map((c) => `<li class="selc__cita"><span class="selc__cita-hora">${escapeHtml(c.t.slice(0, 5))}</span> <span class="selc__cita-nombre">${escapeHtml(c.nombre)}</span> <span class="selc__cita-gabinete">${c.medico === "med2" ? "Gab 2" : "Gab 1"}</span></li>`).join("")}
    </ul>`,
    pie: `<button type="button" class="boton boton--primario" data-cerrar>Cerrar</button>`,
  });
  d.showModal();
  const cerrar = () => { d.close(); d.remove(); };
  d.querySelectorAll("[data-cerrar]").forEach((b) => (b.onclick = cerrar));
  d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
}

export async function elegirFechaHora(opts = {}) {
  const campos = opts.campos || [];
  const titulo = opts.titulo || "Elegir fecha y hora";
  const slots = await fetchSlots();
  return new Promise((resolve) => {
    const dlg = crearDialogo({
      clase: "selc",
      titulo,
      cuerpo: `
        <div class="selc__cal" id="selc-cal"></div>
        <div class="selc__day" id="selc-day"><p class="selc__hint">Elige un día en el calendario.</p></div>
        ${campos.map(campoHtml).join("")}`,
      pie: `
        <button type="button" class="boton boton--secundario" data-cerrar>Cancelar</button>
        <button type="button" class="boton boton--primario" id="selc-ok" disabled>Confirmar</button>`,
    });
    dlg.showModal();

    let cursor = new Date(); cursor.setDate(1);
    let selDate = null, selHora = null, mes = {};
    const cal = dlg.querySelector("#selc-cal");
    const dayEl = dlg.querySelector("#selc-day");
    const okBtn = dlg.querySelector("#selc-ok");

    const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelectorAll("[data-cerrar]").forEach((b) => (b.onclick = () => close(null)));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(null); });
    okBtn.onclick = () => {
      if (!selDate || !selHora) return;
      const extra = {};
      for (const c of campos) extra[c.id] = dlg.querySelector("#selc-campo-" + c.id).value;
      close({ fecha: selDate + "T" + selHora, ...extra });
    };

    async function cargarMes() {
      const y = cursor.getFullYear(), m = cursor.getMonth();
      mes = {};
      const arr = await citasDelMes(y, m);
      for (const a of arr) {
        const f = String(a.fecha || "").replace(" ", "T");
        const d = f.slice(0, 10), t = f.slice(11, 16);
        if (!d || !t) continue;
        (mes[d] = mes[d] || []).push({ t, nombre: a.servicio || "", medico: a.medico || "" });
      }
      drawCal();
    }

    function drawCal() {
      const y = cursor.getFullYear(), m = cursor.getMonth();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const mesActual = new Date(today.getFullYear(), today.getMonth(), 1);
      const start = (new Date(y, m, 1).getDay() + 6) % 7;
      const dias = new Date(y, m + 1, 0).getDate();
      let cells = "";
      for (let i = 0; i < start; i++) cells += `<div></div>`;
      for (let d = 1; d <= dias; d++) {
        const date = new Date(y, m, d); const k = iso(date);
        const past = date < today; const busy = (mes[k] || []).length > 0; const sel = k === selDate;
        const etiqueta = `${d} de ${MESES[m]}${busy ? ", con citas" : ""}`;
        cells += `<button type="button" class="selc__d" data-date="${k}" aria-label="${etiqueta}" aria-pressed="${sel}" ${past ? "disabled" : ""}>${d}${busy ? '<span class="selc__dot" aria-hidden="true"></span>' : ""}</button>`;
      }
      const prevOff = new Date(y, m, 1) <= mesActual;
      cal.innerHTML = `
        <div class="selc__calh">
          <span class="selc__mes">${MESES[m]} ${y}</span>
          <span class="selc__nav">
            <button type="button" class="boton boton--icono boton--secundario" data-prev aria-label="Mes anterior" ${prevOff ? "disabled" : ""}><i class="ri-arrow-left-s-line" aria-hidden="true"></i></button>
            <button type="button" class="boton boton--icono boton--secundario" data-next aria-label="Mes siguiente"><i class="ri-arrow-right-s-line" aria-hidden="true"></i></button>
          </span>
        </div>
        <div class="selc__grid">${DOW.map((x) => `<div class="selc__dow" aria-hidden="true">${x}</div>`).join("")}${cells}</div>`;
      if (!prevOff) cal.querySelector("[data-prev]").onclick = () => { cursor = new Date(y, m - 1, 1); cargarMes(); };
      cal.querySelector("[data-next]").onclick = () => { cursor = new Date(y, m + 1, 1); cargarMes(); };
      cal.querySelectorAll(".selc__d:not([disabled])").forEach((b) => (b.onclick = () => {
        selDate = b.dataset.date; selHora = null; okBtn.disabled = true; drawCal(); drawDay();
      }));
    }

    function drawDay() {
      if (!selDate) return;
      const citas = (mes[selDate] || []).slice().sort((a, b) => a.t.localeCompare(b.t));
      const cont = {}; citas.forEach((c) => { const hh = c.t.slice(0, 5); cont[hh] = (cont[hh] || 0) + 1; });
      // Las citas del día se ven en OTRO diálogo (así este modal no crece con muchas citas).
      const resumen = citas.length
        ? `<button type="button" class="boton boton--secundario selc__vercitas" id="selc-vercitas">Ver ${citas.length} ${citas.length === 1 ? "cita" : "citas"} de ese día <i class="ri-arrow-right-s-line" aria-hidden="true"></i></button>`
        : `<p class="selc__hint">Sin citas ese día.</p>`;
      const grid = `<div class="selc__slots">${slots.map((h) => {
        const full = (cont[h] || 0) >= CAP; const sel = h === selHora;
        return `<button type="button" class="selc__slot" data-h="${escapeHtml(h)}" aria-pressed="${sel}" ${full ? "disabled" : ""}>${escapeHtml(h)}</button>`;
      }).join("")}</div>`;
      dayEl.innerHTML = `${resumen}<p class="selc__dtitle">Elige hora</p>${grid}`;
      const ver = dayEl.querySelector("#selc-vercitas");
      if (ver) ver.onclick = () => verCitasDialog(selDate, citas);
      dayEl.querySelectorAll(".selc__slot:not([disabled])").forEach((b) => (b.onclick = () => {
        dayEl.querySelectorAll(".selc__slot").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true"); selHora = b.dataset.h; okBtn.disabled = false;
      }));
    }

    cargarMes();
  });
}
