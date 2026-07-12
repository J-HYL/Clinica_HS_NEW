// modules/components/Visitas.js
// Componente REUTILIZABLE de visitas (tabla de datos completa).
//  - Ficha de paciente:  mountVisitas({ container, clientId })  -> visitas de ese paciente.
//  - Vista global:        mountVisitas({ container })            -> todas las visitas.
// Incluye: alta (también global, con selector de paciente), edición, borrado,
// buscador, filtro por paciente y rango de fechas, orden por columnas, paginación y stats.
// Inyecta su propio modal y estilos; requiere Swal (SweetAlert2) y RemixIcon en la página.

import DB from "../classes/DB_API.js";
import { escapeHtml } from "../html.js";

let stylesInjected = false;
let modalEl = null;
const wiredContainers = new WeakSet();

const PAGE_SIZES = [10, 25, 50, 100];

// Estado del montaje actual (una vista de visitas por página).
const ctx = {
  clientId: null,
  container: null,
  editingId: null,
  visits: [],        // todas las visitas cargadas
  view: [],          // tras filtros + orden
  patients: null,    // cache de todos los pacientes (para el alta global)
  sortKey: "fecha",
  sortDir: "desc",
  page: 1,
  pageSize: 10,
  search: "",
  patientFilter: "",
  dateFrom: "",
  dateTo: ""
};

