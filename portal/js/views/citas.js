// portal/js/views/citas.js — agenda del paciente (timeline, sin DataTables).
import { api } from "../api.js";
import { relDay, fmtTime, parseDbDate, spinnerHtml, escapeHtml } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root, ctx) {
  root.innerHTML = `
    <h1 class="view__title">Citas</h1>
    <button class="btn" data-pedir style="margin:2px 0 16px">${ICON.calendarPlus}<span>Pedir cita</span></button>
    <div id="ci-body">${spinnerHtml}</div>`;
  root.querySelector("[data-pedir]").onclick = () => ctx.pedirCita();
  const body = root.querySelector("#ci-body");
  try {
    const { citas } = await api.citas();
    if (!citas.length) {
      body.innerHTML = `<div class="empty">${ICON.calendar}<p>No tienes citas registradas todavía.</p></div>`;
      return;
    }
    const now = Date.now();
    const prox = [], pasadas = [];
    citas.forEach((c) => {
      const d = parseDbDate(c.fecha);
      const cancel = (c.estado || "").toLowerCase().includes("cancel");
      if (d && d.getTime() >= now && !cancel) prox.push(c);
      else pasadas.push(c);
    });
    prox.reverse(); // ascendente: la mas proxima primero
    body.innerHTML =
      (prox.length ? `<div class="group-label">Próximas</div><div class="tl">${prox.map(item).join("")}</div>` : "") +
      (pasadas.length ? `<div class="group-label">Historial</div><div class="tl">${pasadas.map(item).join("")}</div>` : "");
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

function item(c) {
  const est = (c.estado || "").toLowerCase();
  const dot = est.includes("cancel") ? "tl__dot--cancel" : est.includes("complet") ? "tl__dot--done" : "";
  const badge = est.includes("cancel")
    ? '<span class="badge badge--pendiente">Cancelada</span>'
    : est.includes("complet")
    ? '<span class="badge badge--pagado">Completada</span>'
    : '<span class="badge badge--parcial">Pendiente</span>';
  return `<div class="tl__item"><span class="tl__dot ${dot}"></span>
    <div class="cita">
      <div><div class="cita__day">${escapeHtml(relDay(c.fecha))}</div><div class="cita__time">${escapeHtml(fmtTime(c.fecha))} h</div></div>
      ${badge}
    </div>
  </div>`;
}
