import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import Tabla from "../../modules/components/Tabla.js";
import { listarEstudios, borrarEstudio } from "../../modules/components/tac/ApiTAC.js";
import { abrirModalSubirTAC } from "../../modules/components/tac/ModalSubirTAC.js";
import { abrirModalAsignarTAC } from "../../modules/components/tac/ModalAsignarTAC.js";
import { abrirModalEnlaceTAC } from "../../modules/components/tac/ModalEnlaceTAC.js";
import { esEscritorio, formatearBytes, formatearFecha, textoVoxel } from "../../modules/components/tac/utilidades.js";

//* Selectores Específicos
const lista = document.querySelector("#lista");
const sinAsignar = document.querySelector("#sin-asignar");

// Se traen una vez; buscar, ordenar y paginar los hace la tabla común en memoria.
let estudios = [];

// Texto secundario bajo el dato principal de una celda.
const detalle = (texto) => (texto ? `<span class="tabla__detalle">${escapeHtml(texto)}</span>` : "");

const tabla = new Tabla(lista, {
    etiqueta: "Estudios TAC",
    registro: ["estudio", "estudios"],
    vacio: "No hay estudios TAC todavía. Pulsa «Añadir TAC» para subir el primero.",
    buscador: { placeholder: "Paciente, descripción, equipo o centro…" },
    porPagina: 20,
    // Tambien se busca por lo que sale en pequeño (nombre indicado, centro, notas).
    textoBusqueda: (e) => [e.paciente_nombre, e.centro, e.equipo, e.notas, e.subido_por].join(" "),
    claseFila: (e) => (e.client_id ? "" : "tabla__fila--aviso"),
    columnas: [
        {
            clave: "paciente", titulo: "Paciente", rol: "principal",
            texto: (e) => e.paciente || e.paciente_nombre || "",
            valor: (e) => e.paciente || e.paciente_nombre || "",
            celda: celdaPaciente,
        },
        {
            clave: "fecha_estudio", titulo: "Fecha del estudio",
            texto: (e) => formatearFecha(e.fecha_estudio),
            celda: (e) => escapeHtml(formatearFecha(e.fecha_estudio)),
        },
        {
            clave: "descripcion", titulo: "Descripción",
            celda: (e) => `${escapeHtml(e.descripcion || "—")}${detalle(e.equipo)}${detalle(e.notas && `Notas: ${e.notas}`)}`,
        },
        {
            clave: "cortes", titulo: "Volumen", valor: (e) => Number(e.cortes) || 0,
            texto: (e) => (e.cortes ? `${e.ancho} × ${e.alto} × ${e.cortes}` : ""),
            celda: (e) => `${escapeHtml(e.cortes ? `${e.ancho} × ${e.alto} × ${e.cortes}` : "—")}${detalle(`Vóxel ${textoVoxel(e.voxel_x, e.voxel_y, e.voxel_z)}`)}`,
        },
        {
            clave: "tamano", titulo: "Tamaño", tipo: "numero",
            texto: (e) => formatearBytes(e.tamano),
            celda: (e) => escapeHtml(formatearBytes(e.tamano)),
        },
        {
            clave: "fecha_subida", titulo: "Recibido",
            texto: (e) => formatearFecha(e.fecha_subida),
            celda: (e) => `${escapeHtml(formatearFecha(e.fecha_subida))}${detalle(origen(e))}`,
        },
    ],
    acciones: (e) => {
        const asignar = e.client_id
            ? `<button type="button" class="boton boton--icono boton--fantasma" data-accion="asignar" data-id="${escapeHtml(e.id)}" title="Cambiar de paciente" aria-label="Cambiar de paciente"><i class="ri-user-shared-line" aria-hidden="true"></i></button>`
            : `<button type="button" class="boton boton--primario boton--pequeno" data-accion="asignar" data-id="${escapeHtml(e.id)}"><i class="ri-user-received-2-line" aria-hidden="true"></i> Asignar</button>`;
        return `${asignar}
            <a href="visor.html?id=${encodeURIComponent(e.id)}" class="boton boton--secundario boton--pequeno"><i class="ri-eye-line" aria-hidden="true"></i> Ver</a>
            <button type="button" class="boton boton--icono boton--fantasma" data-tono="peligro" data-accion="borrar" data-id="${escapeHtml(e.id)}" title="Borrar el estudio" aria-label="Borrar el estudio"><i class="ri-delete-bin-line" aria-hidden="true"></i></button>`;
    },
});

