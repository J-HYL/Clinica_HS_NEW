import { calendarDays, calendarHeading, firstDayGrid, linkAppointmentsControlBtn, modalCalendarList, modalHeading } from "../selectores.js";
import { formatDateString, formatFecha, formatTitle, reloadPage } from "../funciones.js";
import { fechaISO } from "../formato.js";
import { openModal } from "./Modal.js";
import UI from "../classes/UI.js";
import DB from "../classes/DB_API.js";
import Alert from "./Alert.js";

const currentDate = new Date();

export function renderCalendar() {
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();

    const firstMonthDate = new Date(year, month, 1);
    const lastMonthDate = new Date(year, month + 1, 0);

    const calendarTitle = currentDate.toLocaleDateString("co-CO", {
        month: "long",
        year: "numeric"
    })
    calendarHeading.textContent = formatTitle(calendarTitle);

    const firstWeekDay = firstMonthDate.getDay();
    const lastMonthDay = lastMonthDate.getDate();
    
    //Move grid to the first weekday of the month
    firstDayGrid.style.gridColumnStart = firstWeekDay === 0 ? 7 : firstWeekDay;

    //Hide/show the last three days
    for (let i = 30; i >= 28; i--) {
        const calendarDay = calendarDays[i];
        const day = Number(calendarDay.dataset.day);
        calendarDay.classList.toggle("calendar__day--hidden", day > lastMonthDay)
    }

    //Marcar el día actual (solo si se muestra el mes en curso)
    const today = new Date();
    calendarDays.forEach(d => d.classList.remove("calendar__day--today"));
    if (today.getMonth() === month && today.getFullYear() === year) {
        const todayCell = document.querySelector(`.calendar__day[data-day="${today.getDate()}"]`);
        if (todayCell) todayCell.classList.add("calendar__day--today");
    }

    //Get monthly appointments. Rango en dia LOCAL (toISOString() lo pasaria a UTC
    //y se perderia el ultimo dia del mes y entraria el ultimo del anterior).
    DB.getMonthlyAppointments([`${fechaISO(firstMonthDate)}T00:00`, `${fechaISO(lastMonthDate)}T23:59`])
        .then(appointments => {
            displayAppointmentsInCalendar(appointments);
        })
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage));
}

export function setMonth(step){
    // Dia 1 antes de cambiar de mes: desde un 31, setMonth(+1) saltaria un mes.
    currentDate.setDate(1);
    currentDate.setMonth(currentDate.getMonth() + step);
    renderCalendar()
}

// Guardamos las citas del mes en curso para poder refiltrar por gabinete
// sin tener que volver a pedirlas al servidor.
let lastAppointments = [];
let currentGabinete = "all"; // "all" | "med1" | "med2"

function displayAppointmentsInCalendar(appointments){
    lastAppointments = appointments;
    renderFilteredAppointments();
}

function renderFilteredAppointments(){
    document.querySelectorAll(".calendar__day--content")
        .forEach(calendarDay => UI.cleanCalendarDay(calendarDay));

    const visibles = currentGabinete === "all"
        ? lastAppointments
        : lastAppointments.filter(record => (record.medico || "") === currentGabinete);

    visibles.forEach(record => {
        const day = new Date(record.fecha).getDate();
        const calendarDayContainer = document.querySelector(`.calendar__day[data-day="${day}"]`);
        if (calendarDayContainer) UI.updateCalendarDayContent(calendarDayContainer, record);
    });
}

/** Cambia el gabinete visible (med1/med2/all) y repinta sin recargar datos. */
export function setGabinete(medico){
    currentGabinete = medico;
    renderFilteredAppointments();
}

//* Appointment Modal

export function loadAppointmentsModal(e){
    const calendarDay = e.target.closest(".calendar__day--content");
    if (!calendarDay) return;

    const appointmentsIDs = [];
    const calendarAppointments = calendarDay.querySelectorAll(".calendar__appointments li")
    calendarAppointments.forEach(appointment => appointmentsIDs.push(appointment.dataset.id));
    const appointmentsPromises = appointmentsIDs.map(id => DB.getRecord("appointments", id));
    
    Promise.all(appointmentsPromises)
        .then(appointments => {
          displayAppointmentsInModal(appointments);
        })
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage));

}

