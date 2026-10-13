// modules/components/tac/ModalSubirTAC.js
// Modal "Añadir TAC": elegir el paciente, elegir el .zip, revisar lo que se ha
// leído del estudio (vista previa, datos, avisos) y subirlo con su progreso.
//
// El zip se analiza en el navegador ANTES de subir nada: si no es un TAC válido
// se sabe al momento, y no después de esperar a que suban cientos de MB.
// Si el nombre del DICOM no coincide con el paciente elegido, hay que
// confirmarlo a mano: un estudio en la ficha equivocada es un riesgo clínico.

import { analizarZip, FASES } from "./LectorDicom.js";
import { subirEstudio } from "./ApiTAC.js";
import { formatearBytes, formatearFecha, textoVoxel, mismoPaciente } from "./utilidades.js";
import { escapeHtml } from "../../html.js";
import DB from "../../classes/DB_API.js";

const TAMANO_MAXIMO = 2 * 1024 ** 3;   // el mismo límite que tac.php

let dialogo = null;
let resolver = null;
let pacientes = null;
let estado = {};

/**
 * Abre el modal. Resuelve con el id del estudio subido, o null si se cierra.
 * @returns {Promise<number|null>}
 */
export function abrirModalSubirTAC() {
    if (!dialogo) construirDialogo();
    estado = { paciente: null, archivo: null, analisis: null, ocupado: false, controlador: null };
    reiniciarVista();
    dialogo.showModal();
    cargarPacientes();
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
            <div class="tac-paciente" data-elegido hidden>
                <i class="ri-user-3-line"></i>
                <span class="tac-paciente__nombre"></span>
                <button type="button" class="tac-enlace" data-accion="cambiar-paciente">Cambiar</button>
            </div>
            <div class="tac-buscador" data-buscador>
                <input type="search" id="tac-buscar-paciente" class="form__input" placeholder="Buscar por nombre o teléfono" autocomplete="off">
                <ul class="tac-buscador__resultados" data-resultados></ul>
            </div>
        </section>

        <section class="tac-subir__paso">
            <span class="form__label">2. Estudio <span class="tac-opcional">(.zip con los archivos .dcm)</span></span>
            <label class="tac-zona" data-zona>
                <input type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden>
                <i class="ri-upload-cloud-2-line"></i>
                <span class="tac-zona__texto">Arrastra aquí el .zip o <u>elígelo</u></span>
                <span class="tac-zona__nota">La carpeta DICOM que exporta el equipo (Romexis), comprimida en .zip</span>
            </label>
            <div class="tac-progreso" data-progreso hidden>
                <p class="tac-progreso__texto"></p>
                <div class="tac-progreso__barra"><span></span></div>
            </div>
            <div class="tac-resumen" data-resumen hidden>
                <canvas class="tac-resumen__previa" aria-label="Vista previa del corte central"></canvas>
                <dl class="tac-resumen__datos"></dl>
            </div>
            <ul class="tac-avisos" data-avisos hidden></ul>
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

    dialogo.addEventListener("click", alPulsar);
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
        terminar(null);
    });

    const buscador = dialogo.querySelector("#tac-buscar-paciente");
    buscador.addEventListener("input", pintarResultados);

    const zona = dialogo.querySelector("[data-zona]");
    const entrada = zona.querySelector("input[type=file]");
    entrada.addEventListener("change", () => {
        if (entrada.files[0]) elegirArchivo(entrada.files[0]);
        entrada.value = "";
    });
    zona.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!estado.ocupado) zona.classList.add("tac-zona--encima");
    });
    zona.addEventListener("dragleave", () => zona.classList.remove("tac-zona--encima"));
    zona.addEventListener("drop", (e) => {
        e.preventDefault();
        zona.classList.remove("tac-zona--encima");
        const archivo = e.dataTransfer.files[0];
        if (archivo && !estado.ocupado) elegirArchivo(archivo);
    });

    dialogo.querySelector("[data-confirmar] input").addEventListener("change", actualizarBoton);
}

function reiniciarVista() {
    dialogo.querySelector("#tac-buscar-paciente").value = "";
    dialogo.querySelector("#tac-descripcion").value = "";
    dialogo.querySelector("[data-confirmar] input").checked = false;
    mostrar("[data-elegido]", false);
    mostrar("[data-buscador]", true);
    mostrar("[data-zona]", true);
    for (const selector of ["[data-progreso]", "[data-resumen]", "[data-avisos]", "[data-confirmar]", "[data-error]"]) {
        mostrar(selector, false);
    }
    bloquear(false);
    pintarResultados();
}

function mostrar(selector, visible) {
    dialogo.querySelector(selector).hidden = !visible;
}

// --- paciente ---------------------------------------------------------------

async function cargarPacientes() {
    if (pacientes) return;
    try {
        pacientes = await DB.getRecords("clients");
        pintarResultados();
    } catch (error) {
        mostrarError(`No se pudo cargar la lista de pacientes: ${error.message}`);
    }
}

