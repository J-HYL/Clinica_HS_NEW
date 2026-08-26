// modules/components/inventario.js
// Unica fuente de verdad de los catalogos del inventario (categorias, unidades y
// situaciones). Los usan el formulario de alta/edicion, el filtro del control y
// el render de la tabla: no duplicar estas listas en ninguna pantalla.
//
// Los valores ('instrumental', 'operativo', ...) son los que viajan a la BD; las
// etiquetas son solo para mostrar. Si se anade una situacion nueva hay que
// tocar tambien el enum de la columna `estado` y la validacion de DB.php.

import { escapeHtml } from "../html.js";

export const CATEGORIAS = [
    { valor: "instrumental",  etiqueta: "Instrumental" },
    { valor: "consumible",    etiqueta: "Consumible / fungible" },
    { valor: "aparatologia",  etiqueta: "Aparatología" },
    { valor: "protesis",      etiqueta: "Prótesis y laboratorio" },
    { valor: "ortodoncia",    etiqueta: "Ortodoncia" },
    { valor: "medicamento",   etiqueta: "Medicamentos" },
    { valor: "proteccion",    etiqueta: "Protección / EPI" },
    { valor: "higiene",       etiqueta: "Higiene y esterilización" },
    { valor: "otros",         etiqueta: "Otros" }
];

export const UNIDADES = ["ud", "caja", "bote", "blister", "sobre", "par", "ml", "g", "kg"]
    .map(unidad => ({ valor: unidad, etiqueta: unidad }));

export const ESTADOS = [
    { valor: "operativo", etiqueta: "Operativo" },
    { valor: "revision",  etiqueta: "En revisión" },
    { valor: "baja",      etiqueta: "De baja" }
];

/** Pinta las opciones de un <select>. `textoVacio` añade una opción inicial sin valor. */
export function rellenarSelect(select, opciones, textoVacio = null) {
    const html = opciones.map(opcion =>
        `<option value="${escapeHtml(opcion.valor)}">${escapeHtml(opcion.etiqueta)}</option>`
    );
    if (textoVacio) html.unshift(`<option value="">${escapeHtml(textoVacio)}</option>`);
    select.innerHTML = html.join("");
}

const etiquetaDe = (lista, valor) =>
    lista.find(opcion => opcion.valor === valor)?.etiqueta || valor || "—";

export const etiquetaCategoria = valor => etiquetaDe(CATEGORIAS, valor);
export const etiquetaEstado    = valor => etiquetaDe(ESTADOS, valor);
