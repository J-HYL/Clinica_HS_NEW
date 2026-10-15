import { comprobarEnlace, entrarEnvio, subirEstudio, API_ENVIO } from "../../modules/components/tac/ApiTAC.js";
import { crearSelectorEstudio } from "../../modules/components/tac/SelectorEstudio.js";
import { formatearBytes, mismoPaciente } from "../../modules/components/tac/utilidades.js";
import { escapeHtml } from "../../modules/html.js";

// Página pública para que los centros de radiología envíen un TAC a la clínica:
// enlace (?k=) + contraseña -> elegir clínica, nombre del paciente y la carpeta
// del estudio -> se lee en el navegador y se sube por trozos a tac_externo.php.

const token = new URLSearchParams(location.search).get("k") || "";
const CLAVE_CENTRO = "hsdental_tac_centro";   // comodidad: el centro no lo reescribe cada vez

//* Selectores Específicos
const formEntrar = document.querySelector("#form-entrar");
const formEnviar = document.querySelector("#form-enviar");
const sedes = document.querySelector("#sedes");
const paciente = document.querySelector("#paciente");
const centro = document.querySelector("#centro");
const notas = document.querySelector("#notas");
const confirmar = document.querySelector("#confirmar");
const botonEnviar = document.querySelector("#enviar");
const botonCancelar = document.querySelector("#cancelar");

let selector = null;
let controlador = null;   // subida en marcha

//* Eventos
document.addEventListener("DOMContentLoaded", async () => {
    try {
        mostrarPaso(token && await comprobarEnlace(token) ? "entrar" : "invalido");
        document.querySelector("#password").focus();
    } catch {
        mostrarPaso("invalido");
    }
});

formEntrar.addEventListener("submit", entrar);
formEnviar.addEventListener("submit", enviar);
formEnviar.addEventListener("input", actualizarEstado);
botonCancelar.addEventListener("click", () => controlador?.abort());
document.querySelector("#otro").addEventListener("click", empezarOtro);
// Cerrar la pestaña a media subida la perdería: el navegador pregunta antes.
window.addEventListener("beforeunload", (e) => { if (controlador) e.preventDefault(); });

function mostrarPaso(nombre) {
    document.querySelectorAll("[data-paso]").forEach(seccion => { seccion.hidden = seccion.dataset.paso !== nombre; });
}

function mostrarError(caja, mensaje) {
    const elemento = document.querySelector(caja);
    elemento.textContent = mensaje ?? "";
    elemento.hidden = !mensaje;
}

//* Entrar

async function entrar(e) {
    e.preventDefault();
    const boton = formEntrar.querySelector("button");
    boton.disabled = true;
    mostrarError("#error-entrar", null);
    try {
        const disponibles = await entrarEnvio(token, document.querySelector("#password").value);
        pintarSedes(disponibles);
        prepararEnvio();
        mostrarPaso("enviar");
    } catch (error) {
        mostrarError("#error-entrar", error.message);
    } finally {
        boton.disabled = false;
    }
}

function pintarSedes(lista) {
    sedes.innerHTML = lista.map(sede => `
        <label class="tac-sede">
            <input type="radio" name="sede" value="${escapeHtml(sede.id)}" ${lista.length === 1 ? "checked" : ""}>
            <i class="ri-hospital-line"></i>
            <span>HS Dental ${escapeHtml(sede.nombre)}</span>
        </label>`).join("");
}

function prepararEnvio() {
    if (!selector) {
        selector = crearSelectorEstudio(document.querySelector("#selector"), {
            alCambiar: (fase) => {
                // Si aún no han escrito el nombre, se propone el que trae el estudio.
                if (fase === "listo" && !paciente.value.trim()) paciente.value = nombrePropio(selector.analisis.paciente.nombre);
                actualizarEstado();
            },
        });
    }
    try { centro.value ||= localStorage.getItem(CLAVE_CENTRO) || ""; } catch { /* sin almacenamiento: da igual */ }
    actualizarEstado();
}

/** "GARCIA LOPEZ MARIA" -> "Garcia Lopez Maria". */
function nombrePropio(nombre) {
    return (nombre || "").toLowerCase().replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

//* Formulario

function sedeElegida() {
    return Number(formEnviar.querySelector("input[name=sede]:checked")?.value) || null;
}

/** Comprueba el nombre escrito contra el del DICOM y habilita (o no) el envío. */
function actualizarEstado() {
    const analisis = selector?.analisis;
    const nombre = paciente.value.trim();
    const requiereConfirmar = !!(analisis && nombre) && mismoPaciente(analisis.paciente.nombre, nombre) === false;

    if (confirmar.hidden === requiereConfirmar) confirmar.querySelector("input").checked = false;
    confirmar.hidden = !requiereConfirmar;
    confirmar.querySelector("strong").textContent = analisis?.paciente.nombre ?? "";

    botonEnviar.disabled = !!controlador || !sedeElegida() || nombre.length < 3 || !analisis
        || (requiereConfirmar && !confirmar.querySelector("input").checked);
}

function bloquear(si) {
    selector.bloquear(si);
    formEnviar.querySelectorAll("input, textarea").forEach(campo => { campo.disabled = si; });
    botonCancelar.hidden = !si;
    actualizarEstado();
}

async function enviar(e) {
    e.preventDefault();
    if (botonEnviar.disabled) return;
    const { geometria, estudio, sha256 } = selector.analisis;
    mostrarError("#error-enviar", null);
    controlador = new AbortController();
    bloquear(true);

    try {
        await subirEstudio(selector.zipParaSubir(), {
            sede: sedeElegida(),
            paciente_nombre: paciente.value.trim(),
            centro: centro.value.trim(),
            notas: notas.value.trim(),
            sha256,
            descripcion: estudio.descripcion,
            fecha_estudio: estudio.fecha,
            equipo: estudio.equipo,
            cortes: geometria.cortes,
            ancho: geometria.ancho,
            alto: geometria.alto,
            voxel_x: geometria.voxel[0],
            voxel_y: geometria.voxel[1],
            voxel_z: geometria.voxel[2],
        }, (subido, total) => {
            selector.progreso(`Enviando… ${Math.floor((subido / total) * 100)} % (${formatearBytes(subido)} de ${formatearBytes(total)})`, subido / total);
        }, controlador.signal, API_ENVIO);

        try { localStorage.setItem(CLAVE_CENTRO, centro.value.trim()); } catch { /* sin almacenamiento: da igual */ }
        controlador = null;
        mostrarPaso("hecho");
    } catch (error) {
        controlador = null;
        selector.ocultarProgreso();
        if (error.estado === 401) {
            // Sesión caducada o enlace regenerado: hay que volver a poner la contraseña.
            mostrarPaso("entrar");
            mostrarError("#error-entrar", error.message);
        } else if (error.name !== "AbortError") {
            mostrarError("#error-enviar", `No se pudo enviar el estudio: ${error.message}`);
        }
    } finally {
        bloquear(false);
    }
}

/** Otro estudio: se conservan la clínica y el centro; lo del paciente se vacía. */
function empezarOtro() {
    paciente.value = "";
    notas.value = "";
    selector.reiniciar();
    mostrarError("#error-enviar", null);
    mostrarPaso("enviar");
    actualizarEstado();
}
