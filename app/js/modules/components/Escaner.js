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
        // En un movil NO se enfoca: enfocar abre el teclado en pantalla, que tapa
        // la camara y ademas reajusta el alto del modal (100dvh) justo mientras la
        // libreria mide el video. Donde hay pistola hay teclado fisico, y ahi el
        // foco de entrada si interesa. Si la camara falla se enfoca igualmente
        // (ver mostrarAviso), que es cuando escribir a mano es la unica salida.
        if (!esTactil()) input.focus();
        arrancarCamara();
    });
}

// Puntero grueso y sin hover = movil/tablet a dedo. En un iPad con pistola
// Bluetooth hay teclado fisico, y iOS ya no saca el teclado en pantalla al
// enfocar, asi que no se pierde nada por no enfocar aqui.
function esTactil() {
    return window.matchMedia("(pointer: coarse)").matches;
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

        // SIN qrbox A PROPOSITO: se lee el fotograma entero (como hace ML Kit en
        // nativo). No es solo comodidad de apuntado, es correccion. html5-qrcode
        // calcula la zona a decodificar UNA vez, en el evento "playing" del video
        // y en las medidas que tenia el video en ese instante; luego, en cada
        // fotograma, la reescala dividiendo por las medidas ACTUALES del video
        // (foreverScan: videoWidth/clientWidth). Si el video cambia de tamano
        // despues de "playing" -- y en el movil cambia: teclado, giro, barra de
        // Safari, todos mueven el 100dvh del modal -- esa zona queda desfasada y
        // acaba recortando un trozo del video que no es el que se ve, o incluso
        // fuera de el: la camara sigue dando imagen y no se decodifica nada nunca.
        // Sin qrbox, qrRegion pasa a ser el fotograma completo y la reescala sale
        // exacta pase lo que pase con el layout.
        await escaner.start(
            { facingMode: "environment" },
            { fps: 10 },
            texto => cerrar(texto),
            () => {}   // sin lectura en este fotograma: es lo normal, no es un error
        );
    } catch (error) {
        // Sin camara, sin permiso, o en http: getUserMedia solo va en contexto
        // seguro (https o localhost). Desde el movil por IP local no habra camara.
        escaner = null;
        // El motivo real se pierde si no se arrastra hasta aqui: sin esto, no hay
        // permiso, no hay camara y la camara esta ocupada dan el mismo mensaje.
        mostrarAviso("No se pudo abrir la camara. Escanea con la pistola o escribe el codigo.", error);
    }
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
