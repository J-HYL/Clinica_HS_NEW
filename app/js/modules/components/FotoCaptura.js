// modules/components/FotoCaptura.js
// Captura de foto reutilizable: usa la camara del dispositivo (getUserMedia) y,
// si no hay camara o se deniega el permiso, cae al selector de archivos (en movil
// ese selector ya ofrece la camara por el atributo capture).
//
// La foto se redimensiona y recomprime en el navegador ANTES de subirla: una foto
// de movil son varios MB y aqui solo hace falta identificar el elemento.
//
// El <input type="file"> que crea este componente NO lleva atributo name a
// proposito: asi getFormData() (que hace new FormData(form)) lo ignora y el
// payload JSON del formulario sigue siendo solo texto. La foto viaja aparte,
// por el endpoint multipart inventario_foto.

const MAX_LADO = 1280;      // px del lado mayor; suficiente para identificar el elemento
const CALIDAD_JPEG = 0.85;

/**
 * Monta el capturador dentro de un contenedor.
 * @param {HTMLElement} contenedor - div vacio donde se pinta el componente
 * @returns {{getBlob: Function, mostrarFotoExistente: Function, sePidioQuitar: Function}}
 */
export function initFotoCaptura(contenedor) {
    contenedor.innerHTML = `
        <div class="foto__preview">
            <img class="foto__img" alt="Foto del elemento" hidden>
            <div class="foto__placeholder">
                <i class="ri-camera-off-line"></i>
                <span>Sin foto</span>
            </div>
        </div>
        <div class="foto__actions">
            <button type="button" class="foto__btn foto__btn--camara"><i class="ri-camera-fill"></i> Hacer foto</button>
            <button type="button" class="foto__btn foto__btn--archivo"><i class="ri-image-add-fill"></i> Subir imagen</button>
            <button type="button" class="foto__btn foto__btn--quitar" hidden><i class="ri-delete-bin-fill"></i> Quitar</button>
        </div>
        <input type="file" class="foto__file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden>
    `;

    const img         = contenedor.querySelector(".foto__img");
    const placeholder = contenedor.querySelector(".foto__placeholder");
    const inputFile   = contenedor.querySelector(".foto__file");
    const btnCamara   = contenedor.querySelector(".foto__btn--camara");
    const btnArchivo  = contenedor.querySelector(".foto__btn--archivo");
    const btnQuitar   = contenedor.querySelector(".foto__btn--quitar");

    // blobPendiente: foto nueva aun sin subir. pidioQuitar: se quito la que ya
    // estaba guardada en el servidor (hay que borrarla al guardar).
    let blobPendiente = null;
    let urlPrevia     = null;
    let pidioQuitar   = false;
    let stream        = null;

    const dialogo = crearDialogoCamara();
    document.body.appendChild(dialogo);
    const video       = dialogo.querySelector(".camara__video");
    const btnDisparar = dialogo.querySelector(".camara__btn--disparar");
    const btnCerrar   = dialogo.querySelector(".camara__btn--cerrar");
    const avisoCamara = dialogo.querySelector(".camara__aviso");

    function pintarPreview(url) {
        if (urlPrevia) URL.revokeObjectURL(urlPrevia);
        urlPrevia = url && url.startsWith("blob:") ? url : null;

        img.src = url || "";
        img.hidden = !url;
        placeholder.hidden = !!url;
        btnQuitar.hidden = !url;
    }

    function usarBlob(blob) {
        if (!blob) return;
        blobPendiente = blob;
        pidioQuitar = false;
        pintarPreview(URL.createObjectURL(blob));
    }

    //* Camara
    async function abrirCamara() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            inputFile.click(); // navegador sin API de camara: selector de archivos
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", width: { ideal: 1280 } }
            });
        } catch {
            // Sin permiso, sin camara, o contexto no seguro (http): respaldo.
            inputFile.click();
            return;
        }
        video.srcObject = stream;
        avisoCamara.hidden = true;
        dialogo.showModal();
    }

    function cerrarCamara() {
        if (stream) {
            stream.getTracks().forEach(pista => pista.stop());
            stream = null;
        }
        video.srcObject = null;
        if (dialogo.open) dialogo.close();
    }

    async function disparar() {
        if (!video.videoWidth) {
            avisoCamara.hidden = false; // la camara aun no da imagen
            return;
        }
        const blob = await redimensionar(video, video.videoWidth, video.videoHeight);
        usarBlob(blob);
        cerrarCamara();
    }

    //* Eventos
    btnCamara.addEventListener("click", abrirCamara);
    btnArchivo.addEventListener("click", () => inputFile.click());
    btnDisparar.addEventListener("click", disparar);
    btnCerrar.addEventListener("click", cerrarCamara);
    // Cerrar con ESC tambien tiene que apagar la camara.
    dialogo.addEventListener("close", cerrarCamara);

    btnQuitar.addEventListener("click", () => {
        blobPendiente = null;
        pidioQuitar = true;
        inputFile.value = "";
        pintarPreview(null);
    });

    inputFile.addEventListener("change", async () => {
        const archivo = inputFile.files[0];
        if (!archivo) return;
        const imagen = await cargarImagen(archivo);
        if (!imagen) return;
        usarBlob(await redimensionar(imagen, imagen.naturalWidth, imagen.naturalHeight));
    });

    return {
        /** Blob JPEG de la foto nueva pendiente de subir, o null si no hay. */
        getBlob: () => blobPendiente,
        /** Pinta la foto ya guardada (ruta relativa devuelta por la API). */
        mostrarFotoExistente(ruta) {
            if (!ruta) return;
            blobPendiente = null;
            pidioQuitar = false;
            pintarPreview(`/${ruta}`);
        },
        /** true si el usuario quito la foto que ya estaba guardada. */
        sePidioQuitar: () => pidioQuitar && !blobPendiente
    };
}

/** Dibuja la fuente (video o imagen) en un canvas escalado y devuelve un Blob JPEG. */
function redimensionar(fuente, ancho, alto) {
    const escala = Math.min(1, MAX_LADO / Math.max(ancho, alto));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(ancho * escala);
    canvas.height = Math.round(alto * escala);
    canvas.getContext("2d").drawImage(fuente, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG));
}

/** Carga un File en un <img> para poder redibujarlo. Devuelve null si no es imagen. */
function cargarImagen(archivo) {
    return new Promise(resolve => {
        const url = URL.createObjectURL(archivo);
        const imagen = new Image();
        imagen.onload = () => {
            URL.revokeObjectURL(url);
            resolve(imagen);
        };
        imagen.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        imagen.src = url;
    });
}

function crearDialogoCamara() {
    const dialogo = document.createElement("dialog");
    dialogo.className = "camara";
    dialogo.innerHTML = `
        <video class="camara__video" playsinline autoplay muted></video>
        <p class="camara__aviso" hidden>La camara todavia no da imagen, espera un momento.</p>
        <div class="camara__actions">
            <button type="button" class="camara__btn camara__btn--disparar"><i class="ri-camera-fill"></i> Capturar</button>
            <button type="button" class="camara__btn camara__btn--cerrar">Cancelar</button>
        </div>
    `;
    return dialogo;
}
