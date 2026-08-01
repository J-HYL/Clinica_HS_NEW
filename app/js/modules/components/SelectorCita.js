// app/js/modules/components/SelectorCita.js
// Selector de fecha/hora con CALENDARIO que muestra las citas existentes.
// Se usa en el panel para "Ofrecer otra hora" y "Dar cita": el usuario ve un
// mes, los días con citas llevan un punto, y al elegir un día ve las citas de
// ese día + una rejilla de horas (las llenas se deshabilitan).
//
// elegirFechaHora(opts) -> Promise<{ fecha:"YYYY-MM-DDTHH:MM", ...campos } | null>
//   opts.titulo  título del modal
//   opts.campos  campos extra: [{id,label,type,options?,placeholder?}]

const CAP = 2; // gabinetes
const DEFAULT_SLOTS = ["09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"];
const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function injectStyles() {
  if (document.getElementById("selc-styles")) return;
  const s = document.createElement("style");
  s.id = "selc-styles";
  s.textContent = `
    dialog.selc{margin:auto;width:520px;max-width:calc(100vw - 24px);max-height:92vh;overflow:hidden;border:none;border-radius:16px;padding:0;
      display:flex;flex-direction:column;
      box-shadow:0 24px 60px rgba(17,24,39,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;}
    dialog.selc::backdrop{background:rgba(17,24,39,.45);}
    .selc__scroll{flex:1 1 auto;overflow:auto;min-height:0;}
    .selc__head{background:linear-gradient(135deg,#3a56d4,#1e2a5e);color:#fff;padding:16px 20px;font-size:16px;font-weight:700;
      display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;}
    .selc__x{border:none;background:rgba(255,255,255,.15);color:#fff;width:28px;height:28px;border-radius:50%;font-size:18px;cursor:pointer;}
    .selc__cal,.selc__day{padding:14px 18px;}
    .selc__calh{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;font-size:15px;text-transform:capitalize;}
    .selc__calh button{border:none;background:#eef1fe;color:#3a56d4;width:30px;height:30px;border-radius:50%;font-size:18px;cursor:pointer;margin-left:6px;}
    .selc__grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}
    .selc__dow{text-align:center;font-size:11px;font-weight:700;color:#9ca3af;padding:3px 0;}
    .selc__d{position:relative;aspect-ratio:1;border:none;background:transparent;border-radius:9px;font-size:14px;font-weight:600;color:#111827;cursor:pointer;}
    .selc__d:not(:disabled):hover{background:#eef1fe;}
    .selc__d:disabled{color:#cbd5e1;cursor:default;}
    .selc__d--sel{background:#5671eb;color:#fff;}
    .selc__dot{position:absolute;bottom:5px;left:50%;transform:translateX(-50%);width:5px;height:5px;border-radius:50%;background:#ff9f0a;}
    .selc__d--sel .selc__dot{background:#fff;}
    .selc__day{border-top:1px solid #f0f1f4;}
    .selc__dtitle{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#9ca3af;margin:6px 0 8px;}
    .selc__hint{font-size:13px;color:#9ca3af;}
    .selc__cl{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;max-height:120px;overflow:auto;}
    .selc__cita{font-size:13px;color:#374151;display:flex;gap:8px;align-items:center;}
    .selc__cita b{color:#1e2a5e;}
    .selc__cita span{margin-left:auto;font-size:11px;color:#9ca3af;}
    .selc__slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px;}
    .selc__slot{padding:9px 4px;border-radius:9px;border:1px solid #e5e7eb;background:#fff;font-size:14px;font-weight:600;cursor:pointer;}
    .selc__slot:disabled{opacity:.35;text-decoration:line-through;cursor:default;}
    .selc__slot--sel{background:#5671eb;color:#fff;border-color:#5671eb;}
    .selc__campos{padding:4px 18px 0;display:flex;flex-direction:column;gap:10px;}
    .selc__lbl{display:flex;flex-direction:column;gap:5px;font-size:13px;font-weight:600;color:#374151;}
    .selc__inp{padding:10px 12px;border:1px solid #d1d5db;border-radius:9px;font-size:14px;font-family:inherit;}
    .selc__foot{flex:0 0 auto;background:#fff;border-top:1px solid #f0f1f4;padding:14px 18px;display:flex;gap:8px;justify-content:flex-end;}
    .selc__btn{border:none;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;}
    .selc__btn--ghost{background:#f3f4f6;color:#374151;}
    .selc__btn--ok{background:#5671eb;color:#fff;}
    .selc__btn--ok:disabled{opacity:.5;cursor:default;}
    .selc__vercitas{width:100%;text-align:left;border:1px solid #e5e7eb;background:#f9fafb;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;color:#3a56d4;cursor:pointer;margin-bottom:12px;}
    .selc__vercitas:hover{background:#eef1fe;}
    dialog.selc-citas{margin:auto;width:420px;max-width:calc(100vw - 32px);max-height:80vh;overflow:hidden;border:none;border-radius:16px;padding:0;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(17,24,39,.28);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111827;}
    dialog.selc-citas::backdrop{background:rgba(17,24,39,.35);}
    .selc-citas__list{flex:1 1 auto;overflow:auto;min-height:0;padding:14px 18px;display:flex;flex-direction:column;gap:8px;}`;
  document.head.appendChild(s);
}

