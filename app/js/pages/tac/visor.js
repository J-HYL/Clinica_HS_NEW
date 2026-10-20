import { obtenerEstudio, descargarEstudio, marcarVisto } from "../../modules/components/tac/ApiTAC.js";
import { montarVolumen, FASES } from "../../modules/components/tac/LectorDicom.js";
import VistaCorte from "../../modules/components/tac/VistaCorte.js";
import Vista3D from "../../modules/components/tac/Vista3D.js";
import Panoramica from "../../modules/components/tac/Panoramica.js";
import { esEscritorio, formatearBytes, formatearFecha, textoVoxel } from "../../modules/components/tac/utilidades.js";
import { escapeHtml } from "../../modules/html.js";

// Visor de un estudio TAC en modo "estación de trabajo": descarga el zip
// (tac.php), lo monta en el navegador (LectorDicom) y lo enseña en varias
// disposiciones: cuatro vistas (axial, coronal, sagital y 3D), una grande y
// tres pequeñas, solo una, o panorámica con transversales.
//
// Aquí vive el estado compartido (`visor`): volumen, punto de referencia,
// contraste, herramienta activa. Las vistas lo leen y avisan con alCambiar().

//* Selectores Específicos
const marco = document.querySelector("#marco");
const area = document.querySelector("#area");
const carga = document.querySelector("#carga");
const titulo = document.querySelector("#titulo");
const datosEstudio = document.querySelector("#datos-estudio");
const cajaAvisos = document.querySelector("#caja-avisos");
const listaAvisos = document.querySelector("#avisos");
const umbral = document.querySelector("#umbral");
const botonPantalla = document.querySelector("#pantalla-completa");
const botonCaptura = document.querySelector("#captura");
const ayuda = document.querySelector("#ayuda");

const PLANOS_2D = ["axial", "coronal", "sagital"];
const TRANSVERSALES = ["t1", "t2", "t3", "t4", "t5"];
const VISTAS_DE = {
    "2x2": [...PLANOS_2D, "3d"],
    "1+3": [...PLANOS_2D, "3d"],
    panoramica: ["axial", "panoramica", ...TRANSVERSALES],
};
const DISPOSICIONES = ["2x2", "1+3", "1x1", "panoramica"];
const NOMBRES_VENTANA = { estudio: "Contraste del estudio", hueso: "Contraste hueso", dientes: "Contraste dientes" };
const TECLAS_HERRAMIENTA = { n: "navegar", d: "medir", a: "angulo", v: "sonda", c: "curva" };

let estudio = null;
let visor = null;          // estado compartido con las vistas 2D (ver VistaLienzo.js)
const vistas = {};         // nombre -> vista 2D (cortes, panorámica y transversales)
let panoramica = null;
let vista3D = null;
let ventanas = {};         // contrastes predefinidos de este estudio
let pintadoPendiente = false;
let activa = null;         // la vista que reciben las flechas, Supr y la captura
let anterior = "2x2";      // disposición a la que se vuelve al reducir una vista

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    // En móvil/tablet tac.css ya muestra el aviso: no se descarga nada.
    if (!esEscritorio()) return;
    fijarDisponible(false);
    cablearSiempre();
    abrirEstudio();
});

