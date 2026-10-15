// modules/components/tac/ModalEnlaceTAC.js
// Enlace para que los centros de radiología envíen los TAC directamente
// (página pública pages/tac/enviar.html). Hace falta el enlace Y una contraseña:
// aquí se crea, se copia, se cambia la contraseña o se genera uno nuevo (el
// anterior deja de funcionar al momento). Es uno para las dos sedes: el centro
// elige la clínica al enviar.

import { obtenerEnlace, guardarEnlace } from "./ApiTAC.js";
import { formatearFecha } from "./utilidades.js";

let dialogo = null;
let temporizadorOk = null;

export async function abrirModalEnlaceTAC() {
    if (!dialogo) construirDialogo();
    mostrarMensaje(null);
    dialogo.querySelector("#tac-enlace-password").value = "";
    dialogo.showModal();
    try {
        pintar(await obtenerEnlace());
    } catch (error) {
        mostrarMensaje(error.message, true);
    }
}

/** URL pública del enlace: en el mismo dominio que el panel, así vale en pre y en producción. */
function urlEnvio(token) {
    return `${location.origin}/pages/tac/enviar.html?k=${encodeURIComponent(token)}`;
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "tac-subir tac-subir--estrecho";
    dialogo.setAttribute("aria-labelledby", "tac-enlace-titulo");
    dialogo.innerHTML = `
        <header class="tac-subir__cabecera">
            <h2 class="tac-subir__titulo" id="tac-enlace-titulo">Enlace para centros de radiología</h2>
            <button type="button" class="tac-subir__cerrar" data-accion="cerrar" aria-label="Cerrar"><i class="ri-close-line"></i></button>
        </header>
        <p class="tac-subir__nota">Con este enlace y su contraseña, el centro donde se hace el TAC lo envía directamente: elige la clínica, escribe el nombre del paciente y sube la carpeta. Os llega un correo y un aviso en la campana. Desde el enlace no se puede ver ningún dato.</p>

        <section class="tac-subir__paso" data-existe hidden>
            <label class="form__label" for="tac-enlace-url">Enlace</label>
            <div class="tac-copiar">
                <input type="text" id="tac-enlace-url" class="form__input" readonly>
                <button type="button" class="tac-boton tac-boton--pequeno" data-accion="copiar"><i class="ri-file-copy-line"></i> Copiar</button>
            </div>
            <p class="tac-subir__nota" data-actualizado></p>
        </section>

        <section class="tac-subir__paso">
            <label class="form__label" for="tac-enlace-password" data-etiqueta-password>Contraseña para los centros</label>
            <div class="tac-copiar">
                <input type="password" id="tac-enlace-password" class="form__input" minlength="8" autocomplete="new-password" placeholder="Mínimo 8 caracteres">
                <button type="button" class="tac-boton tac-boton--pequeno" data-accion="guardar">Guardar</button>
            </div>
        </section>

        <section class="tac-subir__paso" data-existe hidden>
            <span class="form__label">Generar un enlace nuevo</span>
            <p class="tac-subir__nota">Si el enlace ha llegado a quien no debía. El actual deja de funcionar al momento y habrá que mandar el nuevo a los centros.</p>
            <div><button type="button" class="tac-boton tac-boton--secundario tac-boton--pequeno" data-accion="regenerar"><i class="ri-refresh-line"></i> Generar enlace nuevo</button></div>
        </section>

        <p class="tac-error" data-mensaje hidden></p>`;
    document.body.appendChild(dialogo);

    dialogo.addEventListener("click", (e) => {
        const accion = e.target.closest("[data-accion]")?.dataset.accion;
        if (accion === "cerrar") dialogo.close();
        if (accion === "copiar") copiar();
        if (accion === "guardar") guardar({ password: dialogo.querySelector("#tac-enlace-password").value });
        if (accion === "regenerar") regenerar();
    });
}

function pintar(enlace) {
    dialogo.querySelectorAll("[data-existe]").forEach(seccion => { seccion.hidden = !enlace.existe; });
    dialogo.querySelector("[data-etiqueta-password]").textContent = enlace.existe
        ? "Cambiar la contraseña"
        : "Contraseña para los centros (necesaria para crear el enlace)";
    dialogo.querySelector("[data-accion=guardar]").textContent = enlace.existe ? "Cambiar" : "Crear enlace";
    if (!enlace.existe) return;

    dialogo.querySelector("#tac-enlace-url").value = urlEnvio(enlace.token);
    dialogo.querySelector("[data-actualizado]").textContent =
        `Última modificación: ${formatearFecha(enlace.actualizado)}${enlace.actualizado_por ? ` (${enlace.actualizado_por})` : ""}.`;
}

async function guardar(opciones) {
    mostrarMensaje(null);
    if (!opciones.regenerar && (opciones.password ?? "").length < 8) {
        mostrarMensaje("La contraseña tiene que tener al menos 8 caracteres.", true);
        return;
    }
    try {
        pintar(await guardarEnlace(opciones));
        dialogo.querySelector("#tac-enlace-password").value = "";
        mostrarMensaje(opciones.regenerar ? "Enlace nuevo generado. Mándaselo a los centros." : "Contraseña guardada.");
    } catch (error) {
        mostrarMensaje(error.message, true);
    }
}

async function regenerar() {
    // El Swal no se ve por encima de un <dialog> abierto: se cierra un momento.
    dialogo.close();
    const { isConfirmed } = await Swal.fire({
        title: "¿Generar un enlace nuevo?",
        text: "El enlace actual dejará de funcionar y tendréis que mandar el nuevo a los centros.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Generar",
        cancelButtonText: "Cancelar",
    });
    dialogo.showModal();
    if (isConfirmed) guardar({ regenerar: true });
}

async function copiar() {
    const url = dialogo.querySelector("#tac-enlace-url");
    try {
        await navigator.clipboard.writeText(url.value);
        mostrarMensaje("Enlace copiado.");
    } catch {
        url.select();   // sin acceso al portapapeles: queda seleccionado para copiarlo a mano
    }
}

/** Mensaje dentro del propio modal (un toast quedaría tapado por el fondo del <dialog>). */
function mostrarMensaje(texto, esError = false) {
    clearTimeout(temporizadorOk);
    const caja = dialogo.querySelector("[data-mensaje]");
    caja.textContent = texto ?? "";
    caja.hidden = !texto;
    caja.classList.toggle("tac-error--ok", !!texto && !esError);
    if (texto && !esError) temporizadorOk = setTimeout(() => { caja.hidden = true; }, 3000);
}
