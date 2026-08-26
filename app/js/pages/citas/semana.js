// semana.js — controlador de la vista semanal
import { renderSemana, setSemana, setGabineteSemana } from "../../modules/components/WeekCalendar.js";
import { previousMonthBtn, nextMonthBtn } from "../../modules/selectores.js";

document.addEventListener("DOMContentLoaded", renderSemana);

// Los botones de la cabecera navegan por semanas (reutilizan las clases prev/next).
previousMonthBtn.addEventListener("click", () => setSemana(-1));
nextMonthBtn.addEventListener("click", () => setSemana(1));

// Switch de gabinete: filtra las citas mostradas por médico (med1/med2) o todas.
const gabButtons = document.querySelectorAll(".gab-chip");
gabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    gabButtons.forEach(b => b.classList.remove("gab-chip--active"));
    btn.classList.add("gab-chip--active");
    setGabineteSemana(btn.dataset.medico);
  });
});