async function abrirEstudio() {
    const id = new URLSearchParams(location.search).get("id");
    if (!id) return mostrarError("No se ha indicado qué estudio abrir.");

    try {
        estudio = await obtenerEstudio(id);
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

function pintarCabecera(datos) {
    titulo.textContent = datos.paciente || `Sin asignar · ${datos.paciente_nombre || "paciente sin indicar"}`;
    const fecha = formatearFecha(datos.fecha_estudio);
    const chips = [
        fecha !== "—" ? fecha : null,
        datos.descripcion,
        datos.equipo,
        datos.cortes ? `${datos.ancho} × ${datos.alto} × ${datos.cortes}` : null,
        datos.cortes ? `Vóxel ${textoVoxel(datos.voxel_x, datos.voxel_y, datos.voxel_z)}` : null,
    ].filter(Boolean);
    datosEstudio.replaceChildren(...chips.map(texto => {
        const chip = document.createElement("li");
        chip.textContent = texto;
        return chip;
    }));
}

//* Montaje

function montarVisor({ volumen, volumen3D, estadisticas, ventana, avisos }) {
    const [nx, ny, nz] = volumen.dims;
    visor = {
        volumen,
        cursor: [nx >> 1, ny >> 1, nz >> 1],
        ventana: { ...ventana },
        ventanaPreset: "estudio",
        invertir: false,
        herramienta: "navegar",
        // Cuánto cambia el contraste por píxel de arrastre, a escala de cada estudio.
        sensibilidadVentana: Math.max(0.5, (estadisticas.p999 - estadisticas.p1) / 600),
        alCambiar: programarPintado,
        activar: (vista) => activarVista(vista.nombre),
        alternarAmpliada,
        fijarVentana: (nueva) => fijarVentana(nueva, null),
        nombreVentana: () => NOMBRES_VENTANA[visor.ventanaPreset] ?? "Contraste ajustado",
    };
    ventanas = {
        estudio: { ...ventana },
        hueso: ventanaEntre(estadisticas.umbralTejido, estadisticas.p999),
        dientes: ventanaEntre(estadisticas.umbralHueso, estadisticas.p999),
    };

    for (const plano of PLANOS_2D) vistas[plano] = new VistaCorte(panel(plano), plano, visor);
    panoramica = new Panoramica(visor, {
        vistaAxial: vistas.axial,
        panelPanoramica: panel("panoramica"),
        panelesTransversales: TRANSVERSALES.map(panel),
        // sha256 y no id: el id se repite entre las BD de las dos clínicas.
        claveAlmacen: `hsdental-tac-curva-${estudio.sha256 || estudio.id}`,
    });
    for (const vista of panoramica.vistas) vistas[vista.nombre] = vista;

    montar3D(volumen3D || volumen, estadisticas);
    pintarAvisos(avisos);
    cablearHerramientas();
    activarVista("axial");
    fijarDisponible(true);
    carga.hidden = true;
}

function panel(nombre) {
    return area.querySelector(`[data-vista="${nombre}"]`);
}

function ventanaEntre(bajo, alto) {
    return { centro: (bajo + alto) / 2, ancho: Math.max(1, alto - bajo) };
}

function montar3D(volumen, estadisticas) {
    const contenedor = panel("3d").querySelector(".tac-vista__cuerpo--3d");
    try {
        if (typeof vtk === "undefined") throw new Error("vtk.js no cargado");
        vista3D = new Vista3D(contenedor, volumen, estadisticas);
    } catch (error) {
        console.error("Vista 3D no disponible:", error);
        contenedor.innerHTML = `<p class="tac-vista__aviso">La vista 3D no está disponible en este equipo (necesita conexión y una tarjeta gráfica con WebGL 2). Los cortes funcionan igual.</p>`;
        panel("3d").querySelector(".tac-controles").hidden = true;
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
    cajaAvisos.hidden = !avisos.length;
}

//* Pintado

/** Las vistas avisan de cada cambio; se pinta como mucho una vez por fotograma. */
function programarPintado() {
    if (pintadoPendiente) return;
    pintadoPendiente = true;
    requestAnimationFrame(() => {
        pintadoPendiente = false;
        Object.values(vistas).forEach(vista => vista.pintar());   // las ocultas no hacen nada
    });
}

//* Vista activa y disposición

function activarVista(nombre) {
    if (activa === nombre) return;
    activa = nombre;
    area.querySelectorAll(".tac-vista").forEach(p => p.classList.toggle("is-activa", p.dataset.vista === nombre));
}

/**
 * @param {string} disposicion - "2x2" | "1+3" | "1x1" | "panoramica"
 * @param {string} principal - la vista grande en "1+3" o la única en "1x1"
 */
function fijarDisposicion(disposicion, principal = activa) {
    const visibles = disposicion === "1x1" ? [principal] : VISTAS_DE[disposicion];
    if (disposicion === "1+3" && !visibles.includes(principal)) principal = "axial";
    if (disposicion !== "1x1") anterior = disposicion;

    area.dataset.disposicion = disposicion;
    area.querySelectorAll(".tac-vista").forEach(p => {
        const esPrincipal = p.dataset.vista === principal;
        p.classList.toggle("is-principal", esPrincipal);
        p.querySelector(".tac-vista__ampliar i").className = disposicion === "1x1" && esPrincipal ? "ri-fullscreen-exit-line" : "ri-fullscreen-line";
    });
    document.querySelectorAll("[data-disposicion]").forEach(boton => boton.setAttribute("aria-pressed", String(boton.dataset.disposicion === disposicion)));

    // La vista activa siempre a la vista.
    if (!visibles.includes(activa)) activarVista(visibles.includes(principal) ? principal : visibles[0]);
    // Si la curva se editó con la panorámica oculta, se calcula ahora que se ve.
    panoramica.mostrar();
    // En la panorámica sin curva todavía, lo primero es dibujarla.
    if (disposicion === "panoramica" && !panoramica.tieneCurva) fijarHerramienta("curva");
}

/** Doble clic o botón de ampliar: la vista sola, y otra vez para volver. */
function alternarAmpliada(nombre) {
    if (area.dataset.disposicion === "1x1" && panel(nombre).classList.contains("is-principal")) {
        fijarDisposicion(anterior, nombre);
    } else {
        activarVista(nombre);
        fijarDisposicion("1x1", nombre);
    }
}

//* Herramientas

function fijarHerramienta(nombre) {
    visor.herramienta = nombre;
    area.dataset.herramienta = nombre;
    document.querySelectorAll("[data-herramienta]").forEach(boton => boton.setAttribute("aria-pressed", String(boton.dataset.herramienta === nombre)));
    Object.values(vistas).forEach(vista => (vista.enCurso = null));
    programarPintado();
}

function fijarVentana(ventana, preset) {
    visor.ventana = { ...ventana };
    visor.ventanaPreset = preset;
    document.querySelectorAll("[data-ventana]").forEach(boton => boton.setAttribute("aria-pressed", String(boton.dataset.ventana === preset)));
    programarPintado();
}

function fijarInvertir(invertir) {
    visor.invertir = invertir;
    document.querySelector("#invertir").setAttribute("aria-pressed", String(invertir));
    programarPintado();
}

function restablecer() {
    const [nx, ny, nz] = visor.volumen.dims;
    visor.cursor = [nx >> 1, ny >> 1, nz >> 1];
    fijarVentana(ventanas.estudio, "estudio");
    fijarInvertir(false);
    Object.values(vistas).forEach(vista => vista.restablecer());
    vista3D?.restablecerCamara();
}

function borrarMedida() {
    if (visor.herramienta === "curva" && activa === "axial") return panoramica.quitarUltimoPunto();
    return vistas[activa]?.borrarMedida();
}

/** Esc: primero deshace lo que se esté marcando; si no hay nada, vuelve a Navegar. */
function cancelar() {
    const habia = Object.values(vistas).map(vista => vista.cancelar()).some(Boolean);
    if (!habia && visor.herramienta !== "navegar") fijarHerramienta("navegar");
}

async function capturar() {
    const vista = activa === "3d" ? vista3D : vistas[activa];
    if (!vista) return;
    const fecha = formatearFecha(estudio.fecha_estudio);
    const cabecera = [titulo.textContent, fecha !== "—" ? `Estudio del ${fecha}` : null].filter(Boolean);
    try {
        const imagen = await vista.exportarPNG(cabecera);
        const enlace = document.createElement("a");
        enlace.href = URL.createObjectURL(imagen);
        enlace.download = `tac-${estudio.id}-${activa}.png`;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);
        confirmarBoton(botonCaptura, "ri-check-line");
    } catch (error) {
        console.error("No se pudo guardar la imagen:", error);
        confirmarBoton(botonCaptura, "ri-error-warning-line");
    }
}

/** Cambia un momento el icono del botón para confirmar sin abrir nada. */
function confirmarBoton(boton, icono) {
    const i = boton.querySelector("i");
    const original = i.className;
    i.className = icono;
    boton.classList.add("is-hecho");
    setTimeout(() => {
        i.className = original;
        boton.classList.remove("is-hecho");
    }, 1200);
}

/** El navegador puede negarla (política, iframe sin permiso): se avisa en el propio botón. */
async function alternarPantallaCompleta() {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    } catch (error) {
        console.warn("Pantalla completa no disponible:", error);
        confirmarBoton(botonPantalla, "ri-error-warning-line");
    }
}

/** Lo que funciona aunque el estudio no haya cargado: ayuda, pantalla completa y sus atajos. */
function cablearSiempre() {
    document.addEventListener("keydown", alPulsarTecla);
    document.querySelector("#abrir-ayuda").addEventListener("click", () => ayuda.showModal());
    document.querySelector("#cerrar-ayuda").addEventListener("click", () => ayuda.close());
    ayuda.addEventListener("click", (e) => { if (e.target === ayuda) ayuda.close(); });   // clic fuera

    botonPantalla.addEventListener("click", alternarPantallaCompleta);
    document.addEventListener("fullscreenchange", () => {
        const dentro = !!document.fullscreenElement;
        botonPantalla.querySelector("i").className = dentro ? "ri-fullscreen-exit-line" : "ri-fullscreen-line";
        botonPantalla.setAttribute("aria-label", dentro ? "Salir de pantalla completa" : "Pantalla completa");
    });
    document.querySelector("#cerrar-avisos").addEventListener("click", () => (cajaAvisos.hidden = true));
}

function cablearHerramientas() {
    document.querySelectorAll("[data-ventana]").forEach(boton => boton.addEventListener("click", () => {
        fijarVentana(ventanas[boton.dataset.ventana], boton.dataset.ventana);
    }));
    document.querySelector("#invertir").addEventListener("click", () => fijarInvertir(!visor.invertir));
    document.querySelectorAll("[data-disposicion]").forEach(boton => boton.addEventListener("click", () => fijarDisposicion(boton.dataset.disposicion)));
    document.querySelectorAll("[data-herramienta]").forEach(boton => boton.addEventListener("click", () => fijarHerramienta(boton.dataset.herramienta)));
    document.querySelector("#borrar-medida").addEventListener("click", borrarMedida);
    document.querySelector("#borrar-medidas").addEventListener("click", () => Object.values(vistas).forEach(vista => vista.borrarMedidas()));
    document.querySelector("#restablecer").addEventListener("click", restablecer);
    botonCaptura.addEventListener("click", capturar);

    area.addEventListener("click", (e) => {
        const boton = e.target.closest("[data-ampliar]");
        if (boton) alternarAmpliada(boton.dataset.ampliar);
    });

    // 3D
    panel("3d").addEventListener("pointerenter", () => activarVista("3d"));
    document.querySelectorAll("[data-preset3d]").forEach(boton => boton.addEventListener("click", () => {
        if (!vista3D) return;
        document.querySelectorAll("[data-preset3d]").forEach(b => b.setAttribute("aria-pressed", String(b === boton)));
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
    document.querySelector("#vista-frontal").addEventListener("click", () => vista3D?.restablecerCamara());
}

function alPulsarTecla(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || ayuda.open) return;
    if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
    const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // Con el estudio aún cargando (o si falló), solo lo que ya funciona sin él.
    let usada = true;
    if (tecla === "f") alternarPantallaCompleta();
    else if (tecla === "?") ayuda.showModal();
    else usada = visor !== null && atajoDelEstudio(tecla);
    if (usada) e.preventDefault();
}

/** Atajos que necesitan el estudio montado. Devuelve si la tecla era suya. */
function atajoDelEstudio(tecla) {
    const vista = vistas[activa];
    if (TECLAS_HERRAMIENTA[tecla]) fijarHerramienta(TECLAS_HERRAMIENTA[tecla]);
    else if (tecla === "Escape") cancelar();
    else if (tecla === "Delete" || tecla === "Backspace") borrarMedida();
    else if (tecla === "ArrowUp" || tecla === "ArrowDown") vista?.alDesplazar(tecla === "ArrowDown" ? 1 : -1);
    else if (tecla === "PageUp" || tecla === "PageDown") vista?.alDesplazar(tecla === "PageDown" ? 10 : -10);
    else if (["1", "2", "3", "4"].includes(tecla)) fijarDisposicion(DISPOSICIONES[Number(tecla) - 1]);
    else if (tecla === "i") fijarInvertir(!visor.invertir);
    else if (tecla === "r") restablecer();
    else if (tecla === "p") capturar();
    else return false;
    return true;
}

//* Carga y errores

/** Mientras no hay estudio, los controles que lo necesitan están apagados. */
function fijarDisponible(disponible) {
    document.querySelectorAll("[data-necesita-estudio] :is(button, select, input)").forEach(control => (control.disabled = !disponible));
}

function mostrarCarga(texto, fraccion, detalle = "") {
    carga.hidden = false;
    carga.querySelector("#carga-texto").textContent = `${texto}…`;
    carga.querySelector("#carga-detalle").textContent = detalle;
    const barra = carga.querySelector("#carga-barra");
    barra.classList.toggle("tac-progreso__barra--indefinida", fraccion === null);
    barra.querySelector("span").style.width = fraccion === null ? "" : `${Math.round(fraccion * 100)}%`;
}

function mostrarError(mensaje) {
    fijarDisponible(false);
    marco.classList.add("is-error");
    carga.hidden = false;
    carga.classList.add("tac-carga--error");
    carga.querySelector("#carga-texto").textContent = mensaje;
    carga.querySelector("#carga-detalle").innerHTML = `<a href="control.html" class="tac-boton-oscuro">Volver a los estudios</a>`;
    if (titulo.textContent === "Cargando estudio…") titulo.textContent = "No se pudo abrir el estudio";
}
