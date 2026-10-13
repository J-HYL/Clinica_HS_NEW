// modules/components/tac/ApiTAC.js
// Llamadas a /api/tac.php (estudios TAC). Va aparte de DB_API.js porque aquí se
// mueven ficheros de cientos de MB: se suben por trozos y se descargan por
// tramos, cada petición corta y con reintentos, para que un corte de red o el
// timeout del proxy no obliguen a empezar de cero.

const URL_API = "/api/tac.php";
const TRAMO_DESCARGA = 16 * 1024 * 1024;
const REINTENTOS = 3;

async function pedir(accion, { metodo = "GET", id, cuerpo } = {}) {
    const url = `${URL_API}?accion=${accion}${id ? `&id=${encodeURIComponent(id)}` : ""}`;
    const res = await fetch(url, {
        method: metodo,
        credentials: "include",
        headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(datos.error || `Error ${res.status} en el servidor`);
    return datos;
}

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function listarEstudios() {
    return pedir("listar");
}

export function obtenerEstudio(id) {
    return pedir("ver", { id });
}

export function borrarEstudio(id) {
    return pedir("borrar", { metodo: "POST", id });
}

/**
 * Sube un estudio ya analizado. Si algo falla o se cancela, borra lo que se
 * hubiera subido para no dejar restos en el servidor.
 * @param {Blob} zip - el zip a subir (el original o el depurado por el lector)
 * @param {Object} datos - client_id, sha256 y metadatos del estudio
 * @param {(subido:number, total:number) => void} alProgresar
 * @param {AbortSignal} senal - para cancelar
 * @returns {Promise<number>} id del estudio
 */
export async function subirEstudio(zip, datos, alProgresar, senal) {
    const { id, trozo } = await pedir("iniciar", { metodo: "POST", cuerpo: { ...datos, tamano: zip.size } });

    try {
        let enviado = 0;
        alProgresar?.(0, zip.size);
        while (enviado < zip.size) {
            if (senal?.aborted) throw new DOMException("Subida cancelada", "AbortError");
            enviado = await enviarTrozo(id, enviado, zip.slice(enviado, enviado + trozo), senal);
            alProgresar?.(enviado, zip.size);
        }
        await pedir("finalizar", { metodo: "POST", id });
        return id;
    } catch (error) {
        borrarEstudio(id).catch(() => {});
        throw error;
    }
}

/** Manda un trozo y devuelve cuántos bytes tiene ya el servidor. */
async function enviarTrozo(id, desde, trozo, senal) {
    for (let intento = 1; ; intento++) {
        try {
            const res = await fetch(`${URL_API}?accion=trozo&id=${id}&offset=${desde}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/octet-stream" },
                body: trozo,
                signal: senal,
            });
            const datos = await res.json().catch(() => ({}));
            if (res.ok) return datos.recibido;
            // 409 = el servidor ya tenía otra cantidad (p. ej. llegó un trozo cuya
            // respuesta se perdió): se sigue desde donde dice él.
            if (res.status === 409 && Number.isFinite(datos.recibido)) return datos.recibido;
            // 400 con "recibido" = el trozo llegó cortado y el servidor lo descartó.
            const reintentable = res.status >= 500 || (res.status === 400 && Number.isFinite(datos.recibido));
            throw Object.assign(new Error(datos.error || `Error ${res.status}`), { reintentable });
        } catch (error) {
            if (error.name === "AbortError") throw error;
            const reintentable = error.reintentable || error instanceof TypeError;   // TypeError = fallo de red
            if (!reintentable || intento >= REINTENTOS) throw error;
            await esperar(1000 * intento);
        }
    }
}

/**
 * Descarga el zip de un estudio por tramos (Range).
 * @returns {Promise<ArrayBuffer>}
 */
export async function descargarEstudio(id, tamano, alProgresar) {
    const destino = new Uint8Array(tamano);
    let posicion = 0;
    alProgresar?.(0, tamano);

    while (posicion < tamano) {
        const fin = Math.min(posicion + TRAMO_DESCARGA, tamano) - 1;
        posicion = await descargarTramo(id, posicion, fin, destino, alProgresar);
    }
    return destino.buffer;
}

async function descargarTramo(id, inicio, fin, destino, alProgresar) {
    for (let intento = 1; ; intento++) {
        let posicion = inicio;
        try {
            const res = await fetch(`${URL_API}?accion=archivo&id=${id}`, {
                credentials: "include",
                headers: { Range: `bytes=${inicio}-${fin}` },
            });
            // 200 = el servidor ignoró el Range y manda el fichero entero: solo
            // vale si se estaba pidiendo desde el principio.
            const valido = res.status === 206 || (res.status === 200 && inicio === 0);
            if (!valido) {
                const datos = await res.json().catch(() => ({}));
                throw Object.assign(new Error(datos.error || `Error ${res.status} al descargar el estudio`), { reintentable: res.status >= 500 });
            }

            const lector = res.body.getReader();
            for (;;) {
                const { done, value } = await lector.read();
                if (done) break;
                if (posicion + value.length > destino.length) throw new Error("El estudio descargado no tiene el tamaño esperado.");
                destino.set(value, posicion);
                posicion += value.length;
                alProgresar?.(posicion, destino.length);
            }
            if (posicion <= fin) throw Object.assign(new Error("La descarga se cortó."), { reintentable: true });
            return posicion;
        } catch (error) {
            const reintentable = error.reintentable || error instanceof TypeError;
            if (!reintentable || intento >= REINTENTOS) throw error;
            await esperar(1000 * intento);
        }
    }
}
