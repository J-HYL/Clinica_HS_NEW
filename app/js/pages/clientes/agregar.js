// agregar.js
import {
  configureActionForm,
  sendForm,
  validateInput,
} from "../../modules/funciones.js";
import { form } from "../../modules/selectores.js";

// 1) Si hay ?id=..., carga datos y cambia a modo "edit"
document.addEventListener("DOMContentLoaded", () => {
  configureActionForm("clients");
  const inputFecha = document.getElementById("fecha");
  if (inputFecha) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
    inputFecha.value = formatted;
    
    console.log("Fecha asignada:", formatted);
  }
});

// 2) Campos para validar al perder foco
const nameInput  = document.querySelector("#nombre");
const emailInput = document.querySelector("#email");
const phoneInput = document.querySelector("#telefono");

//nuevas dos variables
const ageInput = document.querySelector('#edad');
const alergiasInput = document.querySelector('#alergias');

nameInput.addEventListener("blur",  validateInput);
emailInput.addEventListener("blur", validateInput);
phoneInput.addEventListener("blur", validateInput);

// 3) SOLO UN addEventListener para submit
form.addEventListener("submit", e => {
  e.preventDefault();
  // Llamar a sendForm normalmente
  sendForm(e, "clients");
});