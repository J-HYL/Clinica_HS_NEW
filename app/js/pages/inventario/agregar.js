import { getFormData, getURLId, goToControlPage, validateForm, validateInput } from "../../modules/funciones.js";
import { form, formHeading, formSubmit } from "../../modules/selectores.js";
import { initFotoCaptura } from "../../modules/components/FotoCaptura.js";
import { CATEGORIAS, ESTADOS, UNIDADES, rellenarSelect } from "../../modules/components/inventario.js";
import { generarCodigoPropio, imprimirEtiqueta, pintarQR } from "../../modules/components/CodigoQR.js";
import { abrirEscaner } from "../../modules/components/Escaner.js";
import { abrirComoFunciona } from "../../modules/components/ComoFunciona.js";
import { GUIA_FORMULARIO } from "../../modules/components/guiaInventario.js";
import Alert from "../../modules/components/Alert.js";
import DB from "../../modules/classes/DB_API.js";

//* Selectores Específicos
const nombreInput = document.querySelector("#nombre");
const stockInput = document.querySelector("#stock");
const stockMinimoInput = document.querySelector("#stock_minimo");
const categoriaInput = document.querySelector("#categoria");
const unidadInput = document.querySelector("#unidad");
const estadoInput = document.querySelector("#estado");
const ubicacionInput = document.querySelector("#ubicacion");

const codigoInput = document.querySelector("#codigo");
const codigoQR = document.querySelector("#codigo-qr");
const botonImprimir = document.querySelector("#codigo-imprimir");

const foto = initFotoCaptura(document.querySelector("#foto"));

//* Eventos
document.addEventListener("DOMContentLoaded", iniciar);
form.addEventListener("submit", guardarElemento);
nombreInput.addEventListener("blur", validateInput);
stockInput.addEventListener("blur", validateInput);
stockMinimoInput.addEventListener("blur", validateInput);

document.querySelector("#como-funciona").addEventListener("click", () => abrirComoFunciona(GUIA_FORMULARIO));

codigoInput.addEventListener("input", refrescarQR);
document.querySelector("#codigo-escanear").addEventListener("click", escanearCodigo);
document.querySelector("#codigo-generar").addEventListener("click", () => {
    codigoInput.value = generarCodigoPropio();
    refrescarQR();
});
botonImprimir.addEventListener("click", imprimirCodigo);

async function iniciar() {
    rellenarSelect(categoriaInput, CATEGORIAS);
    rellenarSelect(unidadInput, UNIDADES);
    rellenarSelect(estadoInput, ESTADOS);

    const id = getURLId();
    if (id) await prepararModoEdicion(id);
}

//* Código escaneable

// Escanear el código de fábrica es más fiable que teclear un EAN de 13 dígitos.
async function escanearCodigo() {
    const codigo = await abrirEscaner();
    if (!codigo) return;
    codigoInput.value = codigo;
    refrescarQR();
}

// El QR se pinta para cualquier código, no solo para los generados aquí: así se
// puede pegar una etiqueta legible también a un producto cuyo código de barras
// esté impreso en un sitio incómodo de escanear.
function refrescarQR() {
    const codigo = codigoInput.value.trim();
    const hayCodigo = codigo !== "";

    codigoQR.hidden = !hayCodigo;
    botonImprimir.hidden = !hayCodigo;
    if (!hayCodigo) return;

    try {
        pintarQR(codigoQR, codigo);
    } catch {
        // Sin la librería de QR (CDN caído) el código sigue siendo válido:
        // solo se queda sin vista previa ni etiqueta.
        codigoQR.hidden = true;
        botonImprimir.hidden = true;
    }
}

function imprimirCodigo() {
    try {
        imprimirEtiqueta({
            codigo: codigoInput.value.trim(),
            nombre: nombreInput.value.trim() || "Elemento sin nombre",
            ubicacion: ubicacionInput.value.trim()
        });
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message);
    }
}

// No se usa UI.showFormEditMode porque aquí hace falta, con una sola lectura,
// rellenar el formulario Y pintar la foto que ya tenga el elemento.
async function prepararModoEdicion(id) {
    formHeading.textContent = "Editar Elemento";
    formSubmit.innerHTML = 'Guardar Cambios <i class="ri-pencil-fill"></i>';
    formSubmit.dataset.action = "edit";

    try {
        const elemento = await DB.getRecord("inventario", id);
        // Por [name] y no por los selectores comunes: así entra también el
        // textarea de notas, y el input de la foto (sin name) queda fuera.
        form.querySelectorAll("[name]").forEach(campo => {
            const valor = elemento[campo.name];
            if (valor !== undefined && valor !== null) campo.value = valor;
        });
        foto.mostrarFotoExistente(elemento.foto);
        refrescarQR();
    } catch (error) {
        Alert.showStatusAlert("error", "¡Error!", error.message, goToControlPage);
    }
}

async function guardarElemento(e) {
    e.preventDefault();

    if (!validateForm()) {
        Alert.showStatusAlert("error", "¡Error!", "Por favor, corrige los errores antes de enviar el formulario.");
        return;
    }

    const id = getURLId();
    const payload = getFormData();
    formSubmit.disabled = true;

    try {
        // La foto se sube aparte (multipart) y necesita el id, así que el
        // elemento se guarda primero y la foto justo después.
        let elementoId = id;
        if (id) {
            await DB.editRecord("inventario", id, payload);
        } else {
            elementoId = (await DB.addRegister("inventario", payload)).id;
        }

        await sincronizarFoto(elementoId);

        Alert.showStatusAlert(
            "success",
            id ? "¡Elemento actualizado!" : "¡Elemento creado!",
            `"${payload.nombre}" se guardó correctamente.`,
            goToControlPage
        );
    } catch (error) {
        formSubmit.disabled = false;
        Alert.showStatusAlert("error", "Error al guardar", error.message);
    }
}

/** Sube la foto nueva, o borra la existente si se pidió quitarla. */
async function sincronizarFoto(elementoId) {
    const blob = foto.getBlob();

    if (blob) {
        const datos = new FormData();
        datos.append("inventario_id", elementoId);
        datos.append("file", blob, "foto.jpg");
        await DB.uploadFile("inventario_foto", datos);
        return;
    }

    if (foto.sePidioQuitar()) await DB.deleteRecord("inventario_foto", elementoId);
}
