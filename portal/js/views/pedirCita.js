// portal/js/views/pedirCita.js — pedir cita con CALENDARIO.
// El paciente ve un calendario mensual; al pulsar un día se abre un sheet con los
// huecos orientativos de ese día y el botón "Solicitar cita este día".
import { api } from "../api.js";
import { spinnerHtml, escapeHtml, toast, fmtDateLong } from "../util.js";
import { ICON } from "../icons.js";

const DOW = ["L", "M", "X", "J", "V", "S", "D"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export async function render(root, ctx) {
  let cursor = new Date();
  cursor.setDate(1);

  root.innerHTML = `
    <div class="subhead">
      <button class="subhead__back" data-back aria-label="Volver">${ICON.back}</button>
      <h1>Pedir cita</h1>
    </div>
    <p class="view__hi" style="margin:0 2px 14px">Elige un día y te propondremos los huecos.</p>
    <div class="cal" id="cal"></div>`;
  root.querySelector("[data-back]").onclick = () => ctx.go("citas");
  const cal = root.querySelector("#cal");
  dibujar();

  function dibujar() {
    const y = cursor.getFullYear(), m = cursor.getMonth();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const mesActual = new Date(today.getFullYear(), today.getMonth(), 1);
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7; // lunes = 0
    const dias = new Date(y, m + 1, 0).getDate();

    let celdas = "";
    for (let i = 0; i < startDow; i++) celdas += `<div></div>`;
    for (let d = 1; d <= dias; d++) {
      const date = new Date(y, m, d);
      const past = date < today;
      const hoy = date.getTime() === today.getTime();
      celdas += `<button class="cal__day ${hoy ? "cal__day--today" : ""}" data-date="${iso(date)}" ${past ? "disabled" : ""}>${d}</button>`;
    }

    const prevOff = new Date(y, m, 1) <= mesActual;
    cal.innerHTML = `
      <div class="cal__head">
        <div class="cal__title">${MESES[m]} ${y}</div>
        <div class="cal__nav">
          <button data-prev aria-label="Mes anterior" ${prevOff ? "disabled" : ""}>${ICON.back}</button>
          <button data-next aria-label="Mes siguiente">${ICON.chevron}</button>
        </div>
      </div>
      <div class="cal__grid">
        ${DOW.map((d) => `<div class="cal__dow">${d}</div>`).join("")}
        ${celdas}
      </div>`;
    if (!prevOff) cal.querySelector("[data-prev]").onclick = () => { cursor = new Date(y, m - 1, 1); dibujar(); };
    cal.querySelector("[data-next]").onclick = () => { cursor = new Date(y, m + 1, 1); dibujar(); };
    cal.querySelectorAll(".cal__day:not([disabled])").forEach((b) => (b.onclick = () => abrirDia(b.dataset.date, ctx)));
  }
}

async function abrirDia(fecha, ctx) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.innerHTML = `
    <div class="sheet__grab"></div>
    <div class="sheet__title">${escapeHtml(fmtDateLong(fecha))}</div>
    <div id="dia-slots">${spinnerHtml}</div>
    <div class="field" style="margin-top:14px"><label>Motivo (opcional)</label>
      <input class="input" id="dia-motivo" list="dia-motivos" placeholder="Revisión, limpieza, dolor…" maxlength="255">
      <datalist id="dia-motivos"><option value="Revisión"></option><option value="Limpieza"></option><option value="Dolor / urgencia"></option><option value="Ortodoncia"></option><option value="Empaste"></option></datalist>
    </div>
    <div class="field"><label>Notas (opcional)</label><textarea class="input" id="dia-notas" rows="2"></textarea></div>
    <div class="auth__msg" id="dia-msg"></div>
    <button class="btn btn--block" id="dia-enviar" disabled>Solicitar cita este día</button>
    <button class="btn btn--ghost btn--block" id="dia-cerrar" style="margin-top:4px">Cancelar</button>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("#dia-cerrar").onclick = close;
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });

  const slotsEl = dlg.querySelector("#dia-slots");
  const enviar = dlg.querySelector("#dia-enviar");
  const msg = dlg.querySelector("#dia-msg");
  let horaSel = null;

  try {
    const { slots } = await api.huecos(fecha);
    if (!slots.some((s) => !s.ocupado)) {
      slotsEl.innerHTML = `<p class="slots-hint">No quedan huecos ese día. Prueba con otro.</p>`;
    } else {
      slotsEl.innerHTML = `<div class="slots">${slots.map((s) =>
        `<button type="button" class="slot" data-hora="${s.hora}" ${s.ocupado ? "disabled" : ""}>${s.hora}</button>`).join("")}</div>
        <p class="slots-hint">Los huecos son orientativos; la clínica confirmará la hora.</p>`;
      slotsEl.querySelectorAll(".slot:not([disabled])").forEach((b) => {
        b.onclick = () => {
          slotsEl.querySelectorAll(".slot").forEach((x) => x.classList.remove("slot--sel"));
          b.classList.add("slot--sel");
          horaSel = b.dataset.hora;
          enviar.disabled = false;
        };
      });
    }
  } catch (e) {
    slotsEl.innerHTML = `<p class="slots-hint" style="color:var(--danger)">${escapeHtml(e.message)}</p>`;
  }

  enviar.onclick = async () => {
    if (!horaSel) return;
    enviar.disabled = true; enviar.innerHTML = spinnerHtml;
    try {
      const r = await api.crearSolicitud({
        fecha, hora: horaSel,
        motivo: dlg.querySelector("#dia-motivo").value.trim(),
        notas: dlg.querySelector("#dia-notas").value.trim(),
      });
      close();
      toast(r.message || "Solicitud enviada ✓");
      ctx.go("citas");
    } catch (e) {
      enviar.disabled = false; enviar.innerHTML = "Solicitar cita este día";
      msg.className = "auth__msg auth__msg--error"; msg.textContent = e.message;
    }
  };
}

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
