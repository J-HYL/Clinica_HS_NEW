// portal/js/views/notificaciones.js — avisos del paciente (confirmaciones, contraofertas…).
import { api } from "../api.js";
import { spinnerHtml, escapeHtml, toast, fmtDateLong, fmtTime, parseDbDate } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root, ctx) {
  root.innerHTML = `
    <div class="subhead">
      <button class="subhead__back" data-back aria-label="Volver">${ICON.back}</button>
      <h1>Notificaciones</h1>
    </div>
    <div id="nt-body">${spinnerHtml}</div>`;
  root.querySelector("[data-back]").onclick = () => ctx.go("inicio");
  const body = root.querySelector("#nt-body");
  try {
    const { notificaciones } = await api.notificaciones();
    // Marca todo como leído y refresca el badge de la campana.
    api.marcarLeidas().then(() => ctx.refreshBadge && ctx.refreshBadge()).catch(() => {});
    if (!notificaciones.length) {
      body.innerHTML = `<div class="empty">${ICON.bell}<p>No tienes notificaciones.</p></div>`;
      return;
    }
    body.innerHTML = notificaciones.map(card).join("");
    body.querySelectorAll("[data-acc]").forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.dataset.id);
        const acepta = b.dataset.si === "1";
        body.querySelectorAll("[data-acc]").forEach((x) => (x.disabled = true));
        try {
          const r = await api.responderContraoferta(id, acepta);
          toast(r.message || "Hecho");
          render(root, ctx);
        } catch (e) {
          toast(e.message, true);
          body.querySelectorAll("[data-acc]").forEach((x) => (x.disabled = false));
        }
      };
    });
    // Aviso de factura -> abre el detalle del tratamiento con ese pago desplegado.
    body.querySelectorAll("[data-verfactura]").forEach((b) => {
      b.onclick = () => ctx.verTratamiento(Number(b.dataset.tid), { pago: Number(b.dataset.pid) });
    });
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

function iconFor(tipo) {
  if (tipo === "cita_confirmada") return `<span class="notif__ic notif__ic--ok">${ICON.check}</span>`;
  if (tipo === "cita_rechazada") return `<span class="notif__ic notif__ic--no">${ICON.x}</span>`;
  if (tipo === "cita_contraoferta") return `<span class="notif__ic notif__ic--wait">${ICON.clock}</span>`;
  if (tipo === "factura_emitida") return `<span class="notif__ic notif__ic--ok">${ICON.treat}</span>`;
  return `<span class="notif__ic notif__ic--wait">${ICON.bell}</span>`;
}

function card(n) {
  const fecha = parseDbDate(n.created_at) ? escapeHtml(fmtDateLong(n.created_at)) : "";
  let extra = "";
  if (n.accionable && n.fecha_propuesta) {
    extra = `
      <div class="notif__msg" style="margin-top:8px;font-weight:600;color:var(--text)">
        Nueva hora: ${escapeHtml(fmtDateLong(n.fecha_propuesta))} a las ${escapeHtml(fmtTime(n.fecha_propuesta))} h
      </div>
      <div class="notif__actions">
        <button class="btn" data-acc data-id="${n.solicitud_id}" data-si="1">Aceptar</button>
        <button class="btn btn--ghost" data-acc data-id="${n.solicitud_id}" data-si="0">Rechazar</button>
      </div>`;
  } else if (n.tipo === "factura_emitida" && n.payment_id && n.treatment_id) {
    extra = `<div class="notif__actions">
        <button class="btn" data-verfactura data-tid="${n.treatment_id}" data-pid="${n.payment_id}">Ver mi factura</button>
      </div>`;
  }
  return `<div class="notif ${n.leida ? "" : "notif--unread"}">
    ${iconFor(n.tipo)}
    <div class="notif__body">
      <div class="notif__title">${escapeHtml(n.titulo)}</div>
      ${n.mensaje ? `<div class="notif__msg">${escapeHtml(n.mensaje)}</div>` : ""}
      <div class="notif__time">${fecha}</div>
      ${extra}
    </div>
  </div>`;
}
