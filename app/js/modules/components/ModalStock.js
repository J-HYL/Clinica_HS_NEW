// modules/components/ModalStock.js
// Modal para corregir el stock de un elemento del inventario. Lo usan las dos
// entradas que hay a la misma accion: el boton de la tabla y el escaneo de un
// codigo. Misma pantalla en ambos casos, a proposito.
//
// El input es el stock RESULTANTE (no el incremento): es lo que se guarda y lo
// que el usuario acaba comprobando contra lo que tiene delante. Los botones
// -5/-1/+1/+5 son solo atajos para no teclear.

import { etiquetaCategoria } from "./inventario.js";
import { escapeHtml } from "../html.js";

let dialogo = null;
let resolver = null;
let stockInicial = 0;
let minimo = 0;

/**
 * Abre el modal y resuelve con el stock nuevo, o con null si se cancela o no
 * se cambia nada.
 * @param {Object} elemento - registro de inventario
 * @returns {Promise<number|null>}
 */
export function abrirModalStock(elemento) {
    if (!dialogo) construirDialogo();

    stockInicial = Number(elemento.stock ?? 0);
    minimo = Number(elemento.stock_minimo ?? 0);
    const unidad = elemento.unidad || "ud";

    const foto = dialogo.querySelector(".stock__foto");
    const sinFoto = dialogo.querySelector(".stock__sinfoto");
    if (elemento.foto) {
        foto.src = `/${elemento.foto}`;
        foto.alt = `Foto de ${elemento.nombre}`;
    }
    foto.hidden = !elemento.foto;
    sinFoto.hidden = !!elemento.foto;

    dialogo.querySelector(".stock__nombre").textContent = elemento.nombre;
    dialogo.querySelector(".stock__meta").textContent =
        [etiquetaCategoria(elemento.categoria), elemento.ubicacion].filter(Boolean).join(" · ");

    const codigo = dialogo.querySelector(".stock__codigo");
    codigo.textContent = elemento.codigo || "";
    codigo.hidden = !elemento.codigo;

    dialogo.querySelector(".stock__actual").innerHTML =
        `Stock actual: <strong>${escapeHtml(stockInicial)} ${escapeHtml(unidad)}</strong>`;
    dialogo.querySelector(".stock__unidad").textContent = unidad;

    const input = dialogo.querySelector(".stock__input");
    input.value = stockInicial;

    refrescar();
    dialogo.showModal();
    input.focus();
    input.select();

    return new Promise(resolve => { resolver = resolve; });
}

function valorActual() {
    const valor = Number(dialogo.querySelector(".stock__input").value);
    return Number.isFinite(valor) ? valor : stockInicial;
}

function fijarValor(nuevo) {
    // El stock no puede quedar negativo: por debajo de 0 no significa nada.
    dialogo.querySelector(".stock__input").value = Math.max(0, Math.round(nuevo));
    refrescar();
}

function refrescar() {
    const nuevo = valorActual();
    const delta = nuevo - stockInicial;
    const resumen = dialogo.querySelector(".stock__resumen");
    const aviso = dialogo.querySelector(".stock__aviso");

    resumen.textContent = delta === 0
        ? "Sin cambios"
        : `${stockInicial} → ${nuevo} (${delta > 0 ? "+" : ""}${delta})`;
    resumen.classList.toggle("stock__resumen--cambio", delta !== 0);

    aviso.hidden = !(nuevo <= minimo);
    aviso.textContent = nuevo <= minimo ? `Quedará en el mínimo o por debajo (mínimo: ${minimo})` : "";

    dialogo.querySelector(".stock__btn--guardar").disabled = delta === 0 || nuevo < 0;
    dialogo.querySelector(".stock__paso--menos").disabled = nuevo <= 0;
}

function cerrar(valor) {
    if (!resolver) return;
    const responder = resolver;
    resolver = null;
    if (dialogo.open) dialogo.close();
    responder(valor);
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "stock";
    dialogo.innerHTML = `
        <div class="stock__cabecera">
            <div class="stock__marco">
                <img class="stock__foto" alt="" hidden>
                <span class="stock__sinfoto"><i class="ri-camera-off-line"></i></span>
            </div>
            <div class="stock__datos">
                <h3 class="stock__nombre"></h3>
                <p class="stock__meta"></p>
                <span class="stock__codigo" hidden></span>
            </div>
        </div>

        <p class="stock__actual"></p>

        <div class="stock__stepper">
            <button type="button" class="stock__paso stock__paso--menos" aria-label="Quitar una unidad"><i class="ri-subtract-line"></i></button>
            <div class="stock__campo">
                <input type="number" class="stock__input" min="0" step="1" inputmode="numeric" aria-label="Stock resultante">
                <span class="stock__unidad"></span>
            </div>
            <button type="button" class="stock__paso stock__paso--mas" aria-label="Añadir una unidad"><i class="ri-add-line"></i></button>
        </div>

        <div class="stock__rapidos">
            <button type="button" class="stock__rapido" data-delta="-5">−5</button>
            <button type="button" class="stock__rapido" data-delta="-1">−1</button>
            <button type="button" class="stock__rapido" data-delta="1">+1</button>
            <button type="button" class="stock__rapido" data-delta="5">+5</button>
        </div>

        <p class="stock__resumen"></p>
        <p class="stock__aviso" hidden></p>

        <div class="stock__acciones">
            <button type="button" class="stock__btn stock__btn--guardar">Guardar</button>
            <button type="button" class="stock__btn stock__btn--cerrar">Cancelar</button>
        </div>
    `;
    document.body.appendChild(dialogo);

    const input = dialogo.querySelector(".stock__input");

    dialogo.querySelector(".stock__paso--menos").addEventListener("click", () => fijarValor(valorActual() - 1));
    dialogo.querySelector(".stock__paso--mas").addEventListener("click", () => fijarValor(valorActual() + 1));

    dialogo.querySelectorAll(".stock__rapido").forEach(boton => {
        boton.addEventListener("click", () => fijarValor(valorActual() + Number(boton.dataset.delta)));
    });

    input.addEventListener("input", refrescar);
    input.addEventListener("keydown", e => {
        if (e.key !== "Enter") return;
        e.preventDefault();   // Enter guarda, que es lo que se espera aquí
        if (!dialogo.querySelector(".stock__btn--guardar").disabled) cerrar(valorActual());
    });

    dialogo.querySelector(".stock__btn--guardar").addEventListener("click", () => cerrar(valorActual()));
    dialogo.querySelector(".stock__btn--cerrar").addEventListener("click", () => cerrar(null));
    dialogo.addEventListener("close", () => cerrar(null));   // ESC
}