function normalizar(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function pintarResultados() {
    const lista = dialogo.querySelector("[data-resultados]");
    const texto = normalizar(dialogo.querySelector("#tac-buscar-paciente").value.trim());
    if (!pacientes || !texto) {
        lista.innerHTML = "";
        return;
    }

    const encontrados = pacientes
        .filter(p => normalizar(p.nombre).includes(texto) || String(p.telefono ?? "").includes(texto))
        .slice(0, 8);

    lista.innerHTML = encontrados.length
        ? encontrados.map(p => `
            <li>
                <button type="button" class="tac-buscador__opcion" data-accion="elegir-paciente" data-id="${escapeHtml(p.id)}">
                    <span>${escapeHtml(p.nombre)}</span>
                    <small>${escapeHtml(p.telefono || "")}</small>
                </button>
            </li>`).join("")
        : `<li class="tac-buscador__vacio">Ningún paciente coincide con la búsqueda.</li>`;
}

function elegirPaciente(id) {
    const paciente = pacientes?.find(p => String(p.id) === String(id));
    if (!paciente) return;
    estado.paciente = { id: paciente.id, nombre: paciente.nombre };
    dialogo.querySelector(".tac-paciente__nombre").textContent = paciente.nombre;
    mostrar("[data-elegido]", true);
    mostrar("[data-buscador]", false);
    comprobarPaciente();
}

function cambiarPaciente() {
    estado.paciente = null;
    mostrar("[data-elegido]", false);
    mostrar("[data-buscador]", true);
    const buscador = dialogo.querySelector("#tac-buscar-paciente");
    buscador.value = "";
    pintarResultados();
    buscador.focus();
    comprobarPaciente();
}

/** Contrasta el nombre del DICOM con el paciente elegido. */
function comprobarPaciente() {
    const confirmar = dialogo.querySelector("[data-confirmar]");
    const nombreDicom = estado.analisis?.paciente?.nombre;
    const coincide = estado.paciente && estado.analisis
        ? mismoPaciente(nombreDicom, estado.paciente.nombre)
        : true;

    estado.requiereConfirmar = coincide === false;
    confirmar.hidden = !estado.requiereConfirmar;
    confirmar.querySelector("input").checked = false;
    confirmar.querySelector("strong").textContent = estado.paciente?.nombre ?? "";
    actualizarBoton();
}

// --- archivo y análisis -----------------------------------------------------

async function elegirArchivo(archivo) {
    mostrar("[data-error]", false);
    if (!/\.zip$/i.test(archivo.name)) {
        mostrarError("El estudio tiene que ser un archivo .zip con los .dcm dentro.");
        return;
    }
    if (archivo.size > TAMANO_MAXIMO) {
        mostrarError(`El archivo pesa ${formatearBytes(archivo.size)}: el máximo es 2 GB.`);
        return;
    }

    // Si el modal se cierra (y se vuelve a abrir) mientras se lee el zip, el
    // resultado de esta lectura ya no es de la sesión actual: se descarta.
    const sesion = estado;
    sesion.archivo = archivo;
    sesion.analisis = null;
    sesion.controlador = new AbortController();
    mostrar("[data-resumen]", false);
    mostrar("[data-avisos]", false);
    mostrar("[data-zona]", false);
    bloquear(true);
    progreso(`Abriendo ${archivo.name}…`, null);

    try {
        const analisis = await analizarZip(await archivo.arrayBuffer(), (p) => {
            if (estado !== sesion) return;
            const fraccion = p.total > 1 ? p.hechos / p.total : null;
            progreso(`${FASES[p.fase] ?? "Procesando"}…${p.total > 1 ? ` ${p.hechos} / ${p.total}` : ""}`, fraccion);
        }, sesion.controlador.signal);
        if (estado !== sesion) return;
        sesion.analisis = analisis;
        pintarResumen(analisis);
        const descripcion = dialogo.querySelector("#tac-descripcion");
        if (!descripcion.value && analisis.estudio.descripcion) descripcion.value = analisis.estudio.descripcion;
        mostrar("[data-progreso]", false);
    } catch (error) {
        if (estado !== sesion) return;
        sesion.archivo = null;
        mostrar("[data-progreso]", false);
        mostrar("[data-zona]", true);
        if (error.name !== "AbortError") mostrarError(error.message);
    } finally {
        if (estado === sesion) {
            sesion.controlador = null;
            bloquear(false);
            comprobarPaciente();
        }
    }
}

function pintarResumen(analisis) {
    const { vistaPrevia, geometria, estudio, paciente } = analisis;

    const lienzo = dialogo.querySelector(".tac-resumen__previa");
    lienzo.width = vistaPrevia.ancho;
    lienzo.height = vistaPrevia.alto;
    lienzo.getContext("2d").putImageData(new ImageData(vistaPrevia.rgba, vistaPrevia.ancho, vistaPrevia.alto), 0, 0);

    const datos = [
        ["Archivo", estado.archivo.name],
        ["Paciente (DICOM)", paciente.nombre || "Sin nombre en el estudio"],
        ["Fecha del estudio", formatearFecha(estudio.fecha)],
        ["Equipo", estudio.equipo || "—"],
        ["Volumen", `${geometria.ancho} × ${geometria.alto} × ${geometria.cortes} cortes`],
        ["Vóxel", textoVoxel(...geometria.voxel)],
        ["A subir", formatearBytes(analisis.tamano)],
    ];
    dialogo.querySelector(".tac-resumen__datos").innerHTML = datos
        .map(([etiqueta, valor]) => `<dt>${escapeHtml(etiqueta)}</dt><dd>${escapeHtml(valor)}</dd>`)
        .join("");
    mostrar("[data-resumen]", true);

    const avisos = dialogo.querySelector("[data-avisos]");
    avisos.innerHTML = analisis.avisos.map(a => `<li>${escapeHtml(a)}</li>`).join("");
    avisos.hidden = !analisis.avisos.length;
}

// --- subida -----------------------------------------------------------------

async function subir() {
    const sesion = estado;
    const { paciente, analisis, archivo } = sesion;
    if (!paciente || !analisis) return;

    mostrar("[data-error]", false);
    bloquear(true);
    sesion.subiendo = true;
    sesion.controlador = new AbortController();
    const botonCancelar = dialogo.querySelector(".tac-subir__pie [data-accion=cerrar]");
    botonCancelar.textContent = "Cancelar subida";

    // Si el lector depuró el zip se sube esa versión; si no, el archivo tal cual.
    const zip = analisis.zip ? new Blob([analisis.zip], { type: "application/zip" }) : archivo;
    const { geometria, estudio } = analisis;

    try {
        const id = await subirEstudio(zip, {
            client_id: paciente.id,
            sha256: analisis.sha256,
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
            progreso(`Subiendo… ${Math.floor((subido / total) * 100)} % (${formatearBytes(subido)} de ${formatearBytes(total)})`, subido / total);
        }, sesion.controlador.signal);

        if (estado === sesion) terminar(id);
    } catch (error) {
        if (estado !== sesion) return;   // el modal se cerró: ApiTAC ya borró lo subido
        sesion.controlador = null;
        sesion.subiendo = false;
        mostrar("[data-progreso]", false);
        if (error.name !== "AbortError") mostrarError(`No se pudo subir el estudio: ${error.message}`);
        bloquear(false);
    } finally {
        botonCancelar.textContent = "Cancelar";
    }
}

// --- comunes ----------------------------------------------------------------

function alPulsar(e) {
    const boton = e.target.closest("[data-accion]");
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === "cerrar") cerrar();
    if (accion === "subir") subir();
    if (accion === "elegir-paciente") elegirPaciente(boton.dataset.id);
    if (accion === "cambiar-paciente" && !estado.ocupado) cambiarPaciente();
}

