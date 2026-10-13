import { emptyContainer } from "../../modules/selectores.js";
import { hideSpinnerSection } from "../../modules/components/Spinner.js";
import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import { listarEstudios, borrarEstudio } from "../../modules/components/tac/ApiTAC.js";
import { abrirModalSubirTAC } from "../../modules/components/tac/ModalSubirTAC.js";
import { esEscritorio, formatearBytes, formatearFecha, textoVoxel } from "../../modules/components/tac/utilidades.js";

//* Selectores Específicos
const lista = document.querySelector("#lista");
const contador = document.querySelector("#contador");
const buscador = document.querySelector("#buscador");

// Se traen una vez y la búsqueda se hace en memoria (como en el inventario).
let estudios = [];

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    // En móvil/tablet tac.css ya muestra el aviso; aquí solo se evita trabajar de balde.
    if (!esEscritorio()) return;

    document.querySelector("#anadir").addEventListener("click", anadirEstudio);
    buscador.addEventListener("input", pintarLista);
    lista.addEventListener("click", manejarClickLista);
    cargarEstudios();
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

function normalizar(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function pintarLista() {
    const texto = normalizar(buscador.value.trim());
    const visibles = estudios.filter(e => !texto ||
        [e.paciente, e.descripcion, e.equipo].some(campo => normalizar(campo).includes(texto)));

    emptyContainer.classList.toggle("show", visibles.length === 0);
    contador.textContent = !estudios.length ? ""
        : visibles.length === estudios.length ? `${estudios.length} estudio${estudios.length === 1 ? "" : "s"}`
        : `${visibles.length} de ${estudios.length} estudios`;

    lista.innerHTML = visibles.length ? `
        <table class="tac-tabla">
            <thead>
                <tr>
                    <th>Paciente</th>
                    <th>Fecha del estudio</th>
                    <th>Descripción</th>
                    <th>Volumen</th>
                    <th>Tamaño</th>
                    <th>Subido</th>
                    <th aria-label="Acciones"></th>
                </tr>
            </thead>
            <tbody>${visibles.map(filaEstudio).join("")}</tbody>
        </table>` : "";
}

function filaEstudio(e) {
    const volumen = e.cortes ? `${e.ancho} × ${e.alto} × ${e.cortes}` : "—";
    return `
        <tr>
            <td class="tac-tabla__paciente">${escapeHtml(e.paciente)}</td>
            <td>${escapeHtml(formatearFecha(e.fecha_estudio))}</td>
            <td>
                ${escapeHtml(e.descripcion || "—")}
                ${e.equipo ? `<span class="tac-tabla__detalle">${escapeHtml(e.equipo)}</span>` : ""}
            </td>
            <td>
                ${escapeHtml(volumen)}
                <span class="tac-tabla__detalle">Vóxel ${escapeHtml(textoVoxel(e.voxel_x, e.voxel_y, e.voxel_z))}</span>
            </td>
            <td>${escapeHtml(formatearBytes(e.tamano))}</td>
            <td>
                ${escapeHtml(formatearFecha(e.fecha_subida))}
                ${e.subido_por ? `<span class="tac-tabla__detalle">${escapeHtml(e.subido_por)}</span>` : ""}
            </td>
            <td>
                <div class="tac-tabla__acciones">
                    <a href="visor.html?id=${encodeURIComponent(e.id)}" class="tac-boton tac-boton--pequeno"><i class="ri-eye-line"></i> Ver</a>
                    <button type="button" class="table__btn table__btn--delete" data-accion="borrar" data-id="${escapeHtml(e.id)}" aria-label="Borrar el estudio de ${escapeHtml(e.paciente)}">
                        <i class="ri-delete-bin-line"></i>
                    </button>
                </div>
            </td>
        </tr>`;
}

function manejarClickLista(e) {
    const boton = e.target.closest("button[data-accion='borrar']");
    if (!boton) return;
    const estudio = estudios.find(item => String(item.id) === String(boton.dataset.id));
    if (estudio) confirmarBorrado(estudio);
}

async function confirmarBorrado(estudio) {
    const { isConfirmed } = await Swal.fire({
        title: "¿Borrar este TAC?",
        html: `Se borrará el estudio de <strong>${escapeHtml(estudio.paciente)}</strong> del ${escapeHtml(formatearFecha(estudio.fecha_estudio))}. No se puede deshacer.`,
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
