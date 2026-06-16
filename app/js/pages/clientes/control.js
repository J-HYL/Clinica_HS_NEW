//control pacientes
import {
  setTableEventsListeners,
  showRecords
} from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";

// Carga y muestra la tabla de clientes
document.addEventListener("DOMContentLoaded", () => showRecords("clients"));

// Delegación de eventos para editar/eliminar
table.addEventListener("click", e =>
  setTableEventsListeners(e, "clients")
);