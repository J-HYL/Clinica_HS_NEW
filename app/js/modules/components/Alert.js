
import DB from "../classes/DB_API.js";
import { reloadPage } from "../funciones.js";  // Asegúrate de ajustar la ruta si es necesario

class Alert {
    showInputAlert(input, message) {
        if (!input.classList.contains("error")) {
            input.classList.add("error");
        }
        const previousSpan = input.nextElementSibling;
        if (previousSpan) previousSpan.remove();
        const span = document.createElement("SPAN");
        span.textContent = message;
        input.parentElement.appendChild(span);
    }

    clearInputAlert(input) {
        if (input.classList.contains("error")) {
            input.classList.remove("error");
            input.nextElementSibling.remove();
        }
    }

    showStatusAlert(type, title, message, callback = null) {
        Swal.fire(title, message, type).then(() => {
            if (callback) {
                callback();
            }
        });
    }

    showConfirmationAlert(objectStore, id) {
        Swal.fire({
            title: "¡Confirmación!",
            text: "¿Está seguro de eliminar el registro seleccionado?",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Eliminar",
            cancelButtonText: "Cancelar"
        }).then((result) => {
            if (result.isConfirmed) {
                DB.deleteRecord(objectStore, id)
                    .then(() => {
                        return Swal.fire("¡Eliminado!", "El registro fue eliminado correctamente.", "success");
                    })
                    .then(() => {
                        // Recarga completa para reinicializar la tabla sin registros fantasma
                        reloadPage();
                    })
                    .catch(err => {
                        Swal.fire("Error", "No se pudo eliminar: " + err.message, "error");
                    });
            }
        });
    }

}

export default new Alert();
