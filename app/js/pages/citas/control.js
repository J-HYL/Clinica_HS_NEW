//control.js
import {
  modalAppointmentSubmitBtn,
  modalCancelBtn,
  modalCloseBtn,
  modalMedicoSubmitBtn,
  modalMedicoCloseBtn,
  modalMedicoCancelBtn,
  table
} from "../../modules/selectores.js";
import { getAppointments, setTableEventsListeners } from "../../modules/funciones.js";
import { closeModal, closeMedicoModal } from "../../modules/components/Modal.js";
import DB from "../../modules/classes/DB_API.js";


//* Eventos
document.addEventListener("DOMContentLoaded", () => getAppointments());

//CAMBIAR Y MOVER
table.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains("table__btn--edit")) {
    openEditModal(id);
  } else {
    // manejo de delete, estado y médico
    setTableEventsListeners(e, "appointments");
  }
});
// Referencias al modal y sus campos
const editModal             = document.getElementById("edit-modal");
const inputServicioEdit     = document.getElementById("edit-servicio");
const inputObservacionesEdit= document.getElementById("edit-cliente");
const inputFechaHoraEdit    = document.getElementById("edit-fecha");
const selectMedicoEdit      = document.getElementById("edit-medico");
const selectEstadoEdit      = document.getElementById("edit-estado");

// Abre el modal y rellena los campos
function openEditModal(id) {
  DB.getRecords("appointments")
    .then(apps => {
      const app = apps.find(a => a.id === id);
      if (!app) throw new Error("Cita no encontrada");
      inputServicioEdit.value      = app.servicio || "";
      inputObservacionesEdit.value = app.cliente  || "";
      inputFechaHoraEdit.value     = app.fecha.slice(0,16);
      selectMedicoEdit.value       = app.medico   || "";
      selectEstadoEdit.value       = app.estado   || "Pendiente";
      editModal.dataset.id         = id;
      if (typeof editModal.showModal === "function") editModal.showModal();
      else editModal.setAttribute("open", "");
    })
    .catch(err => {
      console.error(err);
      Swal.fire("Error", "No se pudo cargar la cita.", "error");
    });
}
// Botones de cierre (icono X y “Cancelar”)
const btnCloseEditIcon  = editModal.querySelector(".modal__close");
const btnCloseEditFooter= editModal.querySelector(".modal__button--close");

function closeEditModal() {
  editModal.classList.add("closing");
  setTimeout(() => {
    editModal.close();
    editModal.classList.remove("closing");
  }, 200);
}

btnCloseEditIcon.addEventListener("click", closeEditModal);
btnCloseEditFooter.addEventListener("click", closeEditModal);

const btnUpdateEdit = editModal.querySelector(".modal__button--primary");

btnUpdateEdit.addEventListener("click", async () => {
  const id       = editModal.dataset.id;
  const servicio = inputServicioEdit.value.trim();
  const cliente  = inputObservacionesEdit.value.trim();
  const fecha    = inputFechaHoraEdit.value;
  const medico   = selectMedicoEdit.value;
  const estado   = selectEstadoEdit.value;

  // Validación de hora mínima (>=09:00)
  if (new Date(fecha).getHours() < 9) {
    Swal.fire("Fecha inválida", "La hora debe ser posterior a las 09:00.", "error");
    return;
  }

  try {
    await DB.editRecord("appointments", id, { servicio, cliente, fecha, medico, estado });
    closeEditModal();
    getAppointments();  // recarga la tabla
    Swal.fire("Éxito", "Cita actualizada.", "success");
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo actualizar la cita.", "error");
  }
});

//HASTA AQUI 
//table.addEventListener("click", (e) => setTableEventsListeners(e, "appointments"));

//Modal
modalAppointmentSubmitBtn.addEventListener("click", (e) => DB.updateState(e.target.dataset.id))
modalCloseBtn.addEventListener("click", closeModal);
modalCancelBtn.addEventListener("click", closeModal);

// Médico
modalMedicoSubmitBtn.addEventListener("click", e => DB.updateMedico(e.target.dataset.id));
modalMedicoCloseBtn .addEventListener("click", closeMedicoModal);
modalMedicoCancelBtn.addEventListener("click", closeMedicoModal);

