import { obtenerEstudio, descargarEstudio, marcarVisto } from "../../modules/components/tac/ApiTAC.js";
import { montarVolumen, FASES } from "../../modules/components/tac/LectorDicom.js";
import VistaCorte from "../../modules/components/tac/VistaCorte.js";
import Vista3D from "../../modules/components/tac/Vista3D.js";
import { esEscritorio, formatearBytes, formatearFecha, textoVoxel } from "../../modules/components/tac/utilidades.js";
import { escapeHtml } from "../../modules/html.js";

// Visor de un estudio TAC: descarga el zip (tac.php), lo monta en el navegador
// (LectorDicom) y lo pinta en cuatro vistas: axial, coronal, sagital y 3D.

//* Selectores Específicos
const rejilla = document.querySelector("#rejilla");
const marco = document.querySelector("#marco");
const carga = document.querySelector("#carga");
const titulo = document.querySelector("#titulo");
const datosEstudio = document.querySelector("#datos-estudio");
const listaAvisos = document.querySelector("#avisos");
const umbral = document.querySelector("#umbral");
const botonMedir = document.querySelector("#medir");
const botonPantalla = document.querySelector("#pantalla-completa");

const PLANOS_2D = ["axial", "coronal", "sagital"];

let visor = null;          // estado compartido con las vistas 2D (ver VistaCorte.js)
let vistas = [];
let vista3D = null;
let ventanas = {};         // contrastes predefinidos de este estudio
let pintadoPendiente = false;

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    // En móvil/tablet tac.css ya muestra el aviso: no se descarga nada.
    if (esEscritorio()) abrirEstudio();
});

async function abrirEstudio() {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return mostrarError("No se ha indicado qué estudio abrir.");

    try {
        const estudio = await obtenerEstudio(id);
        pintarCabecera(estudio);
        // Abrirlo cuenta como "visto": el aviso de la campana ya no hace falta.
        if (Number(estudio.visto) === 0) marcarVisto(estudio.id).catch(() => {});

        const zip = await descargarEstudio(estudio.id, Number(estudio.tamano), (hecho, total) => {
            mostrarCarga("Descargando el estudio", hecho / total, `${formatearBytes(hecho)} de ${formatearBytes(total)}`);
        });
        const resultado = await montarVolumen(zip, (p) => {
            const conTotal = p.total > 1;
            mostrarCarga(FASES[p.fase] ?? "Procesando", conTotal ? p.hechos / p.total : null, conTotal ? `${p.hechos} de ${p.total}` : "");
        });
        montarVisor(resultado);
    } catch (error) {
        mostrarError(error.message);
    }
}

function pintarCabecera(estudio) {
    titulo.textContent = estudio.paciente || `Sin asignar · ${estudio.paciente_nombre || "paciente sin indicar"}`;
    const fecha = formatearFecha(estudio.fecha_estudio);
    datosEstudio.textContent = [
        fecha !== "—" ? `Estudio del ${fecha}` : null,
        estudio.descripcion,
        estudio.equipo,
        estudio.cortes ? `${estudio.ancho} × ${estudio.alto} × ${estudio.cortes} · vóxel ${textoVoxel(estudio.voxel_x, estudio.voxel_y, estudio.voxel_z)}` : null,
    ].filter(Boolean).join(" · ");
}

//* Montaje

function montarVisor({ volumen, volumen3D, estadisticas, ventana, avisos }) {
    const [nx, ny, nz] = volumen.dims;
    visor = {
        volumen,
        cursor: [nx >> 1, ny >> 1, nz >> 1],
        ventana: { ...ventana },
        modo: null,
        // Cuánto cambia el contraste por píxel de arrastre, a escala de cada estudio.
        sensibilidadVentana: Math.max(0.5, (estadisticas.p999 - estadisticas.p1) / 600),
        alCambiar: programarPintado,
        alternarAmpliada,
    };
    ventanas = {
        estudio: { ...ventana },
        hueso: ventanaEntre(estadisticas.umbralTejido, estadisticas.p999),
        dientes: ventanaEntre(estadisticas.umbralHueso, estadisticas.p999),
    };

    vistas = PLANOS_2D.map(plano =>
        new VistaCorte(rejilla.querySelector(`[data-vista="${plano}"] .tac-panel__lienzo`), plano, visor));
    montar3D(volumen3D || volumen, estadisticas);
    pintarAvisos(avisos);
    cablearHerramientas();
    carga.hidden = true;
}

function ventanaEntre(bajo, alto) {
    return { centro: (bajo + alto) / 2, ancho: Math.max(1, alto - bajo) };
}

