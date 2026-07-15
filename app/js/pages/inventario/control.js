import { displayRecordsInTable, setTableEventsListeners } from "../../modules/funciones.js";
import { emptyContainer, table } from "../../modules/selectores.js";
import { CATEGORIAS, etiquetaCategoria, rellenarSelect } from "../../modules/components/inventario.js";
import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import DB from "../../modules/classes/DB_API.js";

//* Selectores Específicos
const filtroCategoria = document.querySelector("#filtro-categoria");
const filtroBajo = document.querySelector("#filtro-bajo");

// Los elementos se traen una vez y los filtros se aplican en memoria: el
// inventario de una clínica es pequeño y así el filtrado es instantáneo.
let elementos = [];

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    rellenarSelect(filtroCategoria, CATEGORIAS, "Todas las categorías");
    cargarElementos();
});

filtroCategoria.addEventListener("change", pintarTabla);
filtroBajo.addEventListener("change", pintarTabla);
table.addEventListener("click", manejarClickTabla);

async function cargarElementos() {
    try {
        elementos = await DB.getRecords("inventario");
        pintarTabla();
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}

function pintarTabla() {
    // displayRecordsInTable vuelve a mostrar el aviso de "sin registros" si hace
    // falta; aquí solo hay que retirarlo del render anterior.
    emptyContainer.classList.remove("show");
    displayRecordsInTable(filtrarElementos().map(aFilaDeTabla));
}

function filtrarElementos() {
    const categoria = filtroCategoria.value;
    return elementos.filter(elemento => {
        if (categoria && elemento.categoria !== categoria) return false;
        if (filtroBajo.checked && Number(elemento.stock) > Number(elemento.stock_minimo)) return false;
        return true;
    });
}

// La tabla es un resumen: el resto de campos (marca, proveedor, notas...) se ven
// en la ficha de edición. stock_minimo y unidad viajan ocultos para el render.
function aFilaDeTabla(elemento) {
    return {
        id: elemento.id,
        foto: elemento.foto,
        nombre: elemento.nombre,
        categoria: etiquetaCategoria(elemento.categoria),
        stock: Number(elemento.stock ?? 0),
        stock_minimo: Number(elemento.stock_minimo ?? 0),
        unidad: elemento.unidad,
        ubicacion: elemento.ubicacion || "—",
        caducidad: elemento.caducidad || "",
        estado: elemento.estado
    };
}

function manejarClickTabla(e) {
    const boton = e.target.closest("button");
    // El ajuste rápido de stock es propio del inventario; el resto de botones
    // (editar, eliminar) los gestiona el manejador común.
    if (boton && boton.classList.contains("table__btn--stock")) {
        ajustarStock(boton.dataset.id);
        return;
    }
    setTableEventsListeners(e, "inventario");
}

// Corregir existencias es lo más frecuente del día a día, así que se hace desde
// la tabla sin pasar por la ficha completa.
async function ajustarStock(id) {
    const elemento = elementos.find(item => String(item.id) === String(id));
    if (!elemento) return;

    const { value: nuevoStock } = await Swal.fire({
        title: "Ajustar stock",
        html: `<p>${escapeHtml(elemento.nombre)}</p>`,
        input: "number",
        inputLabel: `Unidades (${escapeHtml(elemento.unidad || "ud")})`,
        inputValue: elemento.stock,
        inputAttributes: { min: "0", step: "1" },
        showCancelButton: true,
        confirmButtonText: "Guardar",
        cancelButtonText: "Cancelar",
        inputValidator: valor =>
            valor === "" || Number(valor) < 0 ? "Introduce una cantidad válida" : undefined
    });

    if (nuevoStock === undefined) return; // cancelado

    try {
        await DB.editRecord("inventario", id, { stock: Number(nuevoStock) });
        elemento.stock = Number(nuevoStock);
        pintarTabla();
        Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: "Stock actualizado",
            showConfirmButton: false,
            timer: 1800
        });
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}
