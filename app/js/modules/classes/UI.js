import { appointmentStatusIcon } from "../variables.js";
import { appointmentStateContainer, 
    clientsStats, 
    emptyContainer, 
    formHeading, formSubmit, 
    inputs, 
    modalAppointmentSubmitBtn, 
    modalCalendarList, 
    pendingAppointmentStats, 
    servicesStats, 
    todayAppointmentStats,
    modalMedicoInput, 
    modalMedicoSubmitBtn
} from "../selectores.js";
import { formatTime, goToControlPage } from "../funciones.js";
import { startDrag } from "../components/Calendar.js";
import { hidePreloader } from "../components/Spinner.js";
import Alert from "../components/Alert.js";
// Import actualizado para usar la API PHP/MySQL
import DB from "./DB_API.js";

class UI{
    //* Dashboard
    showStats({ today, pending, clients, services}){
        todayAppointmentStats.textContent = today;
        pendingAppointmentStats.textContent = pending;
        clientsStats.textContent = clients;
        servicesStats.textContent = services;
        hidePreloader();
    }


    //* AP  P

    showFormEditMode(objectStore, id){
        formHeading.textContent = "Editar Registro";
        formSubmit.innerHTML = 'Editar Registro <i class="ri-pencil-fill"></i>';
        formSubmit.dataset.action = "edit";
        DB.getRecord(objectStore, id)
            .then(info => this.showRecordInfo(info))
            .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, goToControlPage))
    }

    showRecordModal(id){
        DB.getRecord("appointments", id)
            .then(info => {
                this.showRecordInfo(info);
                modalAppointmentSubmitBtn.dataset.id = id;
            })
            .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, goToControlPage))
    }
    showMedicoModal(id) {
        // Log para depurar la invocación
        console.log("📬 showMedicoModal llamado con id=", id);
        // Asigna el id al botón de guardar
        modalMedicoSubmitBtn.dataset.id = id;

        // Carga la cita desde MySQL via API
        DB.getRecord("appointments", id)
            .then(cita => {
                // Log para ver el objeto recibido
                console.log("🩺 cita recibida en showMedicoModal:", cita);
                // Si no hay valor previo, dejamos vacío
                modalMedicoInput.value = cita.medico || "";
            })
            .catch(error => {
                console.error("❌ error en showMedicoModal:", error);
                Alert.showStatusAlert(
                    "error",
                    "¡Error al cargar la cita!",
                    error.message,
                    goToControlPage
                );
            });
    }

    showRecordInfo(info){
        inputs.forEach(input => input.value = info[input.name])

        //Show the appointment state input if the user is in that editing section
        if (appointmentStateContainer) {
            appointmentStateContainer.classList.remove("form__group--hidden");
            appointmentStateContainer.querySelector("select").removeAttribute("readonly");
        }
    }

    createSelectOptions(records, select){
        const fragment = document.createDocumentFragment();

        records.forEach(record => {
            const { id, nombre } = record;
            const option = document.createElement("OPTION");
            option.value = id;
            option.textContent = nombre;
            fragment.appendChild(option);
        })

        select.appendChild(fragment)
    }

    showRecordsNotFoundDiv(){
        emptyContainer.classList.add("show")
    }

    removeTableRow(id){
        const tableRow = document.querySelector(`#table tr:has(.table__btn[data-id='${id}'])`);
        const tableExpanded = tableRow.nextElementSibling;
        if (tableExpanded && tableExpanded.getAttribute("data-dt-row") && tableExpanded.classList.contains("child")) {
            tableExpanded.remove();
        }
        tableRow.remove();
    }

    //* Calendar

    updateCalendarDayContent(container, { id, estado, servicio }){
        const formattedStatus = estado.toLowerCase();

        container.classList.add("calendar__day--content");
        const list = this.createCalendarDayList(container);

        const listItem = document.createElement("LI");
        listItem.draggable = "true";
        listItem.ondragstart = (e) => startDrag(e);
        listItem.dataset.id = id;
        listItem.classList.add(`appointment__${formattedStatus}`)

        const listButton = document.createElement("BUTTON");
        
        const icon = document.createElement("I");
        icon.classList.add(appointmentStatusIcon[formattedStatus])

        const textSpan = document.createElement("SPAN");
        textSpan.textContent = servicio;
        textSpan.classList.add("appointment-text");
        
        listButton.appendChild(icon);
        listButton.appendChild(textSpan)
        
        listItem.appendChild(listButton)
        list.appendChild(listItem)
    }

    createCalendarDayList(container){
        const dayInfoContainer = container.querySelector(".day__info");

        //Creating the appointments visual indicator button
        let visualIndicatorBtn = dayInfoContainer.querySelector(".day__notification");
        if (!visualIndicatorBtn) {
            visualIndicatorBtn = document.createElement("BUTTON");
            visualIndicatorBtn.classList.add("day__notification");
            visualIndicatorBtn.innerHTML = '<i class="ri-information-2-fill"></i>';
            dayInfoContainer.appendChild(visualIndicatorBtn)
        }

        //Creaing the list
        let list = container.querySelector(".calendar__appointments");
        if (!list) {
            list = document.createElement("UL");
            list.classList.add("calendar__appointments");
            container.appendChild(list)
        }

        return list;
    }

    resetPreviousCalendarDay(container){
        const appointmentsLength = container.querySelector(".calendar__appointments").children.length;
        if (!appointmentsLength) this.cleanCalendarDay(container);
    }

    createCalendarModalItem({ servicio, cliente, estado, fecha, medico }){
        const formattedStatus = estado.toLowerCase();

        const listItem = document.createElement("LI");
        listItem.classList.add("modal__item");

        //* Item Description
        const itemDescription = document.createElement("DIV");
        itemDescription.classList.add("item__description");

        const itemIcon = document.createElement("DIV");
        itemIcon.classList.add(`item__icon`, `item__icon--${formattedStatus}`)
        
        const icon = document.createElement("I");
        icon.classList.add(appointmentStatusIcon[formattedStatus])

        itemIcon.appendChild(icon);

        const itemContent = document.createElement("DIV");
        itemContent.classList.add("item__content");

        const serviceHeading = document.createElement("H6");
        serviceHeading.classList.add("item__service")
        serviceHeading.textContent = servicio;

        const clientSpan = document.createElement("SPAN");
        clientSpan.classList.add("item__client");
        clientSpan.textContent = cliente;

        itemContent.appendChild(serviceHeading);
        itemContent.appendChild(clientSpan);

        //* Distintivo de gabinete (med1 -> Gabinete 1, med2 -> Gabinete 2)
        const gabLabels = { med1: "Gabinete 1", med2: "Gabinete 2" };
        if (gabLabels[medico]) {
            const gabBadge = document.createElement("SPAN");
            gabBadge.classList.add("item__gabinete", `gab--${medico}`);
            gabBadge.textContent = gabLabels[medico];
            itemContent.appendChild(gabBadge);
        }

        itemDescription.appendChild(itemIcon);
        itemDescription.appendChild(itemContent)

        //* Item Date
        const itemDate = document.createElement("DIV");
        itemDate.classList.add("item__date");

        //Obtaining the time (HH:MM)
        const time = formatTime(new Date(fecha))
        const hourSpan = document.createElement("SPAN");
        hourSpan.classList.add("item__hour")
        hourSpan.innerHTML = `<i class="ri-timer-fill"></i> ${time}`;

        itemDate.appendChild(hourSpan);

        //* Adding to the DOM
        listItem.appendChild(itemDescription);
        listItem.appendChild(itemDate);

        modalCalendarList.appendChild(listItem);
    }

    cleanCalendarDay(calendarDay){
        calendarDay.classList.remove("calendar__day--content")
        calendarDay.querySelector(".day__info button.day__notification").remove();
        calendarDay.querySelector("ul.calendar__appointments").remove();
    }

    cleanHTML(container){
        while (container.firstElementChild) {
            container.removeChild(container.firstElementChild);
        }
    }
}

export default new UI();
