import {
  setTableEventsListeners,
  showRecords
} from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";
import DB from "../../modules/classes/DB_API.js";
import { openModal, closeMedicoModal } from "../../modules/components/Modal.js";

const crearTratamientoBtn = document.getElementById("crear-tratamiento");
const modal = document.getElementById("edit-modal");

const generalCheckbox = document.querySelector('input[name="piezas[]"][value="general"]');
const toothCheckboxes = document.querySelectorAll('input[name="piezas[]"]:not([value="general"])');
const guardarTratamientoBtn = document.getElementById("guardar-tratamiento");

crearTratamientoBtn.addEventListener("click", (e) => {
  e.preventDefault();
  openModal();
  document.querySelector('.form').reset();
  generalCheckbox.checked = false;
  toothCheckboxes.forEach(checkbox => {
    checkbox.checked = false;
    checkbox.disabled = false;
  });
});

document.querySelector(".modal__close").addEventListener("click", () => {
  modal.close();
});
document.querySelector(".modal__button--close").addEventListener("click", () => {
  modal.close();
});

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
    document.getElementById('fecha-alta-paciente').textContent = pacienteData.Alta || 'No disponible';
    document.getElementById('alergias').textContent = pacienteData.alergias || 'No disponible';
    document.getElementById('edad').textContent = ' ' + pacienteData.edad || 'No disponible';
    document.title = `Historia Clínica - ${pacienteData.nombre}`;

    await showRecords("treatments");

    // Cuando DataTable esté listo
    $('#table').one('init.dt', function () {
      const dataTable = $('#table').DataTable();
      dataTable.columns([0, 1, 7, 8, 9, 10]).visible(false);
      dataTable.column(1).search('^' + patientId + '$', true, false).draw();

      let totalDeuda = 0;
      const filteredTreatments = dataTable.rows({ search: 'applied' }).data().toArray();
      if (filteredTreatments.length > 0) {
        totalDeuda = filteredTreatments.reduce((sum, treatment) => {
          return sum + parseFloat(treatment.deuda || 0);
        }, 0);
      }
      if (deudaPacienteSpan) {
        deudaPacienteSpan.textContent = `${totalDeuda.toFixed(2)} €`;
      }
    });

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

guardarTratamientoBtn.addEventListener("click", async (e) => {
  e.preventDefault();

  const params = new URLSearchParams(window.location.search);
  const patientId = params.get("id");

  if (!patientId) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se encontró el ID del paciente en la URL"
    });
    return;
  }

  let diagnostico = document.getElementById("diagnostico").value;
  const observaciones = document.getElementById("observaciones").value;
  const montoTotalInput = document.getElementById("monto_total");
  const montoPagadoInput = document.getElementById("monto_pagado");

  const total = parseFloat(montoTotalInput.value);
  const abonado = parseFloat(montoPagadoInput.value) || 0;

  if (diagnostico === "otro") {
    const customInput = document.querySelector("#customTreatmentInput").value.trim();
    if (!customInput) {
        Swal.fire({
            icon: "warning",
            title: "Falta tratamiento personalizado",
            text: "Por favor, escribe el nombre del tratamiento personalizado.",
        });
        return;
    }
    diagnostico = customInput;
  }

  if (!diagnostico || isNaN(total)) {
    Swal.fire({
      icon: "warning",
      title: "Campos incompletos o inválidos",
      text: "Por favor, rellena los campos obligatorios (Diagnóstico y Monto total) con valores numéricos válidos."
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

    const piezasSeleccionadas = [];
    if (generalCheckbox.checked) {
      piezasSeleccionadas.push("General");
    } else {
      toothCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
          piezasSeleccionadas.push(checkbox.value);
        }
      });
    }

    if (piezasSeleccionadas.length > 0) {
      for (const toothNumber of piezasSeleccionadas) {
        const pieceData = {
          treatment_id: newTreatmentId,
          tooth_number: toothNumber,
          piece_status: 1
        };
        await DB.addRegister("pieces", pieceData);
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

    await showRecords("treatments");

    $('#table').one('init.dt', function () {
      const dataTable = $('#table').DataTable();
      dataTable.columns([0, 1, 7, 8, 9, 10]).visible(false);
      dataTable.column(1).search('^' + patientId + '$', true, false).draw();

      const deudaPacienteSpan = document.getElementById("deuda-paciente");
      let totalDeuda = 0;
      const filteredTreatments = dataTable.rows({ search: 'applied' }).data().toArray();

      if (filteredTreatments.length > 0) {
        totalDeuda = filteredTreatments.reduce((sum, treatment) => {
          return sum + parseFloat(treatment.deuda || 0);
        }, 0);
      }
      if (deudaPacienteSpan) {
        deudaPacienteSpan.textContent = `${totalDeuda.toFixed(2)} €`;
      }
    });

  } catch (err) {
    Swal.fire({
      icon: "error",
      title: "Error al guardar",
      text: `Hubo un error al guardar el tratamiento o las piezas: ${err.message}`
    });
    console.error("Error completo:", err);
  }
});
    const tratamientoSelect = document.getElementById('diagnostico');
    const customTreatmentWrapper = document.getElementById('customTreatmentWrapper');

    if (tratamientoSelect) {
        tratamientoSelect.addEventListener('change', () => {
            customTreatmentWrapper.style.display = tratamientoSelect.value === 'otro' ? 'block' : 'none';
        });
    }

table.addEventListener("click", e =>
  setTableEventsListeners(e, "treatments")
);
