// ficha.js — Fichas de alta/edicion (pacientes, servicios, inventario).
// El titulo de la ficha es el h1 con .container__heading (formHeading) y el
// boton de guardar el .form__submit (formSubmit), los mismos ganchos que usa
// UI.showFormEditMode.
import { formHeading, formSubmit } from "./selectores.js";

/** Pone la ficha en modo edicion con su propio titulo y "Guardar cambios". */
export function rotularEdicion(titulo) {
  formHeading.textContent = titulo;
  document.title = `${titulo} · HS Dental`;
  formSubmit.innerHTML = '<i class="ri-check-line" aria-hidden="true"></i> Guardar cambios';
  formSubmit.dataset.action = "edit";
}
