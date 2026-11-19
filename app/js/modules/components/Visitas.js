// modules/components/Visitas.js
// Componente REUTILIZABLE de visitas.
//  - Ficha de paciente:  mountVisitas({ container, clientId })  -> visitas de ese paciente.
//  - Vista global:        mountVisitas({ container })            -> todas las visitas.
// La lista es la tabla comun del panel (Tabla.js): buscador, orden y paginacion.
// Aqui queda lo propio: alta (tambien global, con selector de paciente), edicion,
// borrado, filtro por paciente y rango de fechas, y el total cobrado de lo filtrado.
// Inyecta su propio modal; requiere Swal (SweetAlert2) y RemixIcon en la pagina.

import DB from "../classes/DB_API.js";
import { escapeHtml } from "../html.js";
import { euros } from "../formato.js";
import Tabla from "./Tabla.js";

let stylesInjected = false;
let modalEl = null;
const wiredContainers = new WeakSet();

// Estado del montaje actual (una vista de visitas por página).
const ctx = {
  clientId: null,
  container: null,
  tabla: null,
  editingId: null,
  visits: [],        // todas las visitas cargadas
  patients: null,    // cache de todos los pacientes (para el alta global)
  patientFilter: "",
  dateFrom: "",
  dateTo: ""
};

// ---------------- Estilos (una sola vez) ----------------
// Solo los filtros de fechas y el modal: la lista es la tabla comun (tabla.css).
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement("style");
  style.id = "visitas-styles";
  style.textContent = `
  .viz-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-top:16px; }
  .viz-toolbar .form__input { width:auto; }
  .viz-daterange { display:inline-flex; align-items:center; gap:6px; font-size:.8125rem; color:var(--hs-texto-suave); }

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
  ctx.patientFilter = ""; ctx.dateFrom = ""; ctx.dateTo = "";
  renderShell();
  await reload();
}

function renderShell() {
  const isPatient = !!ctx.clientId;
  const filtros = isPatient ? "" : `
      <div class="viz-toolbar">
        <select class="form__input form__input--select" id="viz-patient-filter" aria-label="Filtrar por paciente"><option value="">Todos los pacientes</option></select>
        <label class="viz-daterange">Desde <input type="date" class="form__input" id="viz-date-from"></label>
        <label class="viz-daterange">Hasta <input type="date" class="form__input" id="viz-date-to"></label>
      </div>`;
  ctx.container.innerHTML = `
    <div class="lista__cabecera">
      <div>
        <h3 class="container__heading">${isPatient ? "Visitas del paciente" : "Todas las visitas"}</h3>
        <p class="tarjeta__subtitulo" data-viz-total></p>
      </div>
      <div class="lista__acciones">
        <button type="button" class="boton boton--primario boton--pequeno" data-add><i class="ri-add-line" aria-hidden="true"></i> Registrar visita</button>
      </div>
    </div>
    ${filtros}
    <div data-viz-tabla></div>
  `;
  ctx.tabla = new Tabla(ctx.container.querySelector("[data-viz-tabla]"), {
    etiqueta: isPatient ? "Visitas del paciente" : "Visitas",
    registro: ["visita", "visitas"],
    vacio: "Sin visitas registradas todavía",
    buscador: { placeholder: isPatient ? "Buscar por doctor, tratamiento, nota…" : "Buscar por paciente, doctor, tratamiento…" },
    orden: { clave: "fecha", dir: "desc" },
    columnas: columnas(isPatient),
    acciones: (v) => `
      <button type="button" class="boton boton--icono boton--fantasma" data-edit="${escapeHtml(v.id)}" title="Editar" aria-label="Editar visita"><i class="ri-edit-line" aria-hidden="true"></i></button>
      <button type="button" class="boton boton--icono boton--fantasma" data-tono="peligro" data-del="${escapeHtml(v.id)}" title="Borrar" aria-label="Borrar visita"><i class="ri-delete-bin-line" aria-hidden="true"></i></button>`,
    // Total cobrado de lo que se ve (con buscador y filtros aplicados).
    alPintar: (visibles) => {
      const cobrado = visibles.reduce((s, v) => s + (parseFloat(v.pago_de_visita) || 0), 0);
      ctx.container.querySelector("[data-viz-total]").textContent = `Total cobrado: ${euros(cobrado)}`;
    },
  });
  wireContainerEvents();
}

function columnas(isPatient) {
  const comunes = [
    { clave: "fecha", titulo: "Fecha", tipo: "fecha", rol: isPatient ? "principal" : undefined },
    { clave: "tratamiento_nombre", titulo: "Tratamiento" },
    { clave: "doctor", titulo: "Doctor" },
    { clave: "observaciones", titulo: "Observaciones" },
    { clave: "pago_de_visita", titulo: "Pago", tipo: "dinero" },
  ];
  if (isPatient) return comunes;
  const nombre = (v) => v.cliente_nombre || ("Paciente #" + v.client_id);
  return [{
    clave: "cliente_nombre", titulo: "Paciente", rol: "principal", texto: nombre, valor: nombre,
    celda: (v) => `<a class="enlace" href="/pages/clientes/historia-clinica.html?id=${encodeURIComponent(v.client_id)}">${escapeHtml(nombre(v))}</a>`,
  }, ...comunes];
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
  const ed = e.target.closest("[data-edit]");
  if (ed) { openEdit(ed.dataset.edit); return; }
  const del = e.target.closest("[data-del]");
  if (del) { onDelete(del.dataset.del); return; }
}

function onContainerInput(e) {
  if (e.target.id === "viz-date-from") { ctx.dateFrom = e.target.value; aplicarFiltros(); }
  else if (e.target.id === "viz-date-to") { ctx.dateTo = e.target.value; aplicarFiltros(); }
}

function onContainerChange(e) {
  if (e.target.id === "viz-patient-filter") { ctx.patientFilter = e.target.value; aplicarFiltros(); }
}

async function reload() {
  ctx.tabla.cargando();
  const visits = ctx.clientId
    ? await DB.getVisitsByClientId(ctx.clientId)
    : await DB.getAllVisits();
  ctx.visits = visits || [];
  ctx.tabla.datos(ctx.visits);
  populatePatientFilter();
  aplicarFiltros();
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

// Filtro por paciente y rango de fechas (el texto lo busca la propia tabla).
function aplicarFiltros() {
  const { patientFilter, dateFrom, dateTo } = ctx;
  ctx.tabla.filtro(patientFilter || dateFrom || dateTo ? (v) => {
    const dia = (v.fecha || "").slice(0, 10);
    return (!patientFilter || String(v.client_id) === String(patientFilter))
      && (!dateFrom || dia >= dateFrom)
      && (!dateTo || dia <= dateTo);
  } : null);
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
