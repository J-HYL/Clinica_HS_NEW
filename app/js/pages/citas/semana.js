// semana.js — controlador de la vista semanal
import { renderSemana, setSemana } from "../../modules/components/WeekCalendar.js";
import { previousMonthBtn, nextMonthBtn } from "../../modules/selectores.js";

document.addEventListener("DOMContentLoaded", renderSemana);

// Los botones de la cabecera navegan por semanas (reutilizan las clases prev/next).
previousMonthBtn.addEventListener("click", () => setSemana(-1));
nextMonthBtn.addEventListener("click", () => setSemana(1));
