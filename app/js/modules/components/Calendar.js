import { calendarDays, calendarHeading, firstDayGrid, linkAppointmentsControlBtn, modalCalendarList, modalHeading } from "../selectores.js";
import { formatDateRange, formatDateString, formatTitle, reloadPage } from "../funciones.js";
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

    //Get monthly appointments
    DB.getMonthlyAppointments(formatDateRange([firstMonthDate, lastMonthDate]))
        .then(appointments => {
            displayAppointmentsInCalendar(appointments);
        })
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage));
}

export function setMonth(step){
    const currentMonth = currentDate.getMonth();
    currentDate.setMonth(currentMonth + step);
    renderCalendar()
}

function displayAppointmentsInCalendar(appointments){
    const calendarDaysWithAppointments = document.querySelectorAll(".calendar__day--content");
    calendarDaysWithAppointments.forEach(calendarDay => UI.cleanCalendarDay(calendarDay))

    appointments.forEach(record => {
        const date = new Date(record.fecha);
        const day = date.getDate();
        const calendarDayContainer = document.querySelector(`.calendar__day[data-day="${day}"]`);
        UI.updateCalendarDayContent(calendarDayContainer, record)
    })
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
    linkAppointmentsControlBtn.href = `control.html?search=${date.slice(0,10)}`;

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
 * - Si el <li> tiene citas, abre el modal y añade botón “Ver el día”
 * - Si no, redirige a vista_diaria.html?date=YYYY-MM-DD
 */
export function attachDayClickHandlers(calendarDays, modalLoaderFn) {
  calendarDays.forEach(dayEl => {
    dayEl.addEventListener("click", e => {
      e.stopPropagation();

      // extraer día, mes y año
      const day   = dayEl.dataset.day;
      const title = document.getElementById("calendar-date").textContent.trim();
      const parts     = title.split(" ");
      const mesNombre = parts[0];
      const año       = parts[parts.length - 1];
      const meses     = [
        "Enero","Febrero","Marzo","Abril","Mayo","Junio",
        "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
      ];
      const mm  = String(meses.indexOf(mesNombre) + 1).padStart(2,"0");
      const dd  = String(day).padStart(2,"0");
      const iso = `${año}-${mm}-${dd}`;

      if (dayEl.classList.contains("calendar__day--content")) {
        // abre el modal con tus citas
        modalLoaderFn(e);

        // añade botón “Ver el día” (si no existe aún)
        const footer = document
          .getElementById("appointments-modal")
          .querySelector(".modal__footer");
        if (!footer.querySelector(".modal__button--view-day")) {
          const btn = document.createElement("a");
          btn.textContent = "Ver el día";
          btn.href      = `/pages/citas/vista_diaria.html?date=${iso}`;
          btn.className = "modal__button modal__button--view-day";
          btn.style.textDecoration = "none";
          btn.style.color = "var(--color-primary)";
          footer.appendChild(btn);
        }
      } else {
        // no hay citas: directa a vista diaria
        window.location.href = `/pages/citas/vista_diaria.html?date=${iso}`;
      }
    });
  });
}
