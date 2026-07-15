import { getFormData, getURLId, goToControlPage, validateForm, validateInput } from "../../modules/funciones.js";
import { form, formHeading, formSubmit } from "../../modules/selectores.js";
import { initFotoCaptura } from "../../modules/components/FotoCaptura.js";
import { CATEGORIAS, ESTADOS, UNIDADES, rellenarSelect } from "../../modules/components/inventario.js";
import Alert from "../../modules/components/Alert.js";
import DB from "../../modules/classes/DB_API.js";

//* Selectores Específicos
const nombreInput = document.querySelector("#nombre");
const stockInput = document.querySelector("#stock");
const stockMinimoInput = document.querySelector("#stock_minimo");
const categoriaInput = document.querySelector("#categoria");
const unidadInput = document.querySelector("#unidad");
const estadoInput = document.querySelector("#estado");

const foto = initFotoCaptura(document.querySelector("#foto"));

//* Eventos
document.addEventListener("DOMContentLoaded", iniciar);
form.addEventListener("submit", guardarElemento);
nombreInput.addEventListener("blur", validateInput);
stockInput.addEventListener("blur", validateInput);
stockMinimoInput.addEventListener("blur", validateInput);

async function iniciar() {
    rellenarSelect(categoriaInput, CATEGORIAS);
    rellenarSelect(unidadInput, UNIDADES);
    rellenarSelect(estadoInput, ESTADOS);

    const id = getURLId();
    if (id) await prepararModoEdicion(id);
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
