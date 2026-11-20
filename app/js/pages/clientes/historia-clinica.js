import {
  setTableEventsListeners,
  showTreatmentsByClientId
} from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";
import DB from "../../modules/classes/DB_API.js";
import { mountVisitas } from "../../modules/components/Visitas.js";
import { euros, formatFecha, iniciales } from "../../modules/formato.js";

const patientId = new URLSearchParams(window.location.search).get("id");

const crearTratamientoBtn = document.getElementById("crear-tratamiento");
const modal = document.getElementById("edit-modal");
const formTratamiento = document.getElementById("form-tratamiento");

const generalCheckbox = modal.querySelector('input[name="piezas[]"][value="general"]');
const toothCheckboxes = modal.querySelectorAll('input[name="piezas[]"]:not([value="general"])');
const guardarTratamientoBtn = document.getElementById("guardar-tratamiento");

const modalHeading = modal.querySelector(".modal__heading");
const diagnosticoSelect = document.getElementById("diagnostico");
const customTreatmentWrapper = document.getElementById("customTreatmentWrapper");
const customTreatmentInput = document.getElementById("customTreatmentInput");
const observacionesInput = document.getElementById("observaciones");
const montoTotalInput = document.getElementById("monto_total");
const montoPagadoInput = document.getElementById("monto_pagado");
const montoPagadoLabel = modal.querySelector('label[for="monto_pagado"]');

// Estado del modal: null = creando; un id = editando ese tratamiento.
let editingTreatmentId = null;
let editingPieces = [];        // piezas actuales del tratamiento en edición
let editingMontoPagado = 0;    // abonado actual (no editable: se gestiona desde pagos)

// "Nuevo presupuesto" abre el editor de presupuestos con este paciente ya elegido.
if (patientId) {
  document.getElementById("nuevo-presupuesto").href =
    `/pages/Presupuestos/presupuesto.html?paciente=${encodeURIComponent(patientId)}`;
}

// ---- Helpers de formulario ----

// El nombre libre del tratamiento solo se pide con "Otro...".
function mostrarTratamientoPersonalizado(mostrar) {
  customTreatmentWrapper.classList.toggle("form__group--hidden", !mostrar);
}

// "General" = toda la boca: los dientes sueltos quedan incluidos y bloqueados.
function bloquearDientes(bloquear) {
  toothCheckboxes.forEach(checkbox => {
    checkbox.disabled = bloquear;
    if (bloquear) checkbox.checked = false;
  });
}

function resetFormPiezas() {
  formTratamiento.reset();
  generalCheckbox.checked = false;
  bloquearDientes(false);
  mostrarTratamientoPersonalizado(false);
}

// Deja el formulario listo para CREAR un tratamiento nuevo.
function setCreateMode() {
  editingTreatmentId = null;
  editingPieces = [];
  editingMontoPagado = 0;
  modalHeading.textContent = "Crear tratamiento";
  guardarTratamientoBtn.textContent = "Crear tratamiento";
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

// Carga los tratamientos del paciente en la tabla y pone su deuda total en la ficha.
async function cargarTratamientos(patientId) {
  const tabla = await showTreatmentsByClientId(patientId);
  const totalDeuda = (tabla?.filas || []).reduce((sum, t) => sum + parseFloat(t.deuda || 0), 0);
  const deudaPacienteSpan = document.getElementById("deuda-paciente");
  deudaPacienteSpan.textContent = euros(totalDeuda);
  deudaPacienteSpan.dataset.tono = totalDeuda > 0 ? "peligro" : "";
}

// ---- Apertura del modal ----

crearTratamientoBtn.addEventListener("click", () => {
  setCreateMode();
  modal.show();
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
    modalHeading.textContent = "Editar tratamiento";
    guardarTratamientoBtn.textContent = "Guardar cambios";

    // Tipo: si coincide con una opción del select, se selecciona;
    // si no, es un tratamiento personalizado -> "otro" + input.
    const opciones = Array.from(diagnosticoSelect.options).map(o => o.value);
    if (opciones.includes(treatment.diagnostico)) {
      diagnosticoSelect.value = treatment.diagnostico;
      mostrarTratamientoPersonalizado(false);
    } else {
      diagnosticoSelect.value = "otro";
      mostrarTratamientoPersonalizado(true);
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
      bloquearDientes(true);
    } else {
      const marcados = new Set(editingPieces.map(p => String(p.tooth_number)));
      toothCheckboxes.forEach(cb => { cb.checked = marcados.has(cb.value); });
    }

    modal.show();
  } catch (error) {
    console.error("Error al cargar el tratamiento para editar:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cargar el tratamiento para editar."
    });
  }
}

