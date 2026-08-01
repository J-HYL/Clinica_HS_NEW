// portal/js/views/tratamientoDetalle.js — detalle de UN tratamiento.
// Arriba: anillo (donut) pagado vs pendiente. Debajo: los pagos como filas
// desplegables; cada una abre "Solicitar factura" / "Factura solicitada" /
// "Descargar factura" segun el estado. Se abre desde la card de Tratamientos o
// desde la notificacion de factura (ctx.detalle.pago -> despliega ese pago).
import { api } from "../api.js";
import { fmtMoney, fmtDateShort, spinnerHtml, escapeHtml, toast } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root, ctx) {
  const { id, pago } = ctx.detalle || {};
  root.innerHTML = `
    <div class="subhead">
      <button class="subhead__back" data-back aria-label="Volver">${ICON.back}</button>
      <h1>Tratamiento</h1>
    </div>
    <div id="td-body">${spinnerHtml}</div>`;
  root.querySelector("[data-back]").onclick = () => ctx.go("tratamientos");
  const body = root.querySelector("#td-body");
  try {
    const { tratamientos } = await api.tratamientos();
    const t = (tratamientos || []).find((x) => x.id === Number(id));
    if (!t) {
      body.innerHTML = `<div class="empty">${ICON.treat}<p>No se encontró el tratamiento.</p></div>`;
      return;
    }
    root.querySelector(".subhead h1").textContent = t.diagnostico || "Tratamiento";
    body.innerHTML = donut(t) + pagosSection(t.pagos || []);
    wire(body);
    if (pago) abrirPago(body, pago);
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

// ------------------------------------------------------------------ donut

function donut(t) {
  const total = Number(t.monto_total) || 0;
  const pagado = Number(t.monto_pagado) || 0;
  const deuda = Number(t.deuda) || 0;
  const f = total > 0 ? Math.max(0, Math.min(1, pagado / total)) : deuda <= 0 ? 1 : 0;
  const pct = Math.round(f * 100);
  const C = 2 * Math.PI * 52;
  const paid = (f * C).toFixed(1);
  return `<div class="card treat-donut">
    <svg class="donut" viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="${pct}% pagado">
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--separator)" stroke-width="12"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--ok)" stroke-width="12" stroke-linecap="round"
              stroke-dasharray="${paid} ${C.toFixed(1)}" transform="rotate(-90 60 60)"/>
      <text class="donut__pct" x="60" y="59" text-anchor="middle">${pct}%</text>
      <text class="donut__lbl" x="60" y="77" text-anchor="middle">pagado</text>
    </svg>
    <div class="treat-donut__legend">
      <div><span class="dot dot--paid"></span> <b>${escapeHtml(fmtMoney(pagado))}</b> <span class="muted">pagado</span></div>
      <div><span class="dot dot--debt"></span> <b>${escapeHtml(fmtMoney(deuda))}</b> <span class="muted">pendiente</span></div>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ pagos

function accionFactura(p) {
  if (p.factura_estado === "generada")
    return `<button class="btn btn--block" data-descargar="${p.id}">${ICON.download}<span>Descargar factura</span></button>`;
  if (p.factura_estado === "solicitada")
    return `<div class="pay-detail__wait">${ICON.clock}<span>Factura solicitada — pendiente de la clínica</span></div>`;
  return `<button class="btn btn--ghost btn--block" data-solicitar="${p.id}">${ICON.doc}<span>Solicitar factura</span></button>`;
}

function tagFor(p) {
  if (p.factura_estado === "generada") return `<span class="pay-row__tag pay-row__tag--done">Emitida</span>`;
  if (p.factura_estado === "solicitada") return `<span class="pay-row__tag pay-row__tag--wait">Solicitada</span>`;
  return "";
}

function pagoRow(p) {
  return `<div class="pay-row" data-pago="${p.id}">
    <button class="pay-row__head" aria-expanded="false">
      <span class="pay-row__info">
        <span class="pay-row__amt">${escapeHtml(fmtMoney(p.monto))}</span>
        <span class="pay-row__meta">${escapeHtml(fmtDateShort(p.fecha_pago))} · ${escapeHtml(p.metodo_pago || "—")}</span>
      </span>
      ${tagFor(p)}
      <span class="pay-row__chev">${ICON.chevron}</span>
    </button>
    <div class="pay-detail" hidden>${accionFactura(p)}</div>
  </div>`;
}

function pagosSection(pagos) {
  if (!pagos.length) {
    return `<div class="group-label">Pagos</div>
      <div class="card"><p style="color:var(--text-2)">Este tratamiento no tiene pagos registrados.</p></div>`;
  }
  return `<div class="group-label">Pagos</div>${pagos.map(pagoRow).join("")}`;
}

// ------------------------------------------------------------- interaccion

function toggle(row, open) {
  const head = row.querySelector(".pay-row__head");
  const detail = row.querySelector(".pay-detail");
  const show = open === undefined ? detail.hidden : open;
  detail.hidden = !show;
  head.setAttribute("aria-expanded", String(show));
  row.classList.toggle("pay-row--open", show);
}

function wire(body) {
  body.querySelectorAll(".pay-row__head").forEach((h) => {
    h.onclick = () => toggle(h.closest(".pay-row"));
  });
  body.querySelectorAll("[data-descargar]").forEach((b) => {
    b.onclick = () => window.open(api.facturaUrl(b.dataset.descargar), "_blank");
  });
  body.querySelectorAll("[data-solicitar]").forEach((b) => {
    b.onclick = () => solicitar(b);
  });
}

async function solicitar(btn) {
  const id = Number(btn.dataset.solicitar);
  btn.disabled = true;
  try {
    const r = await api.solicitarFactura(id);
    toast(r.message || "Factura solicitada");
    const detail = btn.closest(".pay-detail");
    detail.innerHTML = `<div class="pay-detail__wait">${ICON.clock}<span>Factura solicitada — pendiente de la clínica</span></div>`;
    // Refleja el estado en el cabecero de la fila.
    const head = btn.closest(".pay-row").querySelector(".pay-row__head");
    let tag = head.querySelector(".pay-row__tag");
    if (!tag) {
      tag = document.createElement("span");
      head.insertBefore(tag, head.querySelector(".pay-row__chev"));
    }
    tag.className = "pay-row__tag pay-row__tag--wait";
    tag.textContent = "Solicitada";
  } catch (e) {
    btn.disabled = false;
    toast(e.message, true);
  }
}

function abrirPago(body, pagoId) {
  const row = body.querySelector(`.pay-row[data-pago="${pagoId}"]`);
  if (!row) return;
  toggle(row, true);
  setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
}
