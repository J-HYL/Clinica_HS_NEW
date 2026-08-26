// modules/components/Escaner.js
// Lector de codigos reutilizable: abre un modal con la camara y devuelve el
// texto del codigo (QR o codigo de barras) EN CUANTO lo detecta, sin que el
// usuario pulse nada.
//
// Tres formas de meter el codigo, todas a la vez y sin que el usuario elija:
//   1. Camara del movil/tablet: deteccion automatica, sola.
//   2. Pistola lectora USB/Bluetooth: se comporta como un teclado, "teclea" el
//      codigo y pulsa Enter, asi que cae en el input.
//   3. A mano, escribiendo el codigo.
// Si no hay camara, se deniega el permiso o el decodificador no carga, el modal
// sigue sirviendo para 2 y 3 en vez de quedarse inutil.
//
// POR QUE NO SE USA html5-qrcode: decodificaba sobre un lienzo del tamano CSS
// del <video> (~343 px de ancho en un movil), no de la resolucion real de la
// camara. Un EAN-13 son 95 barras: a 343 px salen menos de 2 px por barra y no
// queda nada que leer. Medido con un EAN-13 real sobre un fotograma 1280x720:
// a resolucion nativa se lee aunque el codigo ocupe solo el 15% del ancho;
// reducido a 343 px hace falta que ocupe el 40-60%. De ahi que leyera los QR
// (tienen mucha mas redundancia) y no los codigos de barras. Aqui el fotograma
// se decodifica a RESOLUCION NATIVA, que es lo unico que arregla eso.

const CONTENEDOR_CAMARA = "escaner-camara";
const ZBAR = "https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.11.0/dist/index.mjs";

// Los que se usan en una clinica: el QR propio y los codigos de barras
// habituales de producto.
const FORMATOS = ["qr_code", "ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

let dialogo = null;
let resolver = null;     // resolve de la promesa del abrirEscaner() en curso
let stream = null;       // MediaStream mientras la camara esta encendida
let video = null;
let lienzo = null;
let escaneando = false;
let detectar = null;     // decodificador ya resuelto (se reutiliza entre aperturas)
// Sube en cada arranque y en cada parada. Arrancar la camara tarda (permiso del
// usuario + descarga del decodificador), y en ese hueco se puede cerrar el modal:
// sirve para que un arranque a medias se de cuenta de que ya no pinta nada y se
// apague solo, en vez de encender la camara despues de haber cerrado.
let generacion = 0;

/**
 * Abre el lector y resuelve con el codigo escaneado, o con null si se cancela.
 * @returns {Promise<string|null>}
 */
export function abrirEscaner() {
    if (!dialogo) construirDialogo();

    return new Promise(resolve => {
        resolver = resolve;
        const input = dialogo.querySelector(".escaner__input");
        input.value = "";
        dialogo.showModal();
        // En un movil NO se enfoca: enfocar abre el teclado en pantalla y tapa la
        // camara. Donde hay pistola hay teclado fisico, y ahi el foco si interesa.
        // Si la camara falla se enfoca igualmente (ver mostrarAviso), que es
        // cuando escribir a mano es la unica salida.
        if (!esTactil()) input.focus();
        arrancarCamara();
    });
}

// Puntero grueso = movil/tablet a dedo. En un iPad con pistola Bluetooth hay
// teclado fisico, y iOS ya no saca el teclado en pantalla al enfocar, asi que no
// se pierde nada por no enfocar aqui.
function esTactil() {
    return window.matchMedia("(pointer: coarse)").matches;
}

async function arrancarCamara() {
    const contenedor = dialogo.querySelector("#" + CONTENEDOR_CAMARA);
    contenedor.hidden = false;
    dialogo.querySelector(".escaner__aviso").hidden = true;

    const mia = ++generacion;

    try {
        const recien = await navigator.mediaDevices.getUserMedia({
            // 1280x720 es lo que se midio: suficiente para leer un codigo pequeno
            // dentro del fotograma sin que decodificar cueste demasiado.
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });

        // Cerrado mientras se pedia permiso: hay que apagar esto a mano, porque
        // pararCamara() ya paso cuando stream todavia era null.
        if (mia !== generacion) return apagarPistas(recien);
        stream = recien;

        video = document.createElement("video");
        // playsInline es obligatorio en iOS: sin el, Safari se lleva el video a su
        // reproductor a pantalla completa y aqui no queda nada que escanear.
        video.playsInline = true;
        video.setAttribute("playsinline", "");
        video.muted = true;
        video.srcObject = stream;
        contenedor.replaceChildren(video);
        await video.play();
        if (mia !== generacion) return pararCamara();

        // La primera vez esto descarga el decodificador: el hueco mas largo, y
        // por tanto donde mas facil es que al usuario le de tiempo a cerrar.
        if (!detectar) detectar = await crearDetector();
        if (mia !== generacion) return pararCamara();
        if (!lienzo) lienzo = document.createElement("canvas");

        escaneando = true;
        bucle();
    } catch (error) {
        await pararCamara();
        // Sin camara, sin permiso, o en http: getUserMedia solo va en contexto
        // seguro (https o localhost). Desde el movil por IP local no habra camara.
        // El motivo real se pierde si no se arrastra hasta aqui.
        mostrarAviso("No se pudo abrir la camara. Escanea con la pistola o escribe el codigo.", error);
    }
}

async function bucle() {
    if (!escaneando || !video) return;

    // EL PUNTO CLAVE: el lienzo va a la resolucion REAL de la camara
    // (video.videoWidth), no a la que el video ocupa en pantalla. Da igual como
    // de grande o pequeno se vea el visor: se decodifica el fotograma entero,
    // completo y sin reducir.
    if (video.videoWidth && lienzo.width !== video.videoWidth) {
        lienzo.width = video.videoWidth;
        lienzo.height = video.videoHeight;
    }

    if (lienzo.width) {
        const ctx = lienzo.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, 0, 0);
        try {
            const codigo = await detectar(lienzo, ctx);
            if (codigo) return cerrar(codigo);
        } catch {
            // Fotograma ilegible (movido, desenfocado): es lo normal, no es error.
        }
    }

    if (escaneando) siguienteFotograma();
}

