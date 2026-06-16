import {
  calendar,
  calendarDays,
  modalCancelBtn,
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
  attachDayClickHandlers
} from "../../modules/components/Calendar.js";
import { closeModal } from "../../modules/components/Modal.js";

document.addEventListener("DOMContentLoaded", renderCalendar);
previousMonthBtn.addEventListener("click", () => setMonth(-1));
nextMonthBtn.addEventListener("click", () => setMonth(1));

modalCloseBtn.addEventListener("click", closeModal);
modalCancelBtn.addEventListener("click", closeModal);

// Drag & Drop igual que siempre
calendarDays.forEach(dayEl => {
  dayEl.addEventListener("dragover",  dragOverHandler);
  dayEl.addEventListener("dragleave", dragLeaveHandler);
  dayEl.addEventListener("dragend",   dragEndHandler);
  dayEl.addEventListener("drop",      dropAppointment);
});

attachDayClickHandlers(calendarDays, loadAppointmentsModal);