modal.querySelector(".modal__close").addEventListener("click", () => {
  modal.close();
});
modal.querySelector(".modal__button--close").addEventListener("click", () => {
  modal.close();
});

// ---- Carga inicial ----

document.addEventListener("DOMContentLoaded", async () => {
  const deudaPacienteSpan = document.getElementById("deuda-paciente");

  if (!patientId) {
    console.warn("No se encontró ID en la URL");
    return;
  }

  try {
    const pacienteData = await DB.getRecord('clients', patientId);
    if (!pacienteData) throw new Error("Paciente no encontrado");

    document.getElementById('nombre-paciente').textContent = pacienteData.nombre || 'No disponible';
    document.getElementById('iniciales-paciente').textContent = iniciales(pacienteData.nombre);
    document.getElementById('email-paciente').textContent = pacienteData.email || 'No disponible';
    document.getElementById('telefono-paciente').textContent = pacienteData.telefono || 'No disponible';
    document.getElementById('fecha-alta-paciente').textContent = pacienteData.Alta ? formatFecha(pacienteData.Alta) : 'No disponible';
    document.getElementById('alergias').textContent = pacienteData.alergias || 'No disponible';
    document.getElementById('edad').textContent = String(pacienteData.edad ?? "").trim() || 'No disponible';
    document.title = `${pacienteData.nombre || "Paciente"} · HS Dental`;

    await cargarTratamientos(patientId);

    // Sección de visitas del paciente (componente reutilizable)
    mountVisitas({ container: document.getElementById("visitas-section"), clientId: patientId });

  } catch (error) {
    console.error("Error al cargar datos del paciente o tratamientos:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: `No se pudieron cargar los datos: ${error.message}`
    });
    deudaPacienteSpan.textContent = "Error";
  }
});

generalCheckbox.addEventListener('change', function () {
  bloquearDientes(this.checked);
});

// Mostrar el input de tratamiento personalizado al elegir "otro".
diagnosticoSelect.addEventListener('change', () => {
  mostrarTratamientoPersonalizado(diagnosticoSelect.value === 'otro');
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

    await cargarTratamientos(patientId);

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

    await cargarTratamientos(patientId);

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

// ---- Pestañas Tratamientos / Visitas / Solicitudes ----
// Patron de pestañas accesible: la activa lleva aria-selected y es la unica
// alcanzable con Tab; las flechas mueven entre pestañas.
const pestanas = [...document.querySelectorAll(".pestanas__opcion")];

function activarPestana(pestana) {
  pestanas.forEach(p => {
    const activa = p === pestana;
    p.setAttribute("aria-selected", String(activa));
    p.tabIndex = activa ? 0 : -1;
    document.getElementById(p.getAttribute("aria-controls")).hidden = !activa;
  });
}

pestanas.forEach((pestana, i) => {
  pestana.addEventListener("click", () => activarPestana(pestana));
  pestana.addEventListener("keydown", e => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!paso) return;
    const siguiente = pestanas[(i + paso + pestanas.length) % pestanas.length];
    activarPestana(siguiente);
    siguiente.focus();
  });
});

// La campana del panel puede pedir abrir una pestaña concreta (?tab=solicitudes).
const tabPedida = new URLSearchParams(window.location.search).get("tab");
const pestanaPedida = pestanas.find(p => p.dataset.tab === tabPedida);
if (pestanaPedida) activarPestana(pestanaPedida);