function montar3D(volumen, estadisticas) {
    const contenedor = rejilla.querySelector(".tac-panel__lienzo--3d");
    try {
        if (typeof vtk === "undefined") throw new Error("vtk.js no cargado");
        vista3D = new Vista3D(contenedor, volumen, estadisticas);
    } catch (error) {
        console.error("Vista 3D no disponible:", error);
        contenedor.innerHTML = `<p class="tac-panel__mensaje">La vista 3D no está disponible en este equipo (necesita conexión y una tarjeta gráfica con WebGL 2). Los cortes funcionan igual.</p>`;
        document.querySelectorAll("[data-preset3d]").forEach(b => (b.disabled = true));
        return;
    }

    umbral.min = estadisticas.p1;
    umbral.max = estadisticas.p999;
    umbral.step = Math.max((estadisticas.p999 - estadisticas.p1) / 400, 0.001);
    umbral.value = vista3D.umbral;
    umbral.disabled = false;
}

function pintarAvisos(avisos) {
    listaAvisos.innerHTML = avisos.map(aviso => `<li>${escapeHtml(aviso)}</li>`).join("");
    listaAvisos.hidden = !avisos.length;
}

//* Pintado

/** Las vistas avisan de cada cambio; se pinta como mucho una vez por fotograma. */
function programarPintado() {
    if (pintadoPendiente) return;
    pintadoPendiente = true;
    requestAnimationFrame(() => {
        pintadoPendiente = false;
        vistas.forEach(vista => vista.pintar());
    });
}

function alternarAmpliada(plano) {
    const panel = rejilla.querySelector(`[data-vista="${plano}"]`);
    const ampliar = !panel.classList.contains("tac-panel--ampliado");
    rejilla.classList.toggle("tac-rejilla--ampliada", ampliar);
    rejilla.querySelectorAll(".tac-panel").forEach(p => {
        const esta = ampliar && p === panel;
        p.classList.toggle("tac-panel--ampliado", esta);
        const icono = p.querySelector(".tac-panel__ampliar i");
        icono.className = esta ? "ri-fullscreen-exit-line" : "ri-fullscreen-line";
    });
}

//* Herramientas

function cablearHerramientas() {
    document.querySelectorAll("[data-ventana]").forEach(boton => boton.addEventListener("click", () => {
        marcarActivo("[data-ventana]", boton);
        visor.ventana = { ...ventanas[boton.dataset.ventana] };
        programarPintado();
    }));

    document.querySelectorAll("[data-preset3d]").forEach(boton => boton.addEventListener("click", () => {
        if (!vista3D) return;
        marcarActivo("[data-preset3d]", boton);
        umbral.value = vista3D.aplicarPreset(boton.dataset.preset3d);
    }));

    let umbralPendiente = false;
    umbral.addEventListener("input", () => {
        if (umbralPendiente || !vista3D) return;
        umbralPendiente = true;
        requestAnimationFrame(() => {
            umbralPendiente = false;
            vista3D.fijarUmbral(Number(umbral.value));
        });
    });

    botonMedir.addEventListener("click", () => fijarModoMedir(visor.modo !== "medir"));
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && visor.modo === "medir") fijarModoMedir(false);
    });

    document.querySelector("#borrar-medidas").addEventListener("click", () => vistas.forEach(v => v.borrarMedidas()));

    document.querySelector("#centrar").addEventListener("click", () => {
        const [nx, ny, nz] = visor.volumen.dims;
        visor.cursor = [nx >> 1, ny >> 1, nz >> 1];
        vistas.forEach(v => v.restablecer());
        vista3D?.restablecerCamara();
    });

    rejilla.addEventListener("click", (e) => {
        const boton = e.target.closest("[data-ampliar]");
        if (boton) alternarAmpliada(boton.dataset.ampliar);
    });

    botonPantalla.addEventListener("click", () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else marco.requestFullscreen?.();
    });
    document.addEventListener("fullscreenchange", () => {
        botonPantalla.querySelector("i").className = document.fullscreenElement ? "ri-fullscreen-exit-line" : "ri-fullscreen-line";
    });
}

function marcarActivo(selector, activo) {
    document.querySelectorAll(selector).forEach(boton => boton.classList.toggle("is-activo", boton === activo));
}

function fijarModoMedir(activo) {
    visor.modo = activo ? "medir" : null;
    botonMedir.classList.toggle("is-activo", activo);
    botonMedir.setAttribute("aria-pressed", String(activo));
    rejilla.classList.toggle("tac-rejilla--midiendo", activo);
}

//* Carga y errores

function mostrarCarga(texto, fraccion, detalle = "") {
    carga.hidden = false;
    carga.querySelector("#carga-texto").textContent = `${texto}…`;
    carga.querySelector("#carga-detalle").textContent = detalle;
    const barra = carga.querySelector("#carga-barra");
    barra.classList.toggle("tac-progreso__barra--indefinida", fraccion === null);
    barra.querySelector("span").style.width = fraccion === null ? "" : `${Math.round(fraccion * 100)}%`;
}

function mostrarError(mensaje) {
    carga.hidden = false;
    carga.classList.add("tac-carga--error");
    carga.querySelector("#carga-texto").textContent = mensaje;
    carga.querySelector("#carga-detalle").innerHTML = `<a href="control.html" class="tac-boton tac-boton--secundario">Volver a los estudios</a>`;
    if (titulo.textContent === "Cargando estudio…") titulo.textContent = "No se pudo abrir el estudio";
}
