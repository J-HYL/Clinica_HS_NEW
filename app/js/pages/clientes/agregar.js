// agregar.js — Ficha de alta/edicion de un paciente.
import {
  configureActionForm,
  sendForm,
  validateInput,
} from "../../modules/funciones.js";
import { form } from "../../modules/selectores.js";

// Si hay ?id=..., carga los datos y pasa a modo edicion.
document.addEventListener("DOMContentLoaded", () => configureActionForm("clients", "Editar paciente"));

// Campos que se validan al perder el foco
["#nombre", "#email", "#telefono"].forEach(selector =>
  document.querySelector(selector).addEventListener("blur", validateInput)
);

form.addEventListener("submit", e => sendForm(e, "clients"));