//* Eventos
document.addEventListener("DOMContentLoaded", async () => {
    // En móvil/tablet tac.css ya muestra el aviso; aquí solo se evita trabajar de balde.
    if (!esEscritorio()) return;

    document.querySelector("#anadir").addEventListener("click", anadirEstudio);
    document.querySelector("#enlace").addEventListener("click", abrirModalEnlaceTAC);
    lista.addEventListener("click", manejarClickLista);
    await cargarEstudios();

    // Desde la campana: ?asignar=N abre directamente "Asignar paciente" de ese TAC.
    const pendiente = estudios.find(e => String(e.id) === new URLSearchParams(location.search).get("asignar"));
    if (pendiente) asignar(pendiente);
});

async function cargarEstudios() {
    tabla.cargando("Obteniendo los estudios…");
    try {
        estudios = await listarEstudios();
        pintarLista();
    } catch (error) {
        tabla.error(escapeHtml(error.message));
    }
}

function pintarLista() {
    tabla.datos(estudios);
    const pendientes = estudios.filter(e => !e.client_id).length;
    sinAsignar.hidden = !pendientes;
    sinAsignar.textContent = pendientes === 1 ? "1 estudio sin asignar" : `${pendientes} estudios sin asignar`;
}

function origen(e) {
    return e.origen === "externo" ? `Enviado por ${e.centro || "un centro externo"}` : e.subido_por;
}

function celdaPaciente(e) {
    const nuevo = Number(e.visto) === 0 ? ` <span class="pastilla" data-tono="acento">Nuevo</span>` : "";
    if (!e.client_id) {
        return `<span class="pastilla" data-tono="aviso">Sin asignar</span>${nuevo}${detalle(`Indicado: ${e.paciente_nombre || "—"}`)}`;
    }
    return `${escapeHtml(e.paciente)}${nuevo}`;
}

function manejarClickLista(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;
    const estudio = estudios.find(item => String(item.id) === String(boton.dataset.id));
    if (!estudio) return;
    if (boton.dataset.accion === "borrar") confirmarBorrado(estudio);
    if (boton.dataset.accion === "asignar") asignar(estudio);
}

async function asignar(estudio) {
    if (await abrirModalAsignarTAC(estudio)) {
        await cargarEstudios();
        avisar("TAC asignado al paciente");
    }
}

/** Nombre con el que se identifica el estudio en los mensajes. */
function nombreEstudio(estudio) {
    return estudio.paciente || `${estudio.paciente_nombre || "paciente sin asignar"} (sin asignar)`;
}

async function confirmarBorrado(estudio) {
    const { isConfirmed } = await Swal.fire({
        title: "¿Borrar este TAC?",
        html: `Se borrará el estudio de <strong>${escapeHtml(nombreEstudio(estudio))}</strong> del ${escapeHtml(formatearFecha(estudio.fecha_estudio))}. No se puede deshacer.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Borrar",
        cancelButtonText: "Cancelar",
        confirmButtonColor: "var(--hs-peligro)",
    });
    if (!isConfirmed) return;

    try {
        await borrarEstudio(estudio.id);
        estudios = estudios.filter(item => item.id !== estudio.id);
        pintarLista();
        avisar("Estudio borrado");
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}

async function anadirEstudio() {
    const id = await abrirModalSubirTAC();
    if (!id) return;

    await cargarEstudios();
    const { isConfirmed } = await Swal.fire({
        title: "TAC subido",
        text: "El estudio ya está disponible en la lista.",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Abrir en el visor",
        cancelButtonText: "Cerrar",
    });
    if (isConfirmed) window.location.href = `visor.html?id=${encodeURIComponent(id)}`;
}

/** Aviso breve que no corta el flujo. */
function avisar(titulo) {
    Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: titulo,
        showConfirmButton: false,
        timer: 1800,
    });
}
