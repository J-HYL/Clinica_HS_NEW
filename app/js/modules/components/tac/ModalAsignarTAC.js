// modules/components/tac/ModalAsignarTAC.js
// Asignar a un paciente un TAC que llegó de un centro externo sin coincidencia
// clara de nombre (o corregir uno mal asignado). El buscador sale ya filtrado
// con el nombre que escribió el centro.

import { crearBuscadorPacientes } from "./BuscadorPacientes.js";
import { asignarEstudio } from "./ApiTAC.js";
import { formatearFecha } from "./utilidades.js";

let dialogo = null;
let buscador = null;
let estudio = null;
let resolver = null;

/**
 * @param {Object} datos - el estudio tal como viene de listar
 * @returns {Promise<boolean>} true si se ha asignado
 */
export function abrirModalAsignarTAC(datos) {
    if (!dialogo) construirDialogo();
    estudio = datos;

    dialogo.querySelector("[data-titulo]").textContent = datos.client_id ? "Cambiar de paciente" : "Asignar paciente";
    dialogo.querySelector("[data-indicado]").textContent = datos.paciente_nombre || "—";
    dialogo.querySelector("[data-origen]").textContent =
        [datos.centro, `recibido el ${formatearFecha(datos.fecha_subida)}`].filter(Boolean).join(" · ");
    dialogo.querySelector("[data-actual]").hidden = !datos.client_id;
    dialogo.querySelector("[data-actual] strong").textContent = datos.paciente ?? "";
    dialogo.querySelector("[data-error]").hidden = true;

    buscador.reiniciar();
    buscador.buscar(datos.paciente_nombre || "");
    actualizarBoton();
    dialogo.showModal();
    buscador.enfocar();
    return new Promise(resolve => { resolver = resolve; });
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "tac-subir tac-subir--estrecho";
    dialogo.setAttribute("aria-labelledby", "tac-asignar-titulo");
    dialogo.innerHTML = `
        <header class="tac-subir__cabecera">
            <h2 class="tac-subir__titulo" id="tac-asignar-titulo" data-titulo>Asignar paciente</h2>
            <button type="button" class="tac-subir__cerrar" data-accion="cerrar" aria-label="Cerrar"><i class="ri-close-line"></i></button>
        </header>

        <dl class="tac-resumen__datos tac-subir__paso">
            <dt>Nombre indicado</dt><dd data-indicado></dd>
            <dt>Origen</dt><dd data-origen></dd>
        </dl>
        <p class="tac-subir__nota" data-actual hidden>Ahora está en la ficha de <strong></strong>.</p>

        <section class="tac-subir__paso">
            <label class="form__label" for="tac-asignar-paciente">Paciente</label>
            <div data-buscador></div>
        </section>

        <p class="tac-error" data-error hidden></p>

        <footer class="tac-subir__pie">
            <button type="button" class="tac-boton tac-boton--secundario" data-accion="cerrar">Cancelar</button>
            <button type="button" class="tac-boton" data-accion="asignar" disabled><i class="ri-user-received-2-line"></i> Asignar</button>
        </footer>`;
    document.body.appendChild(dialogo);

    buscador = crearBuscadorPacientes(dialogo.querySelector("[data-buscador]"), {
        idEntrada: "tac-asignar-paciente",
        alElegir: actualizarBoton,
    });

    dialogo.addEventListener("click", (e) => {
        const accion = e.target.closest("[data-accion]")?.dataset.accion;
        if (accion === "cerrar") terminar(false);
        if (accion === "asignar") asignar();
    });
    dialogo.addEventListener("close", () => terminar(false));
}

function actualizarBoton() {
    const elegido = buscador.paciente;
    dialogo.querySelector("[data-accion=asignar]").disabled =
        !elegido || String(elegido.id) === String(estudio?.client_id);
}

async function asignar() {
    const boton = dialogo.querySelector("[data-accion=asignar]");
    boton.disabled = true;
    try {
        await asignarEstudio(estudio.id, buscador.paciente.id);
        terminar(true);
    } catch (error) {
        const caja = dialogo.querySelector("[data-error]");
        caja.textContent = `No se pudo asignar: ${error.message}`;
        caja.hidden = false;
        actualizarBoton();
    }
}

function terminar(asignado) {
    const pendiente = resolver;
    resolver = null;
    if (dialogo.open) dialogo.close();
    pendiente?.(asignado);
}