// ---------------- Estilos (una sola vez) ----------------
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "visitas-styles";
  style.textContent = `
  .viz-wrap { margin-top: 8px; }
  .viz-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
  .viz-head h3 { margin:0; font-size:1.15rem; color:#1f2937; }
  .viz-add { display:inline-flex; align-items:center; gap:6px; background:#3b82f6; color:#fff; border:none; border-radius:8px; padding:9px 15px; font-size:.9rem; font-weight:600; cursor:pointer; transition:background .2s; }
  .viz-add:hover { background:#2563eb; }

  .viz-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px; }
  .viz-search, .viz-filter { padding:9px 12px; border:1px solid #d0d5dd; border-radius:8px; font-size:.9rem; background:#fff; }
  .viz-search { min-width:240px; flex:1 1 240px; max-width:360px; }
  .viz-daterange { display:inline-flex; align-items:center; gap:6px; font-size:.82rem; color:#667085; }
  .viz-daterange input { padding:7px 10px; border:1px solid #d0d5dd; border-radius:8px; font-size:.85rem; font-family:inherit; }

  .viz-stats { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .viz-chip { background:#eef2ff; color:#3730a3; border-radius:999px; padding:5px 12px; font-size:.82rem; }
  .viz-chip strong { color:#1e1b4b; }

  .viz-table-wrap { overflow-x:auto; border:1px solid #e6e8ef; border-radius:12px; }
  table.viz-table { width:100%; border-collapse:collapse; min-width:680px; background:#fff; }
  table.viz-table th, table.viz-table td { padding:11px 14px; text-align:left; border-bottom:1px solid #eef0f4; font-size:.9rem; vertical-align:top; }
  table.viz-table thead th { background:#f8f9fb; color:#667085; font-weight:600; font-size:.75rem; text-transform:uppercase; letter-spacing:.03em; white-space:nowrap; }
  table.viz-table th.viz-th-sort { cursor:pointer; user-select:none; }
  table.viz-table th.viz-th-sort:hover { color:#3b82f6; }
  table.viz-table th.viz-th-sort.is-active { color:#3b82f6; }
  table.viz-table tbody tr:last-child td { border-bottom:none; }
  table.viz-table tbody tr:hover { background:#f9fafb; }
  .viz-obs { max-width:280px; white-space:pre-wrap; word-break:break-word; color:#475467; }
  .viz-pago { font-weight:600; color:#059669; white-space:nowrap; }
  .viz-pago--none { color:#98a2b3; }
  .viz-link { color:#3b82f6; text-decoration:none; font-weight:600; }
  .viz-link:hover { text-decoration:underline; }
  .viz-actions { display:flex; gap:6px; }
  .viz-btn { width:32px; height:32px; border:none; border-radius:6px; cursor:pointer; display:grid; place-items:center; font-size:1rem; color:#fff; }
  .viz-btn--edit { background:#3b82f6; }
  .viz-btn--del { background:#ef4444; }
  .viz-empty { text-align:center; color:#98a2b3; padding:28px; }

  .viz-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-top:12px; font-size:.85rem; color:#667085; }
  .viz-foot-left { display:flex; align-items:center; gap:10px; }
  .viz-pagesize { padding:6px 8px; border:1px solid #d0d5dd; border-radius:8px; font-size:.82rem; background:#fff; }
  .viz-pager { display:flex; align-items:center; gap:4px; }
  .viz-pager button { border:1px solid #d0d5dd; background:#fff; color:#344054; border-radius:8px; padding:6px 11px; font-size:.85rem; cursor:pointer; }
  .viz-pager button:hover:not(:disabled) { background:#f2f4f7; }
  .viz-pager button:disabled { opacity:.45; cursor:default; }
  .viz-pageinfo { padding:0 8px; white-space:nowrap; }

  /* Modal */
  dialog.viz-modal { border:none; background:transparent; padding:0; margin:0; width:100vw; height:100vh; max-width:100vw; max-height:100vh; }
  dialog.viz-modal[open] { display:flex; align-items:center; justify-content:center; }
  dialog.viz-modal::backdrop { background:rgba(0,0,0,.5); }
  .viz-card { width:92vw; max-width:520px; max-height:92vh; background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(16,24,64,.25); display:flex; flex-direction:column; overflow:hidden; }
  .viz-mhead { display:flex; align-items:center; justify-content:space-between; padding:18px 22px; border-bottom:1px solid rgba(34,34,38,.08); }
  .viz-mhead h3 { margin:0; font-size:1.15rem; color:#1f2937; }
  .viz-close { background:none; border:none; font-size:1.5rem; line-height:1; cursor:pointer; color:#98a2b3; }
  .viz-body { padding:20px 22px; overflow-y:auto; display:flex; flex-direction:column; gap:16px; }
  .viz-field { display:flex; flex-direction:column; gap:6px; }
  .viz-field label { font-weight:600; font-size:.88rem; color:#344054; }
  .viz-field input, .viz-field select, .viz-field textarea { width:100%; padding:9px 12px; border:1px solid #d0d5dd; border-radius:8px; font-size:.92rem; font-family:inherit; box-sizing:border-box; }
  .viz-field textarea { min-height:70px; resize:vertical; }
  .viz-field input[readonly] { background:#f1f2f6; color:#667085; cursor:not-allowed; }
  .viz-hint { font-size:.78rem; color:#98a2b3; }
  .viz-mfoot { display:flex; justify-content:flex-end; gap:10px; padding:16px 22px; border-top:1px solid rgba(34,34,38,.08); background:#fafbfc; }
  .viz-mbtn { padding:9px 18px; border-radius:8px; font-size:.9rem; font-weight:600; cursor:pointer; border:1px solid transparent; }
  .viz-mbtn--cancel { background:#fff; border-color:#d0d5dd; color:#344054; }
  .viz-mbtn--save { background:#3b82f6; color:#fff; }
  .viz-mbtn--save:hover { background:#2563eb; }
  `;
  document.head.appendChild(style);
}

