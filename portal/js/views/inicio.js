// portal/js/views/inicio.js — pantalla de Inicio (resumen).
import { api } from "../api.js";
import { fmtMoney, relDay, fmtTime, spinnerHtml, escapeHtml, nombrePila } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root, ctx) {
  const nom = nombrePila(ctx.cliente?.nombre);
  root.innerHTML = `
    <h1 class="view__title">Hola${nom ? ", " + escapeHtml(nom) : ""} 👋</h1>
    <p class="view__hi">Este es tu portal de paciente</p>
    <div id="inicio-body">${spinnerHtml}</div>`;
  const body = root.querySelector("#inicio-body");
  try {
    const d = await api.inicio();
    body.innerHTML = heroCita(d.proxima_cita) + heroDeuda(d.deuda_total, d.con_deuda) + accesos();
    body.querySelector("[data-pedir]").onclick = () => ctx.pedirCita();
    body.querySelector('[data-go="tratamientos"]').onclick = () => ctx.go("tratamientos");
    body.querySelector('[data-go="citas"]').onclick = () => ctx.go("citas");
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

function heroCita(c) {
  if (!c) {
    return `<div class="card"><span class="card__label">Próxima cita</span>
      <p style="margin-top:8px;color:var(--text-2)">No tienes ninguna cita programada.</p></div>`;
  }
  return `<div class="hero">
    <div class="hero__label">Próxima cita</div>
    <div class="hero__big">${escapeHtml(relDay(c.fecha))}</div>
    <div class="hero__sub">a las ${escapeHtml(fmtTime(c.fecha))} h</div>
  </div>`;
}

function heroDeuda(total, con) {
  if (!total || total <= 0) {
    return `<div class="hero hero--clear">
      <div class="hero__label">Tu cuenta</div>
      <div class="hero__big">Estás al día</div>
      <div class="hero__sub">No tienes pagos pendientes</div>
    </div>`;
  }
  return `<div class="hero hero--debt">
    <div class="hero__label">Pendiente de pago</div>
    <div class="hero__big">${escapeHtml(fmtMoney(total))}</div>
    <div class="hero__sub">${con} tratamiento${con === 1 ? "" : "s"} con saldo</div>
  </div>`;
}

function acceso(attr, icon, title, sub) {
  return `<button class="card card--tight" ${attr} style="width:100%;text-align:left;display:flex;align-items:center;gap:12px">
    <span class="acc-ic">${icon}</span>
    <span style="flex:1;min-width:0"><b>${title}</b><br><span style="color:var(--text-2);font-size:13px">${sub}</span></span>
    <span class="acc-chev">${ICON.chevron}</span>
  </button>`;
}

function accesos() {
  return (
    acceso("data-pedir", ICON.calendarPlus, "Pedir cita", "Solicita una cita a la clínica") +
    acceso('data-go="tratamientos"', ICON.treat, "Mis tratamientos", "Estado y pagos") +
    acceso('data-go="citas"', ICON.calendar, "Mis citas", "Agenda e historial")
  );
}
