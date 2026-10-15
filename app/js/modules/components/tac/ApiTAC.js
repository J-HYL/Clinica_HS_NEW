// modules/components/tac/ApiTAC.js
// Llamadas a la API de estudios TAC. Va aparte de DB_API.js porque aquí se
// mueven ficheros de cientos de MB: se suben por trozos y se descargan por
// tramos, cada petición corta y con reintentos, para que un corte de red o el
// timeout del proxy no obliguen a empezar de cero.
//
// Dos endpoints con el MISMO protocolo de subida (iniciar/trozo/finalizar/borrar):
//   /api/tac.php          el panel (sesión de la clínica)
//   /api/tac_externo.php  el envío desde centros de radiología (enlace + contraseña)
// Por eso subirEstudio() recibe a qué endpoint hablar.

const URL_API = "/api/tac.php";
export const API_ENVIO = "/api/tac_externo.php";
const TRAMO_DESCARGA = 16 * 1024 * 1024;
const REINTENTOS = 3;

// La API exige esta cabecera en los POST: otra web no puede mandarla sin que
// el navegador pida permiso antes (CORS), así que no puede borrar ni subir nada.
const CABECERA_PROPIA = { "X-Requested-With": "XMLHttpRequest" };

function urlDe(api, accion, parametros = {}) {
    const consulta = new URLSearchParams({ accion });
    for (const [clave, valor] of Object.entries(parametros)) {
        if (valor !== undefined && valor !== null) consulta.set(clave, valor);
    }
    return `${api}?${consulta}`;
}

async function pedir(accion, { metodo = "GET", id, cuerpo, senal, api = URL_API, parametros } = {}) {
    const url = urlDe(api, accion, { id, ...parametros });
    const res = await fetch(url, {
        method: metodo,
        credentials: "include",
        headers: {
            ...(metodo === "POST" ? CABECERA_PROPIA : {}),
            ...(cuerpo ? { "Content-Type": "application/json" } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: senal,
    });
    const datos = await res.json().catch(() => ({}));
    // Ojo: db_connect.php corta con {error} y HTTP 200 si no hay BD para la clínica.
    // `estado` (código HTTP) deja distinguir p. ej. una sesión caducada (401).
    if (!res.ok || datos?.error) {
        throw Object.assign(new Error(datos?.error || `Error ${res.status} en el servidor`), { estado: res.status });
    }
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

/** Pasa el estudio a la ficha de un paciente (también para corregir uno mal asignado). */
export function asignarEstudio(id, clientId) {
    return pedir("asignar", { metodo: "POST", id, cuerpo: { client_id: clientId } });
}

/** Quita el aviso de "TAC nuevo" de la campana. */
export function marcarVisto(id) {
    return pedir("visto", { metodo: "POST", id });
}

/** Estudios llegados de fuera que aún no ha visto nadie: {count, estudios}. */
export function obtenerAvisos() {
    return pedir("avisos");
}

/** Enlace de envío para centros externos: {existe, token, tienePassword, actualizado...}. */
export function obtenerEnlace() {
    return pedir("enlace");
}

/** Crea o regenera el enlace y/o cambia su contraseña: {regenerar?, password?}. */
export function guardarEnlace(opciones) {
    return pedir("enlace_guardar", { metodo: "POST", cuerpo: opciones });
}

// --- página pública de envío ---------------------------------------------------

/** ¿Este enlace sigue valiendo? (la clínica puede haberlo regenerado). */
export async function comprobarEnlace(token) {
    const { valido } = await pedir("comprobar", { api: API_ENVIO, parametros: { k: token } });
    return valido;
}

/** Entra con la contraseña del enlace. Devuelve las sedes a las que se puede enviar. */
export async function entrarEnvio(token, password) {
    const { sedes } = await pedir("entrar", { api: API_ENVIO, metodo: "POST", cuerpo: { k: token, password } });
    return sedes;
}

/**
 * Sube un estudio ya analizado. Si algo falla o se cancela, borra lo que se
 * hubiera subido para no dejar restos en el servidor.
 * @param {Blob} zip - el zip a subir (el original o el preparado por el lector)
 * @param {Object} datos - sha256, metadatos del estudio y lo propio del endpoint (client_id, sede...)
 * @param {(subido:number, total:number) => void} alProgresar
 * @param {AbortSignal} senal - para cancelar
 * @param {string} [api] - endpoint: el del panel (por defecto) o API_ENVIO
 * @returns {Promise<number|string>} id del estudio
 */
export async function subirEstudio(zip, datos, alProgresar, senal, api = URL_API) {
    const { id, trozo } = await pedir("iniciar", { api, metodo: "POST", cuerpo: { ...datos, tamano: zip.size } });

    try {
        let enviado = 0;
        alProgresar?.(0, zip.size);
        while (enviado < zip.size) {
            if (senal?.aborted) throw new DOMException("Subida cancelada", "AbortError");
            enviado = await enviarTrozo(api, id, enviado, zip.slice(enviado, enviado + trozo), senal);
            alProgresar?.(enviado, zip.size);
        }
        await pedir("finalizar", { api, metodo: "POST", id, senal });
        return id;
    } catch (error) {
        pedir("borrar", { api, metodo: "POST", id }).catch(() => {});
        throw error;
    }
}

/** Manda un trozo y devuelve cuántos bytes tiene ya el servidor. */
async function enviarTrozo(api, id, desde, trozo, senal) {
    for (let intento = 1; ; intento++) {
        try {
            const res = await fetch(urlDe(api, "trozo", { id, offset: desde }), {
                method: "POST",
                credentials: "include",
                headers: { ...CABECERA_PROPIA, "Content-Type": "application/octet-stream" },
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
            throw Object.assign(new Error(datos.error || `Error ${res.status}`), { reintentable, estado: res.status });
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
            const res = await fetch(urlDe(URL_API, "archivo", { id }), {
                credentials: "include",
                headers: { Range: `bytes=${inicio}-${fin}` },
            });
            // 200 = el servidor ignoró el Range y manda el fichero entero: solo
            // vale si se estaba pidiendo desde el principio. Un JSON es un error
            // (p. ej. el 200 con {error} de db_connect.php), nunca el estudio.
            const esJson = (res.headers.get("Content-Type") || "").includes("application/json");
            const valido = !esJson && (res.status === 206 || (res.status === 200 && inicio === 0));
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
