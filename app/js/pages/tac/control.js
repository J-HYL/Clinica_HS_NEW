import { emptyContainer } from "../../modules/selectores.js";
import { hideSpinnerSection } from "../../modules/components/Spinner.js";
import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import { listarEstudios, borrarEstudio } from "../../modules/components/tac/ApiTAC.js";
import { abrirModalSubirTAC } from "../../modules/components/tac/ModalSubirTAC.js";
import { abrirModalAsignarTAC } from "../../modules/components/tac/ModalAsignarTAC.js";
import { abrirModalEnlaceTAC } from "../../modules/components/tac/ModalEnlaceTAC.js";
import { esEscritorio, formatearBytes, formatearFecha, normalizar, textoVoxel } from "../../modules/components/tac/utilidades.js";

//* Selectores Específicos
const lista = document.querySelector("#lista");
const contador = document.querySelector("#contador");
const buscador = document.querySelector("#buscador");

// Se traen una vez y la búsqueda se hace en memoria (como en el inventario).
let estudios = [];

//* Eventos
document.addEventListener("DOMContentLoaded", async () => {
    // En móvil/tablet tac.css ya muestra el aviso; aquí solo se evita trabajar de balde.
    if (!esEscritorio()) return;

    document.querySelector("#anadir").addEventListener("click", anadirEstudio);
    document.querySelector("#enlace").addEventListener("click", abrirModalEnlaceTAC);
    buscador.addEventListener("input", pintarLista);
    lista.addEventListener("click", manejarClickLista);
    await cargarEstudios();

    // Desde la campana: ?asignar=N abre directamente "Asignar paciente" de ese TAC.
    const pendiente = estudios.find(e => String(e.id) === new URLSearchParams(location.search).get("asignar"));
    if (pendiente) asignar(pendiente);
});

async function cargarEstudios() {
    try {
        estudios = await listarEstudios();
        pintarLista();
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    } finally {
        hideSpinnerSection();
    }
}

function pintarLista() {
    const texto = normalizar(buscador.value.trim());
    const visibles = estudios.filter(e => !texto ||
        [e.paciente, e.paciente_nombre, e.centro, e.descripcion, e.equipo].some(campo => normalizar(campo).includes(texto)));

    emptyContainer.classList.toggle("show", visibles.length === 0);
    const sinAsignar = estudios.filter(e => !e.client_id).length;
    contador.textContent = !estudios.length ? ""
        : (visibles.length === estudios.length ? `${estudios.length} estudio${estudios.length === 1 ? "" : "s"}`
            : `${visibles.length} de ${estudios.length} estudios`)
        + (sinAsignar ? ` · ${sinAsignar} sin asignar` : "");

    lista.innerHTML = visibles.length ? `
        <table class="tac-tabla">
            <thead>
                <tr>
                    <th>Paciente</th>
                    <th>Fecha del estudio</th>
                    <th>Descripción</th>
                    <th>Volumen</th>
                    <th>Tamaño</th>
                    <th>Recibido</th>
                    <th aria-label="Acciones"></th>
                </tr>
            </thead>
            <tbody>${visibles.map(filaEstudio).join("")}</tbody>
        </table>` : "";
}

function celdaPaciente(e) {
    const nuevo = Number(e.visto) === 0 ? `<span class="tac-etiqueta tac-etiqueta--nuevo">Nuevo</span>` : "";
    if (!e.client_id) {
        return `
            <span class="tac-etiqueta tac-etiqueta--pendiente">Sin asignar</span>${nuevo}
            <span class="tac-tabla__detalle">Indicado: ${escapeHtml(e.paciente_nombre || "—")}</span>`;
    }
    return `${escapeHtml(e.paciente)}${nuevo}`;
}

function filaEstudio(e) {
    const volumen = e.cortes ? `${e.ancho} × ${e.alto} × ${e.cortes}` : "—";
    const origen = e.origen === "externo" ? `Enviado por ${e.centro || "un centro externo"}` : e.subido_por;
    const asignar = e.client_id
        ? `<button type="button" class="table__btn table__btn--edit" data-accion="asignar" data-id="${escapeHtml(e.id)}" title="Cambiar de paciente" aria-label="Cambiar de paciente"><i class="ri-user-shared-line"></i></button>`
        : `<button type="button" class="tac-boton tac-boton--pequeno tac-boton--aviso" data-accion="asignar" data-id="${escapeHtml(e.id)}"><i class="ri-user-received-2-line"></i> Asignar</button>`;
    return `
        <tr class="${e.client_id ? "" : "tac-tabla__fila--pendiente"}">
            <td class="tac-tabla__paciente">${celdaPaciente(e)}</td>
            <td>${escapeHtml(formatearFecha(e.fecha_estudio))}</td>
            <td>
                ${escapeHtml(e.descripcion || "—")}
                ${e.equipo ? `<span class="tac-tabla__detalle">${escapeHtml(e.equipo)}</span>` : ""}
                ${e.notas ? `<span class="tac-tabla__detalle">Notas: ${escapeHtml(e.notas)}</span>` : ""}
            </td>
            <td>
                ${escapeHtml(volumen)}
                <span class="tac-tabla__detalle">Vóxel ${escapeHtml(textoVoxel(e.voxel_x, e.voxel_y, e.voxel_z))}</span>
            </td>
            <td>${escapeHtml(formatearBytes(e.tamano))}</td>
            <td>
                ${escapeHtml(formatearFecha(e.fecha_subida))}
                ${origen ? `<span class="tac-tabla__detalle">${escapeHtml(origen)}</span>` : ""}
            </td>
            <td>
                <div class="tac-tabla__acciones">
                    ${asignar}
                    <a href="visor.html?id=${encodeURIComponent(e.id)}" class="tac-boton tac-boton--pequeno"><i class="ri-eye-line"></i> Ver</a>
                    <button type="button" class="table__btn table__btn--delete" data-accion="borrar" data-id="${escapeHtml(e.id)}" aria-label="Borrar el estudio">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </td>
        </tr>`;
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
        confirmButtonColor: "#DE5753",
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