function cerrar() {
    // Subiendo: "Cancelar subida" la corta (ApiTAC borra lo ya subido) y el
    // modal sigue abierto por si se quiere reintentar.
    if (estado.subiendo) {
        estado.controlador?.abort();
        return;
    }
    // Leyendo el zip, o sin nada en marcha: se corta lo que haya y se cierra.
    estado.controlador?.abort();
    terminar(null);
}

function terminar(resultado) {
    const pendiente = resolver;
    resolver = null;          // antes de close(): así el evento "close" no resuelve dos veces
    estado = {};
    if (dialogo.open) dialogo.close();
    pendiente?.(resultado);
}

function bloquear(ocupado) {
    estado.ocupado = ocupado;
    dialogo.classList.toggle("tac-subir--ocupado", ocupado);
    dialogo.querySelector("#tac-descripcion").disabled = ocupado;
    dialogo.querySelector("[data-confirmar] input").disabled = ocupado;
    actualizarBoton();
}

function actualizarBoton() {
    const confirmado = !estado.requiereConfirmar || dialogo.querySelector("[data-confirmar] input").checked;
    dialogo.querySelector("[data-accion=subir]").disabled =
        estado.ocupado || !estado.paciente || !estado.analisis || !confirmado;
}

function progreso(texto, fraccion) {
    const caja = dialogo.querySelector("[data-progreso]");
    caja.hidden = false;
    caja.querySelector(".tac-progreso__texto").textContent = texto;
    const barra = caja.querySelector(".tac-progreso__barra");
    barra.classList.toggle("tac-progreso__barra--indefinida", fraccion === null);
    barra.querySelector("span").style.width = fraccion === null ? "" : `${Math.round(fraccion * 100)}%`;
}

function mostrarError(mensaje) {
    const caja = dialogo.querySelector("[data-error]");
    caja.textContent = mensaje;
    caja.hidden = false;
}
