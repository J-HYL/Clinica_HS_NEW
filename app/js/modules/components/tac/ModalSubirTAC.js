// modules/components/tac/ModalSubirTAC.js
// Modal "Añadir TAC" del panel: elegir el paciente (BuscadorPacientes), elegir y
// leer el estudio (SelectorEstudio) y subirlo con su progreso.
//
// Si el nombre del DICOM no coincide con el paciente elegido, hay que
// confirmarlo a mano: un estudio en la ficha equivocada es un riesgo clínico.

import { crearSelectorEstudio } from "./SelectorEstudio.js";
import { crearBuscadorPacientes } from "./BuscadorPacientes.js";
import { subirEstudio } from "./ApiTAC.js";
import { formatearBytes, mismoPaciente } from "./utilidades.js";

let dialogo = null;
let resolver = null;
let selector = null;
let buscador = null;
let estado = {};

/**
 * Abre el modal. Resuelve con el id del estudio subido, o null si se cierra.
 * @returns {Promise<number|null>}
 */
export function abrirModalSubirTAC() {
    if (!dialogo) construirDialogo();
    estado = { subiendo: false, controlador: null };
    selector.reiniciar();
    buscador.reiniciar();
    buscador.bloquear(false);
    dialogo.querySelector("#tac-descripcion").value = "";
    dialogo.querySelector("#tac-descripcion").disabled = false;
    dialogo.querySelector("[data-error]").hidden = true;
    comprobarPaciente();
    dialogo.showModal();
    buscador.enfocar();
    return new Promise(resolve => { resolver = resolve; });
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "tac-subir";
    dialogo.setAttribute("aria-labelledby", "tac-subir-titulo");
    dialogo.innerHTML = `
        <header class="tac-subir__cabecera">
            <h2 class="tac-subir__titulo" id="tac-subir-titulo">Añadir TAC</h2>
            <button type="button" class="tac-subir__cerrar" data-accion="cerrar" aria-label="Cerrar"><i class="ri-close-line"></i></button>
        </header>

        <section class="tac-subir__paso">
            <label class="form__label" for="tac-buscar-paciente">1. Paciente</label>
            <div data-buscador></div>
        </section>

        <section class="tac-subir__paso">
            <span class="form__label">2. Estudio</span>
            <div data-selector></div>
            <label class="tac-confirmar" data-confirmar hidden>
                <input type="checkbox">
                <span>El nombre del estudio no coincide con el paciente elegido. Confirmo que este TAC es de <strong></strong>.</span>
            </label>
        </section>

        <section class="tac-subir__paso">
            <label class="form__label" for="tac-descripcion">3. Descripción <span class="tac-opcional">(opcional)</span></label>
            <input type="text" id="tac-descripcion" class="form__input" maxlength="255" placeholder="Ej.: CBCT maxilar para valorar implante">
        </section>

        <p class="tac-error" data-error hidden></p>

        <footer class="tac-subir__pie">
            <button type="button" class="tac-boton tac-boton--secundario" data-accion="cerrar">Cancelar</button>
            <button type="button" class="tac-boton" data-accion="subir" disabled><i class="ri-upload-2-line"></i> Subir TAC</button>
        </footer>`;
    document.body.appendChild(dialogo);

    buscador = crearBuscadorPacientes(dialogo.querySelector("[data-buscador]"), {
        idEntrada: "tac-buscar-paciente",
        alElegir: comprobarPaciente,
    });
    selector = crearSelectorEstudio(dialogo.querySelector("[data-selector]"), {
        alCambiar: (fase) => {
            const descripcion = dialogo.querySelector("#tac-descripcion");
            if (fase === "listo" && !descripcion.value) descripcion.value = selector.analisis.estudio.descripcion ?? "";
            comprobarPaciente();
        },
    });

    dialogo.addEventListener("click", (e) => {
        const accion = e.target.closest("[data-accion]")?.dataset.accion;
        if (accion === "cerrar") cerrar();
        if (accion === "subir") subir();
    });
    dialogo.querySelector("[data-confirmar] input").addEventListener("change", actualizarBoton);

    // Esc hace lo mismo que el botón Cancelar...
    dialogo.addEventListener("cancel", (e) => {
        e.preventDefault();
        cerrar();
    });
    // ...pero Chrome no deja frenar un segundo Esc seguido y el <dialog> se
    // cierra solo: aquí se corta lo que hubiera en marcha y se resuelve igual.
    dialogo.addEventListener("close", () => {
        if (!resolver) return;
        estado.controlador?.abort();
        selector.cancelar();
        terminar(null);
    });
}

