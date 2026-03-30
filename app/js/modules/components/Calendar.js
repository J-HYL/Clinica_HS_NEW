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

    //Get the appointment id before the await to avoid errors with the dataTransfer
    const appointmentID = e.dataTransfer.getData("id");

    //Confirm Movement Action
    const confirmation = await LocalStorage.confirmAppointmentMovement();
    if (!confirmation) return

    const target = e.target;
    let calendarDayContainer = target;

    //Get the calendar day container and not a child
    if (!target.classList.contains("calendar__day")) {
        calendarDayContainer = target.closest(".calendar__day");
    }

    if (!calendarDayContainer.classList.contains("calendar__day--content")) {
        calendarDayContainer.classList.add("calendar__day--content");
    }

    //Get the dragged appointment
    const draggedAppointment = document.querySelector(`.calendar__appointments li[data-id='${appointmentID}']`);
    const previousCalendarDayContainer = draggedAppointment.closest(".calendar__day--content");

    // In case the element is not found, it returns
    if (!draggedAppointment) {
        Alert.showStatusAlert("error", "¡Error!", "La cita con el ID proporcionado no fue encontrada", reloadPage)
        return;
    }

    // Create the calendar day list and append the appointment
    const list = UI.createCalendarDayList(calendarDayContainer);
    list.appendChild(draggedAppointment);

    //Reset the previous calendar day
    UI.resetPreviousCalendarDay(previousCalendarDayContainer);

    //Update the selected appointment
    const selectedDay = calendarDayContainer.dataset.day;
    DB.updateAppointmentDate(appointmentID, selectedDay)
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
