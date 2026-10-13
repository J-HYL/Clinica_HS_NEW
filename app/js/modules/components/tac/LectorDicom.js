// modules/components/tac/LectorDicom.js
// Puerta de entrada al lector DICOM (lectorDicom.worker.js). Cada operación
// lanza un worker nuevo y lo cierra al acabar: así la memoria del estudio
// (cientos de MB) se libera entera en cuanto el resultado llega a la página.

const URL_WORKER = new URL("./lectorDicom.worker.js", import.meta.url);

/** Texto para el usuario de cada fase que va avisando el worker. */
export const FASES = {
    leyendo: "Leyendo las imágenes DICOM",
    montando: "Montando el volumen",
    empaquetando: "Preparando el estudio para subirlo",
    verificando: "Comprobando el estudio",
    calculando: "Ajustando el contraste",
    preparando3d: "Preparando la vista 3D",
};

function ejecutar(tipo, zip, alProgresar, senal) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(URL_WORKER);

        // Cancelar = matar el worker: suelta al momento la memoria del estudio.
        const cancelar = () => {
            worker.terminate();
            reject(new DOMException("Lectura cancelada", "AbortError"));
        };
        if (senal?.aborted) return cancelar();
        senal?.addEventListener("abort", cancelar, { once: true });

        const terminar = () => {
            senal?.removeEventListener("abort", cancelar);
            worker.terminate();
        };

        worker.onmessage = ({ data }) => {
            if (data.tipo === "progreso") {
                alProgresar?.(data);
                return;
            }
            terminar();
            if (data.tipo === "error") reject(new Error(data.mensaje));
            else resolve(data.resultado);
        };

        // Si salta aquí es que el worker ni arrancó (sin conexión con el CDN, p. ej.).
        worker.onerror = (evento) => {
            evento.preventDefault();
            terminar();
            reject(new Error("No se pudo cargar el lector de imágenes DICOM. Comprueba la conexión a internet y vuelve a intentarlo."));
        };

        // El zip se transfiere (no se copia): deja de estar disponible aquí.
        worker.postMessage({ tipo, zip }, [zip]);
    });
}

/**
 * Antes de subir: valida el zip y devuelve los datos del estudio, una vista
 * previa, la huella sha256 y, si había algo más que la serie, el zip depurado.
 * @param {ArrayBuffer} zip
 * @param {AbortSignal} [senal] - para cancelar (p. ej. al cerrar el modal)
 */
export function analizarZip(zip, alProgresar, senal) {
    return ejecutar("analizar", zip, alProgresar, senal);
}

/**
 * En el visor: monta el volumen completo (y uno reducido para el 3D).
 * @param {ArrayBuffer} zip
 */
export function montarVolumen(zip, alProgresar) {
    return ejecutar("volumen", zip, alProgresar);
}
