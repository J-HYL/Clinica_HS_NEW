import {
  setTableEventsListeners,
  showRecords,
  formatFecha
} from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";
import DB from "../../modules/classes/DB_API.js";
import { openModal } from "../../modules/components/Modal.js";
import { mountVisitas } from "../../modules/components/Visitas.js";

const crearTratamientoBtn = document.getElementById("crear-tratamiento");
const modal = document.getElementById("edit-modal");

const generalCheckbox = document.querySelector('input[name="piezas[]"][value="general"]');
const toothCheckboxes = document.querySelectorAll('input[name="piezas[]"]:not([value="general"])');
const guardarTratamientoBtn = document.getElementById("guardar-tratamiento");

const modalHeading = modal.querySelector(".modal__heading");
const diagnosticoSelect = document.getElementById("diagnostico");
const customTreatmentWrapper = document.getElementById("customTreatmentWrapper");
const customTreatmentInput = document.getElementById("customTreatmentInput");
const observacionesInput = document.getElementById("observaciones");
const montoTotalInput = document.getElementById("monto_total");
const montoPagadoInput = document.getElementById("monto_pagado");
const montoPagadoLabel = document.querySelector('label[for="monto_pagado"]');

// Estado del modal: null = creando; un id = editando ese tratamiento.
let editingTreatmentId = null;
let editingPieces = [];        // piezas actuales del tratamiento en edición
let editingMontoPagado = 0;    // abonado actual (no editable: se gestiona desde pagos)

// ---- Helpers de formulario ----

function resetFormPiezas() {
  document.querySelector('.form').reset();
  generalCheckbox.checked = false;
  toothCheckboxes.forEach(checkbox => {
    checkbox.checked = false;
    checkbox.disabled = false;
    checkbox.style.background = "#f0f0f0";
  });
  customTreatmentWrapper.style.display = "none";
}

// Deja el formulario listo para CREAR un tratamiento nuevo.
function setCreateMode() {
  editingTreatmentId = null;
  editingPieces = [];
  editingMontoPagado = 0;
  modalHeading.textContent = "Crear Tratamiento";
  montoPagadoInput.readOnly = false;
  montoPagadoLabel.textContent = "Abonado";
  resetFormPiezas();
}

// Devuelve las piezas seleccionadas: ["General"] o la lista de dientes marcados.
function getSelectedPiezas() {
  if (generalCheckbox.checked) return ["General"];
  const piezas = [];
  toothCheckboxes.forEach(cb => { if (cb.checked) piezas.push(cb.value); });
  return piezas;
}

// Lee el tipo de tratamiento (select o "otro"). Devuelve null si falta el personalizado.
function resolveDiagnostico() {
  let diagnostico = diagnosticoSelect.value;
  if (diagnostico === "otro") {
    const custom = customTreatmentInput.value.trim();
    if (!custom) {
      Swal.fire({
        icon: "warning",
        title: "Falta tratamiento personalizado",
        text: "Por favor, escribe el nombre del tratamiento personalizado.",
      });
      return null;
    }
    diagnostico = custom;
  }
  return diagnostico;
}

// Aplica la vista de la tabla de tratamientos (columnas ocultas, filtro por paciente
// y cálculo de la deuda total). Se registra ANTES de que DataTable se inicialice.
function applyTreatmentsTableView(patientId) {
  $('#table').one('init.dt', function () {
    const dataTable = $('#table').DataTable();
    dataTable.columns([0, 1, 7, 8, 9, 10]).visible(false);
    dataTable.column(1).search('^' + patientId + '$', true, false).draw();

    const deudaPacienteSpan = document.getElementById("deuda-paciente");
    let totalDeuda = 0;
    const filteredTreatments = dataTable.rows({ search: 'applied' }).data().toArray();
    if (filteredTreatments.length > 0) {
      totalDeuda = filteredTreatments.reduce((sum, treatment) => sum + parseFloat(treatment.deuda || 0), 0);
    }
    if (deudaPacienteSpan) {
      deudaPacienteSpan.textContent = `${totalDeuda.toFixed(2)} €`;
    }
  });
}

// ---- Apertura del modal ----

crearTratamientoBtn.addEventListener("click", (e) => {
  e.preventDefault();
  setCreateMode();
  openModal();
});

