import { appointmentStateContainer,
    formHeading, formSubmit,
    inputs,
    modalAppointmentSubmitBtn,
    modalCalendarList,
    modalMedicoInput,
    modalMedicoSubmitBtn
} from "../selectores.js";
import { goToControlPage } from "../funciones.js";
import { hora } from "../formato.js";
import { startDrag } from "../components/Calendar.js";
import Alert from "../components/Alert.js";
// Import actualizado para usar la API PHP/MySQL
import DB from "./DB_API.js";

class UI{
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
        // Solo los campos que vienen en el registro: en la pagina hay otros inputs
        // (buscadores de la barra y de la tabla, el adjunto de Soporte...) que no
        // son del formulario y a los que no hay que tocar.
        inputs.forEach(input => {
            if (input.name && input.name in info) input.value = info[input.name] ?? "";
        })

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


    //* Calendar (vista Mes: Calendar.js + calendario.html)
    // OJO (inconsistencia del proyecto): en appointments `servicio` guarda el
    // NOMBRE DEL PACIENTE y `cliente` las OBSERVACIONES (o el fin, si es un bloqueo).
    // El color de cada cita va por su ESTADO: data-estado + .color-estado (calendar.css).

    /** Añade una cita a la celda de su día: punto en la tarjeta estrecha, fila con hora y paciente en la ancha. */
    updateCalendarDayContent(container, { id, estado, servicio, fecha }){
        const CITAS_POR_DIA = 3; // filas visibles por celda (= nth-child(n+4) en pages/calendario.css)
        const textoEstado = estado || "Pendiente";
        const horaCita = hora(fecha);

        container.classList.add("calendar__day--content");
        const list = this.createCalendarDayList(container);

        const listItem = document.createElement("LI");
        listItem.className = "color-estado";
        listItem.dataset.estado = textoEstado.toLowerCase();
        listItem.dataset.id = id;
        listItem.title = `${horaCita} · ${servicio} · ${textoEstado}`;
        listItem.draggable = true;
        listItem.ondragstart = (e) => startDrag(e);

        const listButton = document.createElement("BUTTON");
        listButton.type = "button";
        listButton.className = "calendar__cita";

        const horaSpan = document.createElement("SPAN");
        horaSpan.className = "calendar__cita-hora";
        horaSpan.textContent = horaCita;

        const nombreSpan = document.createElement("SPAN");
        nombreSpan.className = "calendar__cita-nombre";
        nombreSpan.textContent = servicio;

        listButton.append(horaSpan, nombreSpan);
        listItem.appendChild(listButton);
        list.appendChild(listItem);

        // Las que no caben se ven en el modal del día; aquí solo "+N más".
        const ocultas = list.children.length - CITAS_POR_DIA;
        if (ocultas > 0) list.dataset.mas = ocultas;
    }

    createCalendarDayList(container){
        let list = container.querySelector(".calendar__appointments");
        if (!list) {
            list = document.createElement("UL");
            list.className = "calendar__appointments";
            container.appendChild(list);
        }
        return list;
    }

    /** Fila del modal "Citas del día": hora, paciente, observaciones/gabinete y estado. */
    createCalendarModalItem({ servicio, cliente, estado, fecha, medico }){
        const GABINETES = { med1: "Gabinete 1", med2: "Gabinete 2" };
        const textoEstado = estado || "Pendiente";
        const claveEstado = textoEstado.toLowerCase();

        const listItem = document.createElement("LI");
        listItem.className = "modal-cita";

        const horaTime = document.createElement("TIME");
        horaTime.className = "modal-cita__hora";
        horaTime.dateTime = fecha;
        horaTime.textContent = hora(fecha);

        const tarjeta = document.createElement("DIV");
        tarjeta.className = "modal-cita__tarjeta color-estado";
        tarjeta.dataset.estado = claveEstado;

        const texto = document.createElement("DIV");
        texto.className = "modal-cita__texto";

        const paciente = document.createElement("SPAN");
        paciente.className = "modal-cita__paciente";
        paciente.textContent = (servicio || "").trim() || "Sin nombre";
        texto.appendChild(paciente);

        // En un bloqueo, `cliente` es la fecha y hora de fin.
        const observaciones = claveEstado === "bloqueado"
            ? (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(cliente || "") ? `Hasta las ${hora(cliente)}` : "")
            : (cliente || "").trim();

        const detalle = document.createElement("SPAN");
        detalle.className = "modal-cita__detalle";
        if (observaciones) {
            const obs = document.createElement("SPAN");
            obs.textContent = observaciones;
            detalle.appendChild(obs);
        }
        if (GABINETES[medico]) {
            const gabinete = document.createElement("SPAN");
            gabinete.className = "gabinete";
            gabinete.dataset.gabinete = medico;
            gabinete.textContent = GABINETES[medico];
            detalle.appendChild(gabinete);
        }
        if (detalle.childElementCount) texto.appendChild(detalle);

        const pastilla = document.createElement("SPAN");
        pastilla.className = "pastilla";
        pastilla.dataset.estado = claveEstado;
        pastilla.textContent = textoEstado;

        tarjeta.append(texto, pastilla);
        listItem.append(horaTime, tarjeta);
        modalCalendarList.appendChild(listItem);
    }

    cleanCalendarDay(calendarDay){
        calendarDay.classList.remove("calendar__day--content");
        calendarDay.querySelector(".calendar__appointments")?.remove();
    }

    cleanHTML(container){
        while (container.firstElementChild) {
            container.removeChild(container.firstElementChild);
        }
    }
}

export default new UI();