function displayAppointmentsInModal(appointments){
    const date = appointments[0].fecha;
    const formattedDateString = formatDateString(date);
    
    modalHeading.textContent = `Citas - ${formattedDateString}`;
    UI.cleanHTML(modalCalendarList);
    appointments.forEach(appointment => UI.createCalendarModalItem(appointment))
    // La tabla filtra las fechas por su valor mostrado (DD/MM/YYYY), así que el
    // término de búsqueda debe ir en ese mismo formato, no en ISO.
    linkAppointmentsControlBtn.href = `control.html?search=${encodeURIComponent(formatFecha(date.slice(0, 10)))}`;
    document.getElementById("appointments-modal-dia").href = `vista_diaria.html?date=${date.slice(0, 10)}`;

    openModal();
}

//* Drag & Drop
export function startDrag(e) {
    const appointmentID = e.target.dataset.id;
    e.dataTransfer.setData("id", appointmentID);
    e.dataTransfer.dropEffect = "move"
    e.target.classList.add("dragging") 
}

export function dragOverHandler(e) {
    e.preventDefault();
    const target = e.target;
    const calendarDay = target.closest(".calendar__day");
    
    if (calendarDay && !calendarDay.classList.contains("drag__over")) {
        calendarDay.classList.add("drag__over");
    }
}

export function dragLeaveHandler(e) {
    e.target.classList.remove("drag__over");
}

export function dragEndHandler(e) {
    e.target.classList.remove("dragging")

    //Remove all days with the drag__over class (Prevent UI failures)
    const dragOverDays = document.querySelectorAll(".calendar__day.drag__over")
    dragOverDays.forEach(day => day.classList.remove("drag__over"))
}

export async function dropAppointment(e) {
    e.preventDefault();

    // Id de la cita arrastrada (leer antes de cualquier await)
    const appointmentID = e.dataTransfer.getData("id");
    if (!appointmentID) return;

    // Limpiar resaltados del arrastre
    document.querySelectorAll(".calendar__day.drag__over")
        .forEach(day => day.classList.remove("drag__over"));

    // Día destino (celda visible)
    const calendarDay = e.target.closest(".calendar__day");
    if (!calendarDay || calendarDay.classList.contains("calendar__day--hidden")) return;
    const nuevoDia = Number(calendarDay.dataset.day);

    try {
        // Cita actual: conservamos la hora y solo cambiamos el día.
        const cita = await DB.getRecord("appointments", appointmentID);
        const hora = (cita.fecha || "").slice(11, 16) || "09:00";

        const year = currentDate.getFullYear();
        const mes = String(currentDate.getMonth() + 1).padStart(2, "0");
        const dia = String(nuevoDia).padStart(2, "0");
        const nuevaFechaISO = `${year}-${mes}-${dia}`;

        // Si se suelta en el mismo día, no hacemos nada.
        if ((cita.fecha || "").slice(0, 10) === nuevaFechaISO) return;

        const result = await Swal.fire({
            title: "¿Mover la cita?",
            text: `Se moverá al ${dia}/${mes}/${year} a las ${hora}.`,
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Sí, mover",
            cancelButtonText: "Cancelar"
        });
        if (!result.isConfirmed) return;

        await DB.editRecord("appointments", appointmentID, { fecha: `${nuevaFechaISO}T${hora}` });
        renderCalendar(); // repinta el mes con la cita ya movida
    } catch (err) {
        Alert.showStatusAlert("error", "¡Error!", "No se pudo mover la cita.", reloadPage);
    }
}
/**
 * Gestiona el click en cada día del calendario mensual:
 * - Si el <li> tiene citas, abre el modal (con su enlace "Ver el día")
 * - Si no, redirige a vista_diaria.html?date=YYYY-MM-DD
 */
export function attachDayClickHandlers(calendarDays, modalLoaderFn) {
  calendarDays.forEach(dayEl => {
    dayEl.addEventListener("click", e => {
      e.stopPropagation();

      if (dayEl.classList.contains("calendar__day--content")) {
        modalLoaderFn(e);
        return;
      }

      // no hay citas: directa a la vista diaria de ese día
      const dia = new Date(currentDate.getFullYear(), currentDate.getMonth(), Number(dayEl.dataset.day));
      window.location.href = `/pages/citas/vista_diaria.html?date=${fechaISO(dia)}`;
    });
  });
}
