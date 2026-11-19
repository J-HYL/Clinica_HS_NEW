import { CATEGORIAS, etiquetaCategoria, etiquetaEstado, rellenarSelect } from "../../modules/components/inventario.js";
import Tabla from "../../modules/components/Tabla.js";
import { abrirModalStock } from "../../modules/components/ModalStock.js";
import { abrirEscaner } from "../../modules/components/Escaner.js";
import { abrirComoFunciona } from "../../modules/components/ComoFunciona.js";
import { GUIA_CONTROL } from "../../modules/components/guiaInventario.js";
import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import DB from "../../modules/classes/DB_API.js";

//* Selectores Específicos
const lista = document.querySelector("#lista");
const buscador = document.querySelector("#buscador");
const filtroCategoria = document.querySelector("#filtro-categoria");
const filtroBajo = document.querySelector("#filtro-bajo");
const orden = document.querySelector("#orden");
const botonEscanear = document.querySelector("#escanear");

// Los elementos se traen una vez y buscar/filtrar/ordenar se hace en memoria: el
// inventario de una clínica cabe de sobra y así responde al instante.
let elementos = [];

// Situación -> tono de la etiqueta (mismos tonos que el resto de la app).
const TONO_ESTADO = { operativo: "exito", revision: "aviso", baja: "peligro" };

// La tabla común del panel. El buscador y los filtros son los de arriba (buscan
// también por código y marca, que no se ven en la lista).
const tabla = new Tabla(lista, {
    etiqueta: "Elementos del inventario",
    registro: ["elemento", "elementos"],
    vacio: "Todavía no hay elementos en el inventario",
    buscador: false,
    porPagina: 20,
    orden: { clave: orden.value, dir: "asc" },
    columnas: [
        {
            clave: "foto", titulo: "Foto", rol: "imagen", ordenable: false, texto: () => "",
            celda: e => `<span class="inv-foto">${e.foto
                ? `<img src="/${escapeHtml(e.foto)}" alt="" loading="lazy">`
                : '<i class="ri-camera-off-line" aria-label="Sin foto"></i>'}</span>`,
        },
        {
            // "Categoría · Ubicación" bajo el nombre: ahorra una columna en el móvil.
            clave: "nombre", titulo: "Elemento", rol: "principal",
            celda: e => `${escapeHtml(e.nombre)}<span class="tabla__detalle">${escapeHtml(meta(e))}</span>`,
        },
        {
            clave: "stock", titulo: "Stock", tipo: "numero",
            celda: e => {
                const texto = `${escapeHtml(e.stock ?? 0)} ${escapeHtml(e.unidad || "ud")}`;
                return bajoMinimo(e)
                    ? `<span class="pastilla" data-tono="aviso" title="Stock bajo mínimo"><i class="ri-alert-line" aria-hidden="true"></i> ${texto}</span>`
                    : texto;
            },
        },
        { clave: "caducidad", titulo: "Caducidad", tipo: "fecha" },
        {
            clave: "estado", titulo: "Situación", texto: e => etiquetaEstado(e.estado),
            celda: e => `<span class="pastilla" data-tono="${TONO_ESTADO[e.estado] || "neutro"}">${escapeHtml(etiquetaEstado(e.estado))}</span>`,
        },
    ],
    acciones: e => `
        <button type="button" class="boton boton--icono boton--fantasma" data-accion="stock" data-id="${escapeHtml(e.id)}" aria-label="Ajustar stock de ${escapeHtml(e.nombre)}" title="Ajustar stock"><i class="ri-add-box-line" aria-hidden="true"></i></button>
        <button type="button" class="boton boton--icono boton--fantasma" data-accion="editar" data-id="${escapeHtml(e.id)}" aria-label="Editar ${escapeHtml(e.nombre)}" title="Editar"><i class="ri-edit-line" aria-hidden="true"></i></button>
        <button type="button" class="boton boton--icono boton--fantasma" data-tono="peligro" data-accion="borrar" data-id="${escapeHtml(e.id)}" aria-label="Eliminar ${escapeHtml(e.nombre)}" title="Eliminar"><i class="ri-delete-bin-line" aria-hidden="true"></i></button>`,
});

const meta = e => [etiquetaCategoria(e.categoria), e.ubicacion].filter(Boolean).join(" · ");
const bajoMinimo = e => Number(e.stock ?? 0) <= Number(e.stock_minimo ?? 0);

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    rellenarSelect(filtroCategoria, CATEGORIAS, "Todas las categorías");
    cargarElementos();
});

