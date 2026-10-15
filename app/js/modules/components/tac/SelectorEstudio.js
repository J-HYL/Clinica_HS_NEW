// modules/components/tac/SelectorEstudio.js
// Elegir un estudio TAC (la CARPETA que exporta el equipo, o un .zip con ella;
// con botón o arrastrándolo), leerlo en el navegador y enseñar lo que se ha
// leído: vista previa, datos y avisos. Lo usan el modal "Añadir TAC" del panel
// y la página pública de envío (enviar.html): mismo componente en los dos.
//
// Se lee ANTES de subir nada: si no es un TAC válido se sabe al momento, y no
// después de esperar a que suban cientos de MB.

import { analizarEstudio, FASES } from "./LectorDicom.js";
import { formatearBytes, formatearFecha, textoVoxel } from "./utilidades.js";
import { escapeHtml } from "../../html.js";

const TAMANO_MAXIMO = 2 * 1024 ** 3;   // el mismo límite que la API

/**
 * @param {HTMLElement} contenedor
 * @param {{ alCambiar?: (fase: "vacio"|"leyendo"|"listo"|"error") => void }} opciones
 */
export function crearSelectorEstudio(contenedor, { alCambiar } = {}) {
    contenedor.innerHTML = `
        <div class="tac-zona" data-zona>
            <i class="ri-upload-cloud-2-line"></i>
            <span class="tac-zona__texto">Arrastra aquí la carpeta del estudio</span>
            <span class="tac-zona__nota">La carpeta DICOM que exporta el equipo (con los archivos .dcm), o un .zip con ella</span>
            <div class="tac-zona__botones">
                <label class="tac-boton tac-boton--secundario tac-boton--pequeno">
                    <i class="ri-folder-open-line"></i> Elegir carpeta
                    <input type="file" webkitdirectory multiple hidden data-carpeta>
                </label>
                <label class="tac-boton tac-boton--secundario tac-boton--pequeno">
                    <i class="ri-file-zip-line"></i> Elegir .zip
                    <input type="file" accept=".zip,application/zip,application/x-zip-compressed" hidden data-zip>
                </label>
            </div>
        </div>
        <div class="tac-progreso" data-progreso hidden>
            <p class="tac-progreso__texto"></p>
            <div class="tac-progreso__barra"><span></span></div>
        </div>
        <div class="tac-resumen" data-resumen hidden>
            <canvas class="tac-resumen__previa" aria-label="Vista previa del corte central"></canvas>
            <div>
                <dl class="tac-resumen__datos"></dl>
                <button type="button" class="tac-enlace tac-resumen__otro" data-otro>Elegir otro estudio</button>
            </div>
        </div>
        <ul class="tac-avisos" data-avisos hidden></ul>
        <p class="tac-error" data-error hidden></p>`;

    const $ = (selector) => contenedor.querySelector(selector);
    const zona = $("[data-zona]");

    let analisis = null;
    let zipOriginal = null;    // el .zip elegido, si se sube tal cual
    let nombre = null;
    let controlador = null;
    let lectura = 0;           // cada lectura nueva deja obsoletas las anteriores
    let bloqueado = false;

    function mostrar(selector, visible) {
        $(selector).hidden = !visible;
    }

    function progreso(texto, fraccion) {
        mostrar("[data-progreso]", true);
        $(".tac-progreso__texto").textContent = texto;
        const barra = $(".tac-progreso__barra");
        barra.classList.toggle("tac-progreso__barra--indefinida", fraccion === null);
        barra.querySelector("span").style.width = fraccion === null ? "" : `${Math.round(fraccion * 100)}%`;
    }

    function mostrarError(mensaje) {
        $("[data-error]").textContent = mensaje;
        mostrar("[data-error]", true);
    }

    function volverAElegir() {
        lectura++;
        controlador?.abort();
        controlador = null;
        analisis = null;
        zipOriginal = null;
        nombre = null;
        for (const selector of ["[data-progreso]", "[data-resumen]", "[data-avisos]", "[data-error]"]) mostrar(selector, false);
        mostrar("[data-zona]", true);
    }

    /** @param {{zip: File} | {ficheros: {ruta, archivo}[]}} origen */
    async function leer(origen, nombreMostrado) {
        volverAElegir();
        const esta = lectura;
        controlador = new AbortController();
        nombre = nombreMostrado;
        mostrar("[data-zona]", false);
        progreso(`Abriendo ${nombreMostrado}…`, null);
        alCambiar?.("leyendo");

        try {
            const datos = origen.zip ? { zip: await origen.zip.arrayBuffer() } : { ficheros: origen.ficheros };
            const resultado = await analizarEstudio(datos, (p) => {
                if (esta !== lectura) return;
                const conTotal = p.total > 1;
                progreso(`${FASES[p.fase] ?? "Procesando"}…${conTotal ? ` ${p.hechos} / ${p.total}` : ""}`, conTotal ? p.hechos / p.total : null);
            }, controlador.signal);
            if (esta !== lectura) return;

            analisis = resultado;
            zipOriginal = origen.zip ?? null;
            mostrar("[data-progreso]", false);
            pintarResumen();
            alCambiar?.("listo");
        } catch (error) {
            if (esta !== lectura) return;
            mostrar("[data-progreso]", false);
            mostrar("[data-zona]", true);
            if (error.name !== "AbortError") mostrarError(error.message);
            alCambiar?.(error.name === "AbortError" ? "vacio" : "error");
        } finally {
            if (esta === lectura) controlador = null;
        }
    }

    function pintarResumen() {
        const { vistaPrevia, geometria, estudio, paciente, avisos } = analisis;

        const lienzo = $(".tac-resumen__previa");
        lienzo.width = vistaPrevia.ancho;
        lienzo.height = vistaPrevia.alto;
        lienzo.getContext("2d").putImageData(new ImageData(vistaPrevia.rgba, vistaPrevia.ancho, vistaPrevia.alto), 0, 0);

        const datos = [
            ["Estudio", nombre],
            ["Paciente (DICOM)", paciente.nombre || "Sin nombre en el estudio"],
            ["Fecha del estudio", formatearFecha(estudio.fecha)],
            ["Equipo", estudio.equipo || "—"],
            ["Volumen", `${geometria.ancho} × ${geometria.alto} × ${geometria.cortes} cortes`],
            ["Vóxel", textoVoxel(...geometria.voxel)],
            ["A subir", formatearBytes(analisis.tamano)],
        ];
        $(".tac-resumen__datos").innerHTML = datos
            .map(([etiqueta, valor]) => `<dt>${escapeHtml(etiqueta)}</dt><dd>${escapeHtml(valor)}</dd>`)
            .join("");
        mostrar("[data-resumen]", true);

        $("[data-avisos]").innerHTML = avisos.map(a => `<li>${escapeHtml(a)}</li>`).join("");
        mostrar("[data-avisos]", avisos.length > 0);
    }

    // --- formas de elegir el estudio ---

    function elegirZip(archivo) {
        if (!/\.zip$/i.test(archivo.name)) return mostrarError("Elige la carpeta del estudio o un archivo .zip.");
        if (archivo.size > TAMANO_MAXIMO) return mostrarError(`El archivo pesa ${formatearBytes(archivo.size)}: el máximo es 2 GB.`);
        leer({ zip: archivo }, archivo.name);
    }

    function elegirCarpeta(ficheros) {
        if (!ficheros.length) return mostrarError("La carpeta está vacía.");
        // Con carpeta, sus ficheros vienen como "CARPETA/..."; sueltos, solo con su nombre.
        const carpeta = ficheros[0].ruta.includes("/") ? `${ficheros[0].ruta.split("/")[0]} · ` : "";
        leer({ ficheros }, `${carpeta}${ficheros.length} archivos`);
    }

    $("[data-carpeta]").addEventListener("change", (e) => {
        const ficheros = [...e.target.files].map(f => ({ ruta: f.webkitRelativePath || f.name, archivo: f }));
        e.target.value = "";
        if (!bloqueado) elegirCarpeta(ficheros);
    });

    $("[data-zip]").addEventListener("change", (e) => {
        const archivo = e.target.files[0];
        e.target.value = "";
        if (archivo && !bloqueado) elegirZip(archivo);
    });

    zona.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!bloqueado) zona.classList.add("tac-zona--encima");
    });
    zona.addEventListener("dragleave", () => zona.classList.remove("tac-zona--encima"));
    zona.addEventListener("drop", async (e) => {
        e.preventDefault();
        zona.classList.remove("tac-zona--encima");
        if (bloqueado) return;
        // Las entradas hay que sacarlas YA: el DataTransfer se vacía tras el primer await.
        const entradas = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry?.()).filter(Boolean);
        const sueltos = [...e.dataTransfer.files];
        try {
            const ficheros = entradas.length ? await archivosDeEntradas(entradas) : sueltos.map(f => ({ ruta: f.name, archivo: f }));
            if (ficheros.length === 1 && /\.zip$/i.test(ficheros[0].archivo.name)) elegirZip(ficheros[0].archivo);
            else elegirCarpeta(ficheros);
        } catch {
            mostrarError("No se pudo leer lo que has arrastrado. Prueba con el botón «Elegir carpeta».");
        }
    });

    $("[data-otro]").addEventListener("click", () => {
        if (bloqueado) return;
        volverAElegir();
        alCambiar?.("vacio");
    });

    return {
        get analisis() { return analisis; },
        /** Lo que hay que subir: el zip que preparó el lector, o el .zip elegido tal cual. */
        zipParaSubir() {
            if (analisis?.zip) return new Blob([analisis.zip], { type: "application/zip" });
            return zipOriginal;
        },
        progreso,
        ocultarProgreso() { mostrar("[data-progreso]", false); },
        bloquear(si) {
            bloqueado = si;
            contenedor.classList.toggle("tac-selector--bloqueado", si);
        },
        cancelar() { controlador?.abort(); },
        reiniciar() {
            volverAElegir();
            this.bloquear(false);
        },
    };
}

/** Ficheros de lo arrastrado, recorriendo las carpetas: [{ruta, archivo}]. */
async function archivosDeEntradas(entradas) {
    const ficheros = [];
    async function recorrer(entrada) {
        if (entrada.isFile) {
            const archivo = await new Promise((ok, ko) => entrada.file(ok, ko));
            ficheros.push({ ruta: entrada.fullPath.replace(/^\//, ""), archivo });
            return;
        }
        // readEntries devuelve las entradas por tandas: hay que pedir hasta que no queden.
        const lector = entrada.createReader();
        for (;;) {
            const tanda = await new Promise((ok, ko) => lector.readEntries(ok, ko));
            if (!tanda.length) break;
            for (const hija of tanda) await recorrer(hija);
        }
    }
    for (const entrada of entradas) await recorrer(entrada);
    return ficheros;
}