// ---------------- Modal (una sola vez) ----------------
function ensureModal() {
  if (modalEl) return modalEl;
  const dlg = document.createElement("dialog");
  dlg.className = "viz-modal";
  dlg.id = "visita-modal";
  dlg.innerHTML = `
    <div class="viz-card">
      <div class="viz-mhead">
        <h3 id="viz-mtitle">Registrar visita</h3>
        <button type="button" class="viz-close" data-viz-close aria-label="Cerrar">&times;</button>
      </div>
      <div class="viz-body">
        <div class="viz-field" id="viz-cliente-field" style="display:none;">
          <label for="viz-cliente">Paciente</label>
          <select id="viz-cliente"></select>
        </div>
        <div class="viz-field">
          <label for="viz-fecha">Fecha y hora</label>
          <input type="datetime-local" id="viz-fecha">
        </div>
        <div class="viz-field">
          <label for="viz-tratamiento">Tratamiento</label>
          <select id="viz-tratamiento"></select>
        </div>
        <div class="viz-field">
          <label for="viz-doctor">Doctor / Profesional</label>
          <input type="text" id="viz-doctor" maxlength="20" placeholder="Ej: Dr. Pérez">
        </div>
        <div class="viz-field">
          <label for="viz-obs">Observaciones</label>
          <textarea id="viz-obs" placeholder="Notas de la visita..."></textarea>
        </div>
        <div class="viz-field">
          <label for="viz-pago">Pago (opcional)</label>
          <input type="number" id="viz-pago" step="0.01" min="0" placeholder="Ej: 50.00">
          <span class="viz-hint" id="viz-pago-hint">Si indicas un importe, se registrará también como pago del tratamiento.</span>
        </div>
      </div>
      <div class="viz-mfoot">
        <button type="button" class="viz-mbtn viz-mbtn--cancel" data-viz-close>Cancelar</button>
        <button type="button" class="viz-mbtn viz-mbtn--save" id="viz-save">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);
  modalEl = dlg;
  dlg.querySelectorAll("[data-viz-close]").forEach(b => b.addEventListener("click", () => dlg.close()));
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  dlg.querySelector("#viz-save").addEventListener("click", onSave);
  // Al cambiar el paciente (alta global), recargar sus tratamientos.
  dlg.querySelector("#viz-cliente").addEventListener("change", e => populateTreatments(e.target.value));
  return dlg;
}

// ---------------- Montaje ----------------
export async function mountVisitas({ container, clientId = null } = {}) {
  if (!container) return;
  injectStyles();
  ensureModal();
  ctx.clientId = clientId ? String(clientId) : null;
  ctx.container = container;
  ctx.editingId = null;
  ctx.page = 1;
  ctx.search = ""; ctx.patientFilter = ""; ctx.dateFrom = ""; ctx.dateTo = "";
  ctx.sortKey = "fecha"; ctx.sortDir = "desc";
  renderShell();
  await reload();
}

function renderShell() {
  const isPatient = !!ctx.clientId;
  const filters = isPatient
    ? `<input type="text" class="viz-search" id="viz-search" placeholder="Buscar por doctor, tratamiento, nota...">`
    : `<input type="text" class="viz-search" id="viz-search" placeholder="Buscar por paciente, doctor, tratamiento...">
       <select class="viz-filter" id="viz-patient-filter"><option value="">Todos los pacientes</option></select>
       <label class="viz-daterange">Desde <input type="date" id="viz-date-from"></label>
       <label class="viz-daterange">Hasta <input type="date" id="viz-date-to"></label>`;
  ctx.container.innerHTML = `
    <div class="viz-wrap">
      <div class="viz-head">
        <h3>${isPatient ? "Visitas del paciente" : "Todas las visitas"}</h3>
        <button class="viz-add" data-add><i class="ri-add-line"></i> Registrar visita</button>
      </div>
      <div class="viz-toolbar">${filters}</div>
      <div class="viz-stats" id="viz-stats"></div>
      <div class="viz-table-wrap"><table class="viz-table" id="viz-table"></table></div>
      <div class="viz-foot" id="viz-foot"></div>
    </div>
  `;
  wireContainerEvents();
}

function wireContainerEvents() {
  if (wiredContainers.has(ctx.container)) return;
  wiredContainers.add(ctx.container);
  ctx.container.addEventListener("click", onContainerClick);
  ctx.container.addEventListener("input", onContainerInput);
  ctx.container.addEventListener("change", onContainerChange);
}

function onContainerClick(e) {
  const add = e.target.closest("[data-add]");
  if (add) { openCreate(); return; }
  const th = e.target.closest("[data-sort]");
  if (th) { toggleSort(th.dataset.sort); return; }
  const pg = e.target.closest("[data-page]");
  if (pg) { gotoPage(pg.dataset.page); return; }
  const ed = e.target.closest("[data-edit]");
  if (ed) { openEdit(ed.dataset.edit); return; }
  const del = e.target.closest("[data-del]");
  if (del) { onDelete(del.dataset.del); return; }
}

function onContainerInput(e) {
  if (e.target.id === "viz-search") { ctx.search = e.target.value; ctx.page = 1; refresh(); }
  else if (e.target.id === "viz-date-from") { ctx.dateFrom = e.target.value; ctx.page = 1; refresh(); }
  else if (e.target.id === "viz-date-to") { ctx.dateTo = e.target.value; ctx.page = 1; refresh(); }
}

function onContainerChange(e) {
  if (e.target.id === "viz-patient-filter") { ctx.patientFilter = e.target.value; ctx.page = 1; refresh(); }
  else if (e.target.hasAttribute("data-pagesize")) { ctx.pageSize = parseInt(e.target.value); ctx.page = 1; refresh(); }
}

async function reload() {
  const visits = ctx.clientId
    ? await DB.getVisitsByClientId(ctx.clientId)
    : await DB.getAllVisits();
  ctx.visits = visits || [];
  populatePatientFilter();
  refresh();
}

function populatePatientFilter() {
  if (ctx.clientId) return;
  const sel = ctx.container.querySelector("#viz-patient-filter");
  if (!sel) return;
  const seen = new Map();
  ctx.visits.forEach(v => {
    const key = String(v.client_id);
    if (!seen.has(key)) seen.set(key, v.cliente_nombre || ("Paciente #" + v.client_id));
  });
  const options = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  // Si el paciente filtrado ya no está, se resetea el filtro.
  if (ctx.patientFilter && !seen.has(ctx.patientFilter)) ctx.patientFilter = "";
  sel.innerHTML = `<option value="">Todos los pacientes</option>` +
    options.map(([id, name]) => `<option value="${id}"${id === ctx.patientFilter ? " selected" : ""}>${escapeHtml(name)}</option>`).join("");
}

// ---------------- Filtros / orden / render ----------------
function computeView() {
  let arr = ctx.visits.slice();
  if (ctx.patientFilter) arr = arr.filter(v => String(v.client_id) === String(ctx.patientFilter));
  if (ctx.dateFrom) arr = arr.filter(v => (v.fecha || "").slice(0, 10) >= ctx.dateFrom);
  if (ctx.dateTo) arr = arr.filter(v => (v.fecha || "").slice(0, 10) <= ctx.dateTo);
  const q = ctx.search.trim().toLowerCase();
  if (q) {
    arr = arr.filter(v =>
      `${v.cliente_nombre || ""} ${v.doctor || ""} ${v.tratamiento_nombre || ""} ${v.observaciones || ""}`
        .toLowerCase().includes(q));
  }
  arr.sort((a, b) => compareVisits(a, b, ctx.sortKey, ctx.sortDir));
  ctx.view = arr;
  const pages = Math.max(1, Math.ceil(arr.length / ctx.pageSize));
  if (ctx.page > pages) ctx.page = pages;
  if (ctx.page < 1) ctx.page = 1;
}

function compareVisits(a, b, key, dir) {
  let cmp;
  if (key === "fecha") {
    const va = a.fecha || "", vb = b.fecha || "";
    cmp = va < vb ? -1 : va > vb ? 1 : 0;
  } else if (key === "pago_de_visita") {
    cmp = (parseFloat(a.pago_de_visita) || 0) - (parseFloat(b.pago_de_visita) || 0);
  } else {
    // Texto (paciente, tratamiento, doctor): orden español (tildes/ñ) coherente con el desplegable.
    cmp = String(a[key] || "").localeCompare(String(b[key] || ""), "es", { sensitivity: "base" });
  }
  return dir === "desc" ? -cmp : cmp;
}

function toggleSort(key) {
  if (ctx.sortKey === key) ctx.sortDir = ctx.sortDir === "asc" ? "desc" : "asc";
  else { ctx.sortKey = key; ctx.sortDir = key === "fecha" ? "desc" : "asc"; }
  ctx.page = 1;
  refresh();
}

function gotoPage(dir) {
  const pages = Math.max(1, Math.ceil(ctx.view.length / ctx.pageSize));
  if (dir === "first") ctx.page = 1;
  else if (dir === "prev") ctx.page = Math.max(1, ctx.page - 1);
  else if (dir === "next") ctx.page = Math.min(pages, ctx.page + 1);
  else if (dir === "last") ctx.page = pages;
  refresh();
}

function refresh() {
  computeView();
  renderStats();
  renderTable();
  renderFooter();
}

function columns() {
  const isPatient = !!ctx.clientId;
  const cFecha = { label: "Fecha", key: "fecha", sortable: true, render: v => formatFechaVisita(v.fecha) };
  const cTrat = { label: "Tratamiento", key: "tratamiento_nombre", sortable: true, render: v => escapeHtml(v.tratamiento_nombre || "—") };
  const cDoctor = { label: "Doctor", key: "doctor", sortable: true, render: v => escapeHtml(v.doctor || "—") };
  const cObs = { label: "Observaciones", sortable: false, render: v => `<div class="viz-obs">${escapeHtml(v.observaciones || "—")}</div>` };
  const cPago = { label: "Pago", key: "pago_de_visita", sortable: true, render: v => pagoHtml(v) };
  const cActions = { label: "", sortable: false, render: v => actionsHtml(v) };
  if (isPatient) return [cFecha, cTrat, cDoctor, cObs, cPago, cActions];
  const cPaciente = {
    label: "Paciente", key: "cliente_nombre", sortable: true, render: v => {
      const nombre = v.cliente_nombre || ("Paciente #" + v.client_id);
      return `<a class="viz-link" href="/pages/clientes/historia-clinica.html?id=${v.client_id}">${escapeHtml(nombre)}</a>`;
    }
  };
  return [cPaciente, cFecha, cTrat, cDoctor, cObs, cPago, cActions];
}

function renderTable() {
  const cols = columns();
  const table = ctx.container.querySelector("#viz-table");
  if (!ctx.view.length) {
    const msg = ctx.visits.length ? "Ninguna visita coincide con el filtro." : "Sin visitas registradas todavía.";
    table.innerHTML = `<tbody><tr><td class="viz-empty">${msg}</td></tr></tbody>`;
    return;
  }
  const start = (ctx.page - 1) * ctx.pageSize;
  const rows = ctx.view.slice(start, start + ctx.pageSize);
  const head = `<thead><tr>${cols.map(c => {
    if (!c.sortable) return `<th>${c.label}</th>`;
    const active = ctx.sortKey === c.key;
    const arrow = active ? (ctx.sortDir === "asc" ? " ▲" : " ▼") : "";
    return `<th class="viz-th-sort${active ? " is-active" : ""}" data-sort="${c.key}">${c.label}${arrow}</th>`;
  }).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map(v => `<tr>${cols.map(c => `<td>${c.render(v)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  table.innerHTML = head + body;
}

function renderStats() {
  const el = ctx.container.querySelector("#viz-stats");
  const total = ctx.view.length;
  const cobrado = ctx.view.reduce((s, v) => s + (parseFloat(v.pago_de_visita) || 0), 0);
  el.innerHTML =
    `<span class="viz-chip"><strong>${total}</strong> ${total === 1 ? "visita" : "visitas"}</span>` +
    `<span class="viz-chip">Total cobrado: <strong>${cobrado.toFixed(2)} €</strong></span>`;
}

function renderFooter() {
  const el = ctx.container.querySelector("#viz-foot");
  const total = ctx.view.length;
  const pages = Math.max(1, Math.ceil(total / ctx.pageSize));
  const start = total ? (ctx.page - 1) * ctx.pageSize + 1 : 0;
  const end = Math.min(ctx.page * ctx.pageSize, total);
  const first = ctx.page <= 1 ? "disabled" : "";
  const last = ctx.page >= pages ? "disabled" : "";
  el.innerHTML = `
    <div class="viz-foot-left">
      <span>Mostrando ${start}–${end} de ${total}</span>
      <select class="viz-pagesize" data-pagesize>
        ${PAGE_SIZES.map(n => `<option value="${n}"${n === ctx.pageSize ? " selected" : ""}>${n} / pág.</option>`).join("")}
      </select>
    </div>
    <div class="viz-pager">
      <button type="button" data-page="first" ${first} title="Primera">«</button>
      <button type="button" data-page="prev" ${first}>‹ Anterior</button>
      <span class="viz-pageinfo">Página ${ctx.page} de ${pages}</span>
      <button type="button" data-page="next" ${last}>Siguiente ›</button>
      <button type="button" data-page="last" ${last} title="Última">»</button>
    </div>
  `;
}

function pagoHtml(v) {
  const tiene = v.pago_de_visita !== null && v.pago_de_visita !== undefined && v.pago_de_visita !== "";
  return tiene
    ? `<span class="viz-pago">${parseFloat(v.pago_de_visita).toFixed(2)} €</span>`
    : `<span class="viz-pago--none">—</span>`;
}

function actionsHtml(v) {
  return `<div class="viz-actions">
      <button class="viz-btn viz-btn--edit" data-edit="${v.id}" title="Editar"><i class="ri-edit-box-fill"></i></button>
      <button class="viz-btn viz-btn--del" data-del="${v.id}" title="Borrar"><i class="ri-delete-bin-fill"></i></button>
    </div>`;
}

// ---------------- Alta / edición ----------------
async function openCreate() {
  ctx.editingId = null;
  setTitle("Registrar visita");
  const clienteField = modalEl.querySelector("#viz-cliente-field");
  if (ctx.clientId) {
    clienteField.style.display = "none";
    await populateTreatments(ctx.clientId);
  } else {
    clienteField.style.display = "";
    await populatePatientSelect();
    await populateTreatments(modalEl.querySelector("#viz-cliente").value);
  }
  modalEl.querySelector("#viz-fecha").value = nowLocal();
  modalEl.querySelector("#viz-doctor").value = "";
  modalEl.querySelector("#viz-obs").value = "";
  const pago = modalEl.querySelector("#viz-pago");
  pago.value = "";
  pago.readOnly = false;
  modalEl.querySelector("#viz-pago-hint").style.display = "";
  modalEl.showModal();
}

async function openEdit(visitId) {
  const v = ctx.visits.find(x => String(x.id) === String(visitId));
  if (!v) return;
  ctx.editingId = v.id;
  setTitle("Editar visita");
  modalEl.querySelector("#viz-cliente-field").style.display = "none";
  await populateTreatments(v.client_id);
  modalEl.querySelector("#viz-fecha").value = toLocalInput(v.fecha);
  modalEl.querySelector("#viz-tratamiento").value = String(v.treatment_id);
  modalEl.querySelector("#viz-doctor").value = v.doctor || "";
  modalEl.querySelector("#viz-obs").value = v.observaciones || "";
  const pago = modalEl.querySelector("#viz-pago");
  const tiene = v.pago_de_visita !== null && v.pago_de_visita !== undefined && v.pago_de_visita !== "";
  pago.value = tiene ? parseFloat(v.pago_de_visita).toFixed(2) : "";
  pago.readOnly = true; // El pago no se edita aquí (se gestiona en Pagos del tratamiento).
  modalEl.querySelector("#viz-pago-hint").style.display = "none";
  modalEl.showModal();
}

async function getPatients() {
  if (ctx.patients) return ctx.patients;
  ctx.patients = (await DB.getRecords("clients")) || [];
  return ctx.patients;
}

async function populatePatientSelect() {
  const sel = modalEl.querySelector("#viz-cliente");
  const pts = await getPatients();
  sel.innerHTML = pts.length
    ? pts.map(p => `<option value="${p.id}">${escapeHtml(p.nombre || ("Paciente #" + p.id))}</option>`).join("")
    : `<option value="">(No hay pacientes)</option>`;
}

async function populateTreatments(clientId) {
  const sel = modalEl.querySelector("#viz-tratamiento");
  if (!clientId) { sel.innerHTML = `<option value="">(Selecciona un paciente)</option>`; return; }
  const treatments = await DB.getTreatmentsByClientId(clientId);
  if (!treatments || !treatments.length) {
    sel.innerHTML = `<option value="">(El paciente no tiene tratamientos)</option>`;
    return;
  }
  sel.innerHTML = treatments
    .map(t => `<option value="${t.id}">${escapeHtml(t.diagnostico || ("Tratamiento #" + t.id))}</option>`)
    .join("");
}

async function onSave() {
  const isEdit = !!ctx.editingId;
  const client_id = ctx.clientId ? parseInt(ctx.clientId) : parseInt(modalEl.querySelector("#viz-cliente").value);
  const fecha = modalEl.querySelector("#viz-fecha").value;
  const treatment_id = modalEl.querySelector("#viz-tratamiento").value;
  const doctor = modalEl.querySelector("#viz-doctor").value.trim();
  const observaciones = modalEl.querySelector("#viz-obs").value.trim();
  const pagoInput = modalEl.querySelector("#viz-pago");

  if (!isEdit && (!client_id || isNaN(client_id))) {
    Swal.fire({ icon: "warning", title: "Falta el paciente", text: "Selecciona el paciente de la visita." });
    return;
  }
  if (!treatment_id) {
    Swal.fire({ icon: "warning", title: "Falta tratamiento", text: "Selecciona el tratamiento. Si el paciente no tiene tratamientos, créale uno primero." });
    return;
  }
  if (!doctor) {
    Swal.fire({ icon: "warning", title: "Falta el doctor", text: "Indica el doctor o profesional de la visita." });
    return;
  }

  let pago = null;
  if (!pagoInput.readOnly && pagoInput.value !== "") {
    const p = parseFloat(pagoInput.value);
    if (isNaN(p) || p < 0) {
      Swal.fire({ icon: "warning", title: "Pago inválido", text: "Introduce un importe válido (0 o mayor)." });
      return;
    }
    pago = p > 0 ? p : null;
  }

  const saveBtn = modalEl.querySelector("#viz-save");
  saveBtn.disabled = true; // evitar doble envío (que crearía visitas duplicadas)
  try {
    Swal.fire({ title: isEdit ? "Guardando cambios..." : "Registrando visita...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    if (isEdit) {
      await DB.editRecord("visits", ctx.editingId, {
        treatment_id: parseInt(treatment_id),
        doctor,
        observaciones,
        fecha
      });
      modalEl.close();
      await reload();
      Swal.fire({ icon: "success", title: "Visita actualizada", timer: 1500, showConfirmButton: false });
    } else {
      const tratId = parseInt(treatment_id);
      const res = await DB.addRegister("visits", {
        client_id,
        treatment_id: tratId,
        doctor,
        observaciones,
        fecha,
        pago_de_visita: pago
      });
      if (!res || !res.success) throw new Error(res && res.error ? res.error : "No se pudo crear la visita");

      // La visita YA está creada. El pago es un paso posterior NO crítico: si falla,
      // NO reintentamos la visita (evita duplicados) y avisamos por separado.
      let pagoFallo = false;
      if (pago && pago > 0) {
        try {
          await DB.addRegister("payments", {
            treatment_id: tratId,
            client_id,
            monto_pagado: pago,
            metodo_pago: "Efectivo",
            notas: `Pago realizado durante visita con ${doctor}`
          });
        } catch (e) {
          pagoFallo = true;
          console.error("La visita se creó pero falló el registro del pago:", e);
        }
      }

      modalEl.close();
      await reload();
      if (pagoFallo) {
        Swal.fire({ icon: "warning", title: "Visita registrada (sin el pago)", text: "La visita se guardó, pero el pago no se pudo registrar. Regístralo desde la sección de Pagos del tratamiento." });
      } else {
        Swal.fire({ icon: "success", title: "Visita registrada", timer: 1500, showConfirmButton: false });
      }
    }
  } catch (err) {
    console.error("Error al guardar la visita:", err);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudo guardar la visita: " + (err.message || err) });
  } finally {
    saveBtn.disabled = false;
  }
}

async function onDelete(visitId) {
  const r = await Swal.fire({
    title: "¿Borrar visita?",
    text: "Se eliminará el registro de la visita. (El pago asociado, si lo hubo, se gestiona aparte en Pagos.)",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#ef4444",
    confirmButtonText: "Sí, borrar",
    cancelButtonText: "Cancelar"
  });
  if (!r.isConfirmed) return;
  try {
    await DB.deleteRecord("visits", visitId);
    await reload();
    Swal.fire({ icon: "success", title: "Visita borrada", timer: 1200, showConfirmButton: false });
  } catch (err) {
    console.error("Error al borrar la visita:", err);
    Swal.fire({ icon: "error", title: "Error", text: "No se pudo borrar la visita." });
  }
}

// ---------------- Helpers ----------------
function setTitle(t) { modalEl.querySelector("#viz-mtitle").textContent = t; }

function nowLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toLocalInput(dbDate) {
  if (!dbDate) return nowLocal();
  return String(dbDate).replace(" ", "T").slice(0, 16);
}

function formatFechaVisita(value) {
  if (!value) return "—";
  const [datePart, timePart = ""] = String(value).replace("T", " ").split(" ");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d || y === "0000") return "—";
  const [hh, mm] = timePart.split(":");
  return `${d}/${m}/${y}` + (hh && mm ? ` ${hh}:${mm}` : "");
}