// Carga un tratamiento existente en el modal para editarlo.
async function openEditTreatment(id) {
  try {
    const [treatment, pieces] = await Promise.all([
      DB.getRecord("treatments", id),
      DB.getPiecesByTreatmentId(id)
    ]);

    editingTreatmentId = id;
    editingPieces = Array.isArray(pieces) ? pieces : [];
    editingMontoPagado = parseFloat(treatment.monto_pagado || 0);

    resetFormPiezas();
    modalHeading.textContent = "Editar Tratamiento";

    // Tipo: si coincide con una opción del select, se selecciona;
    // si no, es un tratamiento personalizado -> "otro" + input.
    const opciones = Array.from(diagnosticoSelect.options).map(o => o.value);
    if (opciones.includes(treatment.diagnostico)) {
      diagnosticoSelect.value = treatment.diagnostico;
      customTreatmentWrapper.style.display = "none";
    } else {
      diagnosticoSelect.value = "otro";
      customTreatmentWrapper.style.display = "block";
      customTreatmentInput.value = treatment.diagnostico || "";
    }

    observacionesInput.value = treatment.observaciones || "";
    montoTotalInput.value = treatment.monto_total ?? "";

    // Abonado: solo lectura en edición (se cambia desde el Historial de pagos).
    montoPagadoInput.value = editingMontoPagado.toFixed(2);
    montoPagadoInput.readOnly = true;
    montoPagadoLabel.textContent = "Abonado (se gestiona desde pagos)";

    // Marcar las piezas actuales del tratamiento.
    const tieneGeneral = editingPieces.some(p => String(p.tooth_number) === "General");
    if (tieneGeneral) {
      generalCheckbox.checked = true;
      toothCheckboxes.forEach(cb => {
        cb.disabled = true;
        cb.checked = false;
        cb.style.background = "#70b3fa";
      });
    } else {
      const marcados = new Set(editingPieces.map(p => String(p.tooth_number)));
      toothCheckboxes.forEach(cb => { cb.checked = marcados.has(cb.value); });
    }

    openModal();
  } catch (error) {
    console.error("Error al cargar el tratamiento para editar:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el tratamiento para editar."
    });
  }
}

document.querySelector(".modal__close").addEventListener("click", () => {
  modal.close();
});
document.querySelector(".modal__button--close").addEventListener("click", () => {
  modal.close();
});

// ---- Carga inicial ----

document.addEventListener("DOMContentLoaded", async () => {
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("id");
  const deudaPacienteSpan = document.getElementById("deuda-paciente");

  if (!patientId) {
    console.warn("No se encontró ID en la URL");
    return;
  }

  try {
    const pacienteData = await DB.getRecord('clients', patientId);
    if (!pacienteData) throw new Error("Paciente no encontrado");

    document.getElementById('nombre-paciente').textContent = pacienteData.nombre || 'No disponible';
    document.getElementById('email-paciente').textContent = pacienteData.email || 'No disponible';
    document.getElementById('telefono-paciente').textContent = pacienteData.telefono || 'No disponible';
    document.getElementById('fecha-alta-paciente').textContent = pacienteData.Alta ? formatFecha(pacienteData.Alta) : 'No disponible';
    document.getElementById('alergias').textContent = pacienteData.alergias || 'No disponible';
    document.getElementById('edad').textContent = ' ' + pacienteData.edad || 'No disponible';
    document.title = `Historia Clínica - ${pacienteData.nombre}`;

    await showRecords("treatments");
    applyTreatmentsTableView(patientId);

    // Sección de visitas del paciente (componente reutilizable)
    mountVisitas({ container: document.getElementById("visitas-section"), clientId: patientId });

  } catch (error) {
    console.error("Error al cargar datos del paciente o tratamientos:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: `No se pudieron cargar los datos: ${error.message}`
    });
    if (deudaPacienteSpan) {
      deudaPacienteSpan.textContent = `Error`;
    }
  }
});

// "General" deshabilita/marca todos los dientes concretos.
generalCheckbox.addEventListener('change', function () {
  if (this.checked) {
    toothCheckboxes.forEach(checkbox => {
      checkbox.disabled = true;
      checkbox.checked = false;
      checkbox.style.background = "#70b3fa";
    });
  } else {
    toothCheckboxes.forEach(checkbox => {
      checkbox.disabled = false;
      checkbox.style.background = "#f0f0f0";
    });
  }
});

// Mostrar el input de tratamiento personalizado al elegir "otro".
diagnosticoSelect.addEventListener('change', () => {
  customTreatmentWrapper.style.display = diagnosticoSelect.value === 'otro' ? 'block' : 'none';
});

// ---- Guardar (crear o editar) ----

guardarTratamientoBtn.addEventListener("click", async (e) => {
  e.preventDefault();
  if (editingTreatmentId) {
    await guardarEdicionTratamiento();
  } else {
    await guardarNuevoTratamiento();
  }
});

