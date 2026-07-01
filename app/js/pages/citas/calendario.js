import {
  calendar,
  calendarDays,
  modalCloseBtn,
  nextMonthBtn,
  previousMonthBtn
} from "../../modules/selectores.js";
import {
  dragEndHandler,
  dragLeaveHandler,
  dragOverHandler,
  dropAppointment,
  renderCalendar,
  setMonth,
  loadAppointmentsModal,
  attachDayClickHandlers,
  setGabinete
} from "../../modules/components/Calendar.js";
import { closeModal } from "../../modules/components/Modal.js";

document.addEventListener("DOMContentLoaded", renderCalendar);
previousMonthBtn.addEventListener("click", () => setMonth(-1));
nextMonthBtn.addEventListener("click", () => setMonth(1));

modalCloseBtn.addEventListener("click", closeModal);

// Drag & Drop igual que siempre
calendarDays.forEach(dayEl => {
  dayEl.addEventListener("dragover",  dragOverHandler);
  dayEl.addEventListener("dragleave", dragLeaveHandler);
  dayEl.addEventListener("dragend",   dragEndHandler);
  dayEl.addEventListener("drop",      dropAppointment);
});

attachDayClickHandlers(calendarDays, loadAppointmentsModal);

// Switch de gabinete: filtra las citas mostradas por médico (med1/med2) o todas.
const gabButtons = document.querySelectorAll(".gab-chip");
gabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    gabButtons.forEach(b => b.classList.remove("gab-chip--active"));
    btn.classList.add("gab-chip--active");
    setGabinete(btn.dataset.medico);
  });
});
