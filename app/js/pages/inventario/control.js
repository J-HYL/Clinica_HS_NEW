import { emptyContainer } from "../../modules/selectores.js";
import { hideSpinnerSection } from "../../modules/components/Spinner.js";
import { CATEGORIAS, etiquetaCategoria, rellenarSelect } from "../../modules/components/inventario.js";
import { pintarInventario } from "../../modules/components/TablaInventario.js";
import { abrirModalStock } from "../../modules/components/ModalStock.js";
import { abrirEscaner } from "../../modules/components/Escaner.js";
import { abrirComoFunciona } from "../../modules/components/ComoFunciona.js";
import { GUIA_CONTROL } from "../../modules/components/guiaInventario.js";
import { escapeHtml } from "../../modules/html.js";
import Alert from "../../modules/components/Alert.js";
import DB from "../../modules/classes/DB_API.js";

//* Selectores Específicos
const lista = document.querySelector("#lista");
const contador = document.querySelector("#contador");
const buscador = document.querySelector("#buscador");
const filtroCategoria = document.querySelector("#filtro-categoria");
const filtroBajo = document.querySelector("#filtro-bajo");
const orden = document.querySelector("#orden");
const botonEscanear = document.querySelector("#escanear");

// Los elementos se traen una vez y buscar/filtrar/ordenar se hace en memoria: el
// inventario de una clínica cabe de sobra y así responde al instante.
let elementos = [];

//* Eventos
document.addEventListener("DOMContentLoaded", () => {
    rellenarSelect(filtroCategoria, CATEGORIAS, "Todas las categorías");
    cargarElementos();
});

buscador.addEventListener("input", pintarLista);
filtroCategoria.addEventListener("change", pintarLista);
filtroBajo.addEventListener("change", pintarLista);
orden.addEventListener("change", pintarLista);
// Dos botones para lo mismo: el de la cabecera (escritorio) y el flotante (móvil).
// Cada uno se oculta en el otro tamaño, así que nunca se ven los dos a la vez.
botonEscanear.addEventListener("click", escanearElemento);
document.querySelector("#escanear-flotante").addEventListener("click", escanearElemento);
document.querySelector("#como-funciona").addEventListener("click", () => abrirComoFunciona(GUIA_CONTROL));
lista.addEventListener("click", manejarClickLista);

async function cargarElementos() {
    try {
        elementos = await DB.getRecords("inventario");
        pintarLista();
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    } finally {
        hideSpinnerSection();
    }
}

function pintarLista() {
    const visibles = ordenar(filtrar());

    emptyContainer.classList.toggle("show", visibles.length === 0);
    contador.textContent = textoContador(visibles.length);
    pintarInventario(lista, visibles);
}

function textoContador(visibles) {
    if (!elementos.length) return "";
    if (visibles === elementos.length) return `${elementos.length} elemento${elementos.length === 1 ? "" : "s"}`;
    return `${visibles} de ${elementos.length} elementos`;
}

function filtrar() {
    const texto = buscador.value.trim().toLowerCase();
    const categoria = filtroCategoria.value;

    return elementos.filter(elemento => {
        if (categoria && elemento.categoria !== categoria) return false;
        if (filtroBajo.checked && Number(elemento.stock) > Number(elemento.stock_minimo)) return false;
        if (!texto) return true;

        // Se busca por lo que uno tiene delante en el almacén: el nombre, dónde
        // está, lo que pone en la caja (marca) o el código que acaba de escanear.
        return [elemento.nombre, elemento.ubicacion, elemento.codigo, elemento.marca, etiquetaCategoria(elemento.categoria)]
            .some(campo => (campo || "").toLowerCase().includes(texto));
    });
}

function ordenar(visibles) {
    const criterio = orden.value;

    return [...visibles].sort((a, b) => {
        if (criterio === "stock") return Number(a.stock) - Number(b.stock);
        // Sin caducidad = no caduca: al final, que no estorbe a lo que sí caduca.
        if (criterio === "caducidad") return (a.caducidad || "9999-12-31").localeCompare(b.caducidad || "9999-12-31");
        return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" });
    });
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
        pintarLista();
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
