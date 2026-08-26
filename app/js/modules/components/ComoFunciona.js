// modules/components/ComoFunciona.js
// Guia de "¿Cómo funciona?" reutilizable: un modal que va pasando por pasos, y
// en cada uno pinta un esquema de la pantalla (bloques) con UNA zona resaltada
// y el texto de que es y que hay que hacer.
//
// El esquema es un dibujo, no la pantalla real: asi la guia se entiende igual
// aunque la tabla este vacia, y no se rompe al mover un elemento del HTML.
//
// El contenido (esquemas y pasos) lo pone cada pagina; aqui solo esta el motor.
// Ver app/js/modules/components/guiaInventario.js para un ejemplo.
//
// Forma de la guia:
//   {
//     titulo: "Cómo funciona el inventario",
//     vistas: { control: "<svg…>", modalStock: "<svg…>" },   // esquemas
//     pasos:  [{ vista: "control", zona: "escanear", titulo, texto }]
//   }
// Cada zona resaltable del SVG es un <g class="zona" data-zona="escanear">.

let dialogo = null;
let guia = null;
let indice = 0;

export function abrirComoFunciona(contenido) {
    if (!dialogo) construirDialogo();

    guia = contenido;
    dialogo.querySelector(".guia__titulo").textContent = contenido.titulo;
    pintarPuntos();
    irAlPaso(0);
    dialogo.showModal();
}

function irAlPaso(nuevo) {
    indice = Math.max(0, Math.min(nuevo, guia.pasos.length - 1));
    const paso = guia.pasos[indice];
    const esUltimo = indice === guia.pasos.length - 1;

    const lienzo = dialogo.querySelector(".guia__lienzo");
    lienzo.innerHTML = guia.vistas[paso.vista];
    // Resaltar la zona del paso: el resto se atenúa desde el CSS.
    lienzo.querySelectorAll(".zona").forEach(zona => {
        zona.classList.toggle("zona--activa", zona.dataset.zona === paso.zona);
    });

    dialogo.querySelector(".guia__contador").textContent = `Paso ${indice + 1} de ${guia.pasos.length}`;
    dialogo.querySelector(".guia__paso-titulo").textContent = paso.titulo;
    dialogo.querySelector(".guia__paso-texto").textContent = paso.texto;

    dialogo.querySelector(".guia__btn--anterior").disabled = indice === 0;
    dialogo.querySelector(".guia__btn--siguiente").textContent = esUltimo ? "Entendido" : "Siguiente";

    dialogo.querySelectorAll(".guia__punto").forEach((punto, i) => {
        punto.classList.toggle("guia__punto--activo", i === indice);
        punto.setAttribute("aria-current", i === indice ? "step" : "false");
    });
}

function pintarPuntos() {
    const contenedor = dialogo.querySelector(".guia__puntos");
    contenedor.innerHTML = guia.pasos
        .map((paso, i) => `<button type="button" class="guia__punto" data-paso="${i}" aria-label="Ir al paso ${i + 1}: ${paso.titulo}"></button>`)
        .join("");
}

function siguiente() {
    if (indice === guia.pasos.length - 1) dialogo.close();
    else irAlPaso(indice + 1);
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "guia";
    dialogo.innerHTML = `
        <div class="guia__cabecera">
            <h3 class="guia__titulo"></h3>
            <button type="button" class="guia__cerrar" aria-label="Cerrar la guía"><i class="ri-close-line"></i></button>
        </div>

        <div class="guia__contenido">
            <div class="guia__lienzo"></div>
            <div class="guia__texto" aria-live="polite">
                <span class="guia__contador"></span>
                <h4 class="guia__paso-titulo"></h4>
                <p class="guia__paso-texto"></p>
            </div>
        </div>

        <div class="guia__pie">
            <div class="guia__puntos"></div>
            <div class="guia__nav">
                <button type="button" class="guia__btn guia__btn--anterior">Anterior</button>
                <button type="button" class="guia__btn guia__btn--siguiente">Siguiente</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialogo);

    dialogo.querySelector(".guia__cerrar").addEventListener("click", () => dialogo.close());
    dialogo.querySelector(".guia__btn--anterior").addEventListener("click", () => irAlPaso(indice - 1));
    dialogo.querySelector(".guia__btn--siguiente").addEventListener("click", siguiente);

    dialogo.querySelector(".guia__puntos").addEventListener("click", e => {
        const punto = e.target.closest(".guia__punto");
        if (punto) irAlPaso(Number(punto.dataset.paso));
    });

    // Flechas para pasar los pasos (ESC ya lo cierra el propio <dialog>).
    dialogo.addEventListener("keydown", e => {
        if (e.key === "ArrowRight") irAlPaso(indice + 1);
        if (e.key === "ArrowLeft") irAlPaso(indice - 1);
    });
}