buscador.addEventListener("input", aplicarFiltros);
filtroCategoria.addEventListener("change", aplicarFiltros);
filtroBajo.addEventListener("change", aplicarFiltros);
orden.addEventListener("change", () => tabla.ordenar(orden.value, "asc"));
// Dos botones para lo mismo: el de la cabecera (escritorio) y el flotante (móvil).
// Cada uno se oculta en el otro tamaño, así que nunca se ven los dos a la vez.
botonEscanear.addEventListener("click", escanearElemento);
document.querySelector("#escanear-flotante").addEventListener("click", escanearElemento);
document.querySelector("#como-funciona").addEventListener("click", () => abrirComoFunciona(GUIA_CONTROL));
lista.addEventListener("click", manejarClickLista);

async function cargarElementos() {
    tabla.cargando();
    try {
        elementos = await DB.getRecords("inventario");
        tabla.datos(elementos);
        aplicarFiltros();
    } catch (error) {
        tabla.error(escapeHtml(error.message));
    }
}

// La tabla ordena (los elementos sin caducidad van al final: no caducan) y
// pagina; aquí solo se dice qué elementos entran según los filtros de arriba.
function aplicarFiltros() {
    const texto = buscador.value.trim().toLowerCase();
    const categoria = filtroCategoria.value;
    const hayFiltro = texto || categoria || filtroBajo.checked;

    tabla.filtro(hayFiltro ? elemento => {
        if (categoria && elemento.categoria !== categoria) return false;
        if (filtroBajo.checked && !bajoMinimo(elemento)) return false;
        if (!texto) return true;

        // Se busca por lo que uno tiene delante en el almacén: el nombre, dónde
        // está, lo que pone en la caja (marca) o el código que acaba de escanear.
        return [elemento.nombre, elemento.ubicacion, elemento.codigo, elemento.marca, etiquetaCategoria(elemento.categoria)]
            .some(campo => (campo || "").toLowerCase().includes(texto));
    } : null);
}

function manejarClickLista(e) {
    const boton = e.target.closest("button[data-accion]");
    if (!boton) return;

    const elemento = elementos.find(item => String(item.id) === String(boton.dataset.id));
    if (!elemento) return;

    if (boton.dataset.accion === "stock") ajustarStock(elemento);
    if (boton.dataset.accion === "editar") window.location.href = `agregar.html?id=${elemento.id}`;
    if (boton.dataset.accion === "borrar") Alert.showConfirmationAlert("inventario", elemento.id);
}

//* Escaneo

async function escanearElemento() {
    const codigo = await abrirEscaner();
    if (!codigo) return;

    try {
        const elemento = await DB.getInventarioByCodigo(codigo);
        if (!elemento) return await asignarCodigoSuelto(codigo);

        // Se ajusta sobre la copia local para que la lista se refresque sin
        // volver a pedir todo el inventario.
        const local = elementos.find(item => String(item.id) === String(elemento.id)) ?? elemento;
        await ajustarStock(local);
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}

// Escanear el código de fábrica de un producto es la forma más cómoda de
// asignárselo: se escanea una vez y a partir de ahí ese código ya lo identifica.
async function asignarCodigoSuelto(codigo) {
    const { isConfirmed } = await Swal.fire({
        title: "Código no asignado",
        html: `El código <strong>${escapeHtml(codigo)}</strong> no está en el inventario.`,
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Asignarlo a un elemento",
        cancelButtonText: "Cerrar"
    });
    if (!isConfirmed) return;

    const sinCodigo = elementos.filter(elemento => !elemento.codigo);
    if (!sinCodigo.length) {
        Alert.showStatusAlert("info", "Nada que asignar", "Todos los elementos tienen ya un código.");
        return;
    }

    const { value: id } = await Swal.fire({
        title: "¿A qué elemento?",
        input: "select",
        inputOptions: Object.fromEntries(sinCodigo.map(elemento => [elemento.id, elemento.nombre])),
        inputPlaceholder: "Elige un elemento",
        showCancelButton: true,
        confirmButtonText: "Asignar",
        cancelButtonText: "Cancelar",
        inputValidator: valor => (valor ? undefined : "Elige un elemento")
    });
    if (!id) return;

    const elemento = elementos.find(item => String(item.id) === String(id));
    await DB.editRecord("inventario", id, { codigo });
    elemento.codigo = codigo;
    avisar(`Código asignado a "${elemento.nombre}"`);
    await ajustarStock(elemento);
}

//* Ajuste de stock (desde la lista o tras escanear: misma pantalla)

async function ajustarStock(elemento) {
    const nuevoStock = await abrirModalStock(elemento);
    if (nuevoStock === null) return;   // cancelado o sin cambios

    try {
        await DB.editRecord("inventario", elemento.id, { stock: nuevoStock });
        elemento.stock = nuevoStock;
        tabla.repintar();
        avisar("Stock actualizado");
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}

/** Aviso breve que no corta el flujo (para escanear varios elementos seguidos). */
function avisar(titulo) {
    Swal.fire({
        toast: true,
        position: "top-end",
        icon: "success",
        title: titulo,
        showConfirmButton: false,
        timer: 1800
    });
}
