// modules/components/TablaInventario.js
// Listado de elementos del inventario, pensado para el movil.
//
// Por que no DataTables (que es lo que usa el resto de secciones): en el movil
// mete scroll horizontal y letra diminuta, y el inventario se usa justo ahi,
// telefono en mano y en el almacen. Aqui la MISMA estructura se pinta como
// tarjetas en el movil y como tabla alineada en escritorio, solo con CSS
// (grid-template-areas), sin duplicar el HTML ni volver a pintar al girar el
// telefono. El resto de secciones siguen con DataTables: esto es solo de aqui.
//
// El componente solo PINTA. Buscar, filtrar y ordenar es cosa de la pagina
// (control.js), que es quien tiene los datos.

import { etiquetaCategoria, etiquetaEstado } from "./inventario.js";
import { formatFecha } from "../funciones.js";
import { escapeHtml } from "../html.js";

/**
 * Pinta la lista completa dentro del contenedor.
 * @param {HTMLElement} contenedor
 * @param {Array<Object>} elementos - registros ya filtrados y ordenados
 */
export function pintarInventario(contenedor, elementos) {
    contenedor.innerHTML = `
        <div class="inv-lista__cabecera" aria-hidden="true">
            <span></span>
            <span>Elemento</span>
            <span>Stock</span>
            <span>Caducidad</span>
            <span>Situación</span>
            <span>Acciones</span>
        </div>
        <ul class="inv-lista__items">
            ${elementos.map(pintarFila).join("")}
        </ul>
    `;
}

function pintarFila(elemento) {
    const stock = Number(elemento.stock ?? 0);
    const bajoMinimo = stock <= Number(elemento.stock_minimo ?? 0);
    const unidad = elemento.unidad || "ud";
    // "Categoría · Ubicación" en una sola línea bajo el nombre: en escritorio se
    // lee igual de bien que en una columna aparte, y ahorra ancho en el móvil.
    const meta = [etiquetaCategoria(elemento.categoria), elemento.ubicacion].filter(Boolean).join(" · ");

    return `
        <li class="inv-fila">
            <div class="inv-fila__foto">
                ${elemento.foto
                    ? `<img src="/${escapeHtml(elemento.foto)}" alt="Foto de ${escapeHtml(elemento.nombre)}">`
                    : `<span class="inv-fila__sinfoto" aria-label="Sin foto"><i class="ri-camera-off-line"></i></span>`}
            </div>

            <div class="inv-fila__principal">
                <p class="inv-fila__nombre">${escapeHtml(elemento.nombre)}</p>
                <p class="inv-fila__meta">${escapeHtml(meta)}</p>
            </div>

            <div class="inv-fila__stock">
                <span class="inv-stock${bajoMinimo ? " inv-stock--bajo" : ""}">
                    ${escapeHtml(stock)} ${escapeHtml(unidad)}
                    ${bajoMinimo ? '<i class="ri-alert-fill" title="Stock bajo mínimo"></i>' : ""}
                </span>
            </div>

            <div class="inv-fila__pie">
                <div class="inv-fila__estado">
                    <span class="table__tag table__tag--${escapeHtml(elemento.estado)}">${escapeHtml(etiquetaEstado(elemento.estado))}</span>
                </div>

                <div class="inv-fila__acciones">
                    <button type="button" class="table__btn table__btn--stock" data-accion="stock" data-id="${escapeHtml(elemento.id)}" aria-label="Ajustar stock de ${escapeHtml(elemento.nombre)}"><i class="ri-add-box-fill"></i></button>
                    <button type="button" class="table__btn table__btn--edit" data-accion="editar" data-id="${escapeHtml(elemento.id)}" aria-label="Editar ${escapeHtml(elemento.nombre)}"><i class="ri-edit-box-fill"></i></button>
                    <button type="button" class="table__btn table__btn--delete" data-accion="borrar" data-id="${escapeHtml(elemento.id)}" aria-label="Eliminar ${escapeHtml(elemento.nombre)}"><i class="ri-delete-bin-fill"></i></button>
                </div>
            </div>

            <!-- Último a propósito: en el móvil es la línea de cierre de la tarjeta,
                 y en escritorio la rejilla lo coloca en su columna igualmente. -->
            <div class="inv-fila__caducidad">
                <span class="inv-fila__etiqueta">Caducidad</span>
                ${elemento.caducidad ? escapeHtml(formatFecha(elemento.caducidad)) : "—"}
            </div>
        </li>
    `;
}