// requestVideoFrameCallback despierta solo cuando hay fotograma nuevo, sin
// escanear dos veces el mismo. Donde no exista, un timeout corto basta: el
// propio decodificador ya marca el ritmo (~70 ms por fotograma).
function siguienteFotograma() {
    if (video?.requestVideoFrameCallback) video.requestVideoFrameCallback(() => bucle());
    else setTimeout(() => bucle(), 100);
}

async function crearDetector() {
    // Chrome de Android: BarcodeDetector ES ML Kit por debajo. Nativo y lo mas
    // rapido que hay, asi que se usa siempre que exista.
    if ("BarcodeDetector" in window) {
        try {
            const disponibles = await window.BarcodeDetector.getSupportedFormats();
            const formats = FORMATOS.filter(formato => disponibles.includes(formato));
            if (formats.length) {
                const nativo = new window.BarcodeDetector({ formats });
                return async fuente => {
                    const [hallado] = await nativo.detect(fuente);
                    return hallado?.rawValue ?? null;
                };
            }
        } catch {
            // Existe pero no arranca: se cae a ZBar, que funciona en todas partes.
        }
    }

    // Safari/iOS no tiene BarcodeDetector. ZBar compilado a WebAssembly lee tanto
    // QR como codigos de barras, y es el equivalente mas cercano a ML Kit en web.
    const zbar = await import(ZBAR);
    return async (fuente, ctx) => {
        const imagen = ctx.getImageData(0, 0, fuente.width, fuente.height);
        const simbolos = await zbar.scanImageData(imagen);
        return simbolos.length ? simbolos[0].decode() : null;
    };
}

function mostrarAviso(mensaje, error) {
    const aviso = dialogo.querySelector(".escaner__aviso");
    aviso.textContent = mensaje;
    aviso.hidden = false;
    if (error) {
        console.error("[Escaner] La camara no arranco:", error);
        aviso.title = String(error?.message ?? error);
    }
    // Sin camara no tiene sentido dejar el hueco negro del visor ocupando sitio.
    dialogo.querySelector("#" + CONTENEDOR_CAMARA).hidden = true;
    // Escribir o disparar la pistola es lo unico que queda: el foco va aqui.
    dialogo.querySelector(".escaner__input").focus();
}

function apagarPistas(cual) {
    cual?.getTracks().forEach(pista => pista.stop());
}

async function pararCamara() {
    escaneando = false;
    generacion++;             // invalida cualquier arranque que siga a medias
    apagarPistas(stream);
    stream = null;
    if (video) {
        video.srcObject = null;
        video = null;
    }
}

async function cerrar(codigo) {
    if (!resolver) return;          // evita resolver dos veces (ESC + lectura a la vez)
    const responder = resolver;
    resolver = null;

    await pararCamara();
    if (dialogo.open) dialogo.close();
    responder(codigo ?? null);
}

function construirDialogo() {
    dialogo = document.createElement("dialog");
    dialogo.className = "escaner";
    dialogo.innerHTML = `
        <h3 class="escaner__titulo">Escanear código</h3>
        <p class="escaner__ayuda">Apunta con la cámara al código de barras o QR: se lee solo.</p>
        <div id="${CONTENEDOR_CAMARA}" class="escaner__camara" hidden></div>
        <p class="escaner__aviso" hidden></p>
        <form class="escaner__manual">
            <label class="escaner__label" for="escaner-input">O escanéalo con la pistola / escríbelo</label>
            <div class="escaner__fila">
                <input type="text" id="escaner-input" class="escaner__input" autocomplete="off" placeholder="Código del elemento">
                <button type="submit" class="escaner__btn escaner__btn--buscar">Buscar</button>
            </div>
        </form>
        <button type="button" class="escaner__btn escaner__btn--cerrar">Cancelar</button>
    `;
    document.body.appendChild(dialogo);

    dialogo.querySelector(".escaner__manual").addEventListener("submit", e => {
        e.preventDefault();
        const codigo = dialogo.querySelector(".escaner__input").value.trim();
        if (codigo) cerrar(codigo);
    });

    dialogo.querySelector(".escaner__btn--cerrar").addEventListener("click", () => cerrar(null));
    // Cerrar con ESC tiene que apagar la camara igual que el boton.
    dialogo.addEventListener("close", () => cerrar(null));
}