const hm = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const mh = (t) => String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const esc = (v) => v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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
  if (c.type === "select") {
    return `<label class="selc__lbl">${esc(c.label)}<select id="selc-campo-${c.id}" class="selc__inp">${(c.options || []).map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("")}</select></label>`;
  }
  return `<label class="selc__lbl">${esc(c.label)}<input id="selc-campo-${c.id}" class="selc__inp" type="${esc(c.type || "text")}" placeholder="${esc(c.placeholder || "")}"></label>`;
}

/** Fecha "YYYY-MM-DD" -> "13 de julio de 2025". */
function fechaLegible(isoDate) {
  const [y, m, d] = String(isoDate).split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

/** Diálogo aparte con las citas de un día, para no estirar el modal principal. */
function verCitasDialog(fecha, citas) {
  const d = document.createElement("dialog");
  d.className = "selc-citas";
  d.innerHTML = `
    <div class="selc__head">Citas del ${esc(fechaLegible(fecha))}<button class="selc__x" aria-label="Cerrar">&times;</button></div>
    <div class="selc-citas__list">
      ${citas.map((c) => `<div class="selc__cita"><b>${esc(c.t.slice(0, 5))}</b> ${esc(c.nombre)} <span>${c.medico === "med2" ? "Gab 2" : "Gab 1"}</span></div>`).join("")}
    </div>
    <div class="selc__foot"><button class="selc__btn selc__btn--ok" id="selc-citas-close">Cerrar</button></div>`;
  document.body.appendChild(d);
  d.showModal();
  const cerrar = () => { d.close(); d.remove(); };
  d.querySelector(".selc__x").onclick = cerrar;
  d.querySelector("#selc-citas-close").onclick = cerrar;
  d.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(); });
}

export async function elegirFechaHora(opts = {}) {
  const campos = opts.campos || [];
  const titulo = opts.titulo || "Elegir fecha y hora";
  injectStyles();
  const slots = await fetchSlots();
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "selc";
    dlg.innerHTML = `
      <div class="selc__head">${esc(titulo)}<button class="selc__x" aria-label="Cerrar">&times;</button></div>
      <div class="selc__scroll">
        <div class="selc__cal" id="selc-cal"></div>
        <div class="selc__day" id="selc-day"><p class="selc__hint">Elige un día en el calendario.</p></div>
        ${campos.length ? `<div class="selc__campos">${campos.map(campoHtml).join("")}</div>` : ""}
      </div>
      <div class="selc__foot">
        <button class="selc__btn selc__btn--ghost" id="selc-cancel">Cancelar</button>
        <button class="selc__btn selc__btn--ok" id="selc-ok" disabled>Confirmar</button>
      </div>`;
    document.body.appendChild(dlg);
    dlg.showModal();

    let cursor = new Date(); cursor.setDate(1);
    let selDate = null, selHora = null, mes = {};
    const cal = dlg.querySelector("#selc-cal");
    const dayEl = dlg.querySelector("#selc-day");
    const okBtn = dlg.querySelector("#selc-ok");

    const close = (val) => { dlg.close(); dlg.remove(); resolve(val); };
    dlg.querySelector(".selc__x").onclick = () => close(null);
    dlg.querySelector("#selc-cancel").onclick = () => close(null);
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
        cells += `<button class="selc__d ${sel ? "selc__d--sel" : ""}" data-date="${k}" ${past ? "disabled" : ""}>${d}${busy ? '<span class="selc__dot"></span>' : ""}</button>`;
      }
      const prevOff = new Date(y, m, 1) <= mesActual;
      cal.innerHTML = `
        <div class="selc__calh"><b>${MESES[m]} ${y}</b><span>
          <button data-prev ${prevOff ? "disabled" : ""}>‹</button><button data-next>›</button></span></div>
        <div class="selc__grid">${DOW.map((x) => `<div class="selc__dow">${x}</div>`).join("")}${cells}</div>`;
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
        ? `<button type="button" class="selc__vercitas" id="selc-vercitas">Ver ${citas.length} ${citas.length === 1 ? "cita" : "citas"} de ese día ›</button>`
        : `<p class="selc__hint">Sin citas ese día.</p>`;
      const grid = `<div class="selc__slots">${slots.map((h) => {
        const full = (cont[h] || 0) >= CAP; const sel = h === selHora;
        return `<button class="selc__slot ${sel ? "selc__slot--sel" : ""}" data-h="${h}" ${full ? "disabled" : ""}>${h}</button>`;
      }).join("")}</div>`;
      dayEl.innerHTML = `${resumen}<div class="selc__dtitle">Elige hora</div>${grid}`;
      const ver = dayEl.querySelector("#selc-vercitas");
      if (ver) ver.onclick = () => verCitasDialog(selDate, citas);
      dayEl.querySelectorAll(".selc__slot:not([disabled])").forEach((b) => (b.onclick = () => {
        dayEl.querySelectorAll(".selc__slot").forEach((x) => x.classList.remove("selc__slot--sel"));
        b.classList.add("selc__slot--sel"); selHora = b.dataset.h; okBtn.disabled = false;
      }));
    }

    cargarMes();
  });
}