/** Contrasta el nombre del DICOM con el paciente elegido. */
function comprobarPaciente() {
    const confirmar = dialogo.querySelector("[data-confirmar]");
    const paciente = buscador.paciente;
    const analisis = selector.analisis;
    estado.requiereConfirmar = !!(paciente && analisis) && mismoPaciente(analisis.paciente.nombre, paciente.nombre) === false;
    confirmar.hidden = !estado.requiereConfirmar;
    confirmar.querySelector("input").checked = false;
    confirmar.querySelector("strong").textContent = paciente?.nombre ?? "";
    actualizarBoton();
}

function actualizarBoton() {
    const confirmado = !estado.requiereConfirmar || dialogo.querySelector("[data-confirmar] input").checked;
    dialogo.querySelector("[data-accion=subir]").disabled =
        estado.subiendo || !buscador.paciente || !selector.analisis || !confirmado;
}

async function subir() {
    const sesion = estado;
    const paciente = buscador.paciente;
    const { geometria, estudio, sha256 } = selector.analisis;

    dialogo.querySelector("[data-error]").hidden = true;
    sesion.subiendo = true;
    sesion.controlador = new AbortController();
    bloquear(true);
    const botonCancelar = dialogo.querySelector(".tac-subir__pie [data-accion=cerrar]");
    botonCancelar.textContent = "Cancelar subida";

    try {
        const id = await subirEstudio(selector.zipParaSubir(), {
            client_id: paciente.id,
            sha256,
            descripcion: dialogo.querySelector("#tac-descripcion").value.trim(),
            fecha_estudio: estudio.fecha,
            equipo: estudio.equipo,
            cortes: geometria.cortes,
            ancho: geometria.ancho,
            alto: geometria.alto,
            voxel_x: geometria.voxel[0],
            voxel_y: geometria.voxel[1],
            voxel_z: geometria.voxel[2],
        }, (subido, total) => {
            if (estado !== sesion) return;
            selector.progreso(`Subiendo… ${Math.floor((subido / total) * 100)} % (${formatearBytes(subido)} de ${formatearBytes(total)})`, subido / total);
        }, sesion.controlador.signal);

        if (estado === sesion) terminar(id);
    } catch (error) {
        if (estado !== sesion) return;   // el modal se cerró: ApiTAC ya borró lo subido
        sesion.controlador = null;
        sesion.subiendo = false;
        selector.ocultarProgreso();
        if (error.name !== "AbortError") {
            const caja = dialogo.querySelector("[data-error]");
            caja.textContent = `No se pudo subir el estudio: ${error.message}`;
            caja.hidden = false;
        }
        bloquear(false);
    } finally {
        botonCancelar.textContent = "Cancelar";
    }
}

function bloquear(si) {
    selector.bloquear(si);
    buscador.bloquear(si);
    dialogo.querySelector("#tac-descripcion").disabled = si;
    dialogo.querySelector("[data-confirmar] input").disabled = si;
    actualizarBoton();
}

function cerrar() {
    // Subiendo: "Cancelar subida" la corta (ApiTAC borra lo ya subido) y el
    // modal sigue abierto por si se quiere reintentar.
    if (estado.subiendo) {
        estado.controlador?.abort();
        return;
    }
    // Leyendo el estudio, o sin nada en marcha: se corta lo que haya y se cierra.
    selector.cancelar();
    terminar(null);
}

function terminar(resultado) {
    const pendiente = resolver;
    resolver = null;          // antes de close(): así el evento "close" no resuelve dos veces
    estado = {};
    if (dialogo.open) dialogo.close();
    pendiente?.(resultado);
}
