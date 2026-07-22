// portal/js/views/tratamientos.js — lista de tratamientos con pagos (sin DataTables).
import { api } from "../api.js";
import { fmtMoney, fmtDateShort, spinnerHtml, escapeHtml } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root) {
  root.innerHTML = `<h1 class="view__title">Tratamientos</h1><div id="tr-body">${spinnerHtml}</div>`;
  const body = root.querySelector("#tr-body");
  try {
    const { tratamientos } = await api.tratamientos();
    body.innerHTML = tratamientos.length
      ? tratamientos.map(card).join("")
      : `<div class="empty">${ICON.treat}<p>Todavía no tienes tratamientos registrados.</p></div>`;
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

function badge(t) {
  const est = t.deuda <= 0 ? "pagado" : t.monto_pagado > 0 ? "parcial" : "pendiente";
  const label = est === "pagado" ? "Pagado" : est === "parcial" ? "Parcial" : "Pendiente";
  return `<span class="badge badge--${est}">${label}</span>`;
}

function card(t) {
  const total = t.monto_total || 0;
  const pagado = t.monto_pagado || 0;
  const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : t.deuda <= 0 ? 100 : 0;
  const pagos = (t.pagos || [])
    .map((p) => `<div class="pay__item"><span>${escapeHtml(fmtDateShort(p.fecha_pago))} · ${escapeHtml(p.metodo_pago || "—")}</span><b>${escapeHtml(fmtMoney(p.monto))}</b></div>`)
    .join("");
  return `<div class="card">
    <div class="treat__head">
      <div style="min-width:0">
        <div class="treat__name">${escapeHtml(t.diagnostico || "Tratamiento")}</div>
        <div class="treat__date">${escapeHtml(fmtDateShort(t.fecha) || "")}</div>
      </div>
      ${badge(t)}
    </div>
    ${t.observaciones ? `<p class="treat__obs">${escapeHtml(t.observaciones)}</p>` : ""}
    <div class="pay">
      <div class="pay__nums">
        <span class="pay__paid">${escapeHtml(fmtMoney(pagado))} pagado</span>
        <span class="pay__debt">${t.deuda > 0 ? escapeHtml(fmtMoney(t.deuda)) + " pendiente" : "Completado"}</span>
      </div>
      <div class="pay__bar"><span style="width:${pct}%"></span></div>
      ${pagos ? `<div class="pay__list">${pagos}</div>` : ""}
    </div>
  </div>`;
}
