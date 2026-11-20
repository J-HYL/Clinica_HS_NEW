// agregar.js — Ficha de alta/edicion de un servicio.
import { configureActionForm, sendForm, validateInput } from "../../modules/funciones.js";
import { form } from "../../modules/selectores.js";

// Si hay ?id=..., carga los datos y pasa a modo edicion.
document.addEventListener("DOMContentLoaded", () => configureActionForm("services", "Editar servicio"));

// Campos que se validan al perder el foco
["#nombre", "#descripcion", "#precio"].forEach(selector =>
  document.querySelector(selector).addEventListener("blur", validateInput)
);

form.addEventListener("submit", e => sendForm(e, "services"));