async function guardarNuevoTratamiento() {
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("id");

  if (!patientId) {
    Swal.fire({ icon: "error", title: "Error", text: "No se encontró el ID del paciente en la URL" });
    return;
  }

  const diagnostico = resolveDiagnostico();
  if (diagnostico === null) return;

  const observaciones = observacionesInput.value;
  const total = parseFloat(montoTotalInput.value);
  const abonado = parseFloat(montoPagadoInput.value) || 0;

  if (!diagnostico || isNaN(total)) {
    Swal.fire({
      icon: "warning",
      title: "Campos incompletos o inválidos",
      text: "Por favor, rellena los campos obligatorios (Tratamiento y Monto total) con valores numéricos válidos."
    });
    return;
  }

  const tratamiento = {
    client_id: patientId,
    diagnostico,
    observaciones,
    monto_total: total,
    monto_pagado: abonado,
    deuda: total - abonado,
    estado: abonado === total ? "pagado" : abonado === 0 ? "pendiente" : "parcial",
  };

  try {
    const responseTreatment = await DB.addRegister("treatments", tratamiento);
    const newTreatmentId = responseTreatment.id;

    const piezasSeleccionadas = getSelectedPiezas();
    if (piezasSeleccionadas.length > 0) {
      for (const toothNumber of piezasSeleccionadas) {
        await DB.addRegister("pieces", {
          treatment_id: newTreatmentId,
          tooth_number: toothNumber,
          piece_status: 1
        });
      }
    } else {
      console.warn("No se seleccionó ninguna pieza para el tratamiento.");
    }

    Swal.fire({
      icon: "success",
      title: "Tratamiento y piezas guardadas",
      text: "El tratamiento y las piezas se han guardado correctamente."
    });
    modal.close();
    setCreateMode();

    await showRecords("treatments");
    applyTreatmentsTableView(patientId);

  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Error al guardar",
      text: `Hubo un error al guardar el tratamiento o las piezas: ${err.message}`
    });
    console.error("Error completo:", err);
  }
}

async function guardarEdicionTratamiento() {
  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("id");

  const diagnostico = resolveDiagnostico();
  if (diagnostico === null) return;

  const observaciones = observacionesInput.value;
  const total = parseFloat(montoTotalInput.value);

  if (!diagnostico || isNaN(total)) {
    Swal.fire({
      icon: "warning",
      title: "Campos incompletos o inválidos",
      text: "Por favor, rellena el tipo de tratamiento y un precio total válido."
    });
    return;
  }

  // La deuda y el estado se recalculan sobre el abonado ya existente (no se toca el abonado).
  const abonado = editingMontoPagado;
  const deuda = Math.max(0, total - abonado);
  const estado = (deuda === 0 && total > 0) ? "pagado" : abonado === 0 ? "pendiente" : "parcial";

  const cambios = {
    diagnostico,
    observaciones,
    monto_total: total,
    deuda,
    estado
  };

  try {
    Swal.fire({ title: 'Guardando cambios...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    await DB.editRecord("treatments", editingTreatmentId, cambios);
    await reconcilePiezas(editingTreatmentId, editingPieces, getSelectedPiezas());

    modal.close();
    setCreateMode();

    await showRecords("treatments");
    applyTreatmentsTableView(patientId);

    Swal.fire({
      icon: "success",
      title: "Tratamiento actualizado",
      text: "Los cambios se han guardado correctamente."
    });
  } catch (err) {
    console.error("Error al actualizar el tratamiento:", err);
    Swal.fire({
      icon: "error",
      title: "Error al guardar",
      text: `No se pudo actualizar el tratamiento: ${err.message}`
    });
  }
}

// Ajusta las piezas del tratamiento al conjunto deseado, conservando el estado
// (pendiente/completada) de las piezas que se mantienen: solo borra las quitadas
// y crea las nuevas (como pendientes).
async function reconcilePiezas(treatmentId, existingPieces, desiredToothNumbers) {
  const existingByTooth = new Map(existingPieces.map(p => [String(p.tooth_number), p]));
  const desiredSet = new Set(desiredToothNumbers.map(String));

  for (const [tooth, piece] of existingByTooth) {
    if (!desiredSet.has(tooth)) {
      await DB.deleteRecord("pieces", piece.id);
    }
  }
  for (const tooth of desiredSet) {
    if (!existingByTooth.has(tooth)) {
      await DB.addRegister("pieces", {
        treatment_id: treatmentId,
        tooth_number: tooth,
        piece_status: 1
      });
    }
  }
}

// ---- Acciones de la tabla ----

table.addEventListener("click", e => {
  const editBtn = e.target.closest(".table__btn--edit-treatment");
  if (editBtn) {
    openEditTreatment(editBtn.dataset.id);
    return;
  }
  setTableEventsListeners(e, "treatments");
});

// ---- Pestañas Tratamientos / Visitas ----
const tabButtons = document.querySelectorAll(".tab");
const panelTratamientos = document.getElementById("panel-tratamientos");
const panelVisitas = document.getElementById("panel-visitas");
tabButtons.forEach(tab => {
  tab.addEventListener("click", () => {
    const target = tab.dataset.tab;
    tabButtons.forEach(t => t.classList.toggle("tab--active", t === tab));
    if (panelTratamientos) panelTratamientos.hidden = target !== "tratamientos";
    if (panelVisitas) panelVisitas.hidden = target !== "visitas";
    // Al volver a Tratamientos, recalcular anchos de la DataTable (estuvo oculta).
    if (target === "tratamientos" && window.$ && $.fn.DataTable && $.fn.DataTable.isDataTable("#table")) {
      $("#table").DataTable().columns.adjust();
    }
  });
});
