// modules/components/Escaner.js
// Lector de codigos reutilizable: abre un modal con la camara y devuelve el
// texto del codigo escaneado (QR o codigo de barras).
//
// Tres formas de meter el codigo, todas a la vez y sin que el usuario elija:
//   1. Camara del movil/tablet (html5-qrcode).
//   2. Pistola lectora USB/Bluetooth: se comporta como un teclado, "teclea" el
//      codigo y pulsa Enter, asi que cae en el input, que esta siempre enfocado.
//   3. A mano, escribiendo el codigo.
// Si no hay camara, se deniega el permiso o la libreria no carga, el modal
// sigue sirviendo para 2 y 3 en vez de quedarse inutil.
//
// Html5Qrcode viene de un <script> CDN (global), como Swal o DataTables.

const CONTENEDOR_CAMARA = "escaner-camara";

let dialogo = null;
let escaner = null;      // instancia de Html5Qrcode mientras la camara esta activa
let resolver = null;     // resolve de la promesa del abrirEscaner() en curso

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
        input.focus();   // para que la pistola lectora "escriba" aqui
        arrancarCamara();
    });
}

async function arrancarCamara() {
    const contenedor = dialogo.querySelector("#" + CONTENEDOR_CAMARA);

    if (typeof Html5Qrcode === "undefined") {
        mostrarAviso("No se pudo cargar el lector de camara. Puedes escanear con la pistola o escribir el codigo.");
        return;
    }

    // El contenedor tiene que estar VISIBLE ANTES de start(): html5-qrcode mide
    // su ancho para dimensionar el visor, y oculto mide 0 y no arranca.
    contenedor.hidden = false;
    dialogo.querySelector(".escaner__aviso").hidden = true;

    try {
        escaner = new Html5Qrcode(CONTENEDOR_CAMARA, {
            formatsToSupport: formatosSoportados(),
            // Usa el lector nativo del navegador cuando existe (Android/Chrome):
            // es bastante mas rapido que el decodificador en JS.
            experimentalFeatures: { useBarCodeDetectorIfSupported: true },
            verbose: false
        });

        await escaner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: calcularVisor },
            texto => cerrar(texto),
            () => {}   // sin lectura en este fotograma: es lo normal, no es un error
        );
    } catch {
        // Sin camara, sin permiso, o en http: getUserMedia solo va en contexto
        // seguro (https o localhost). Desde el movil por IP local no habra camara.
        escaner = null;
        mostrarAviso("No se pudo abrir la camara. Escanea con la pistola o escribe el codigo.");
    }
}

/**
 * Ventana de lectura proporcional al visor real, en vez de un tamano fijo: el
 * modal es casi toda la pantalla en el movil y una tarjeta en escritorio.
 * Apaisada porque los codigos de barras son mas anchos que altos.
 */
function calcularVisor(anchoVisor, altoVisor) {
    const ancho = Math.floor(Math.min(anchoVisor * 0.85, 320));
    const alto = Math.floor(Math.min(ancho * 0.62, altoVisor * 0.75));
    return { width: ancho, height: alto };
}

function mostrarAviso(mensaje) {
    const aviso = dialogo.querySelector(".escaner__aviso");
    aviso.textContent = mensaje;
    aviso.hidden = false;
    // Sin camara no tiene sentido dejar el hueco negro del visor ocupando sitio.
    dialogo.querySelector("#" + CONTENEDOR_CAMARA).hidden = true;
}

async function pararCamara() {
    if (!escaner) return;
    try {
        await escaner.stop();
        escaner.clear();
    } catch {
        // Ya estaba parada: no hay nada que hacer.
    }
    escaner = null;
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
        <p class="escaner__ayuda">Apunta con la cámara al código de barras o QR del elemento.</p>
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

function formatosSoportados() {
    const F = Html5QrcodeSupportedFormats;
    // Solo los que se usan en una clinica: el QR propio y los codigos de barras
    // habituales de producto. Menos formatos = decodificacion mas rapida.
    return [F.QR_CODE, F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF];
}
