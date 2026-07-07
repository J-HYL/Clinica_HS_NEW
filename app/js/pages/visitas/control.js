// Vista global de VISITAS: lista todas las visitas de la clínica (editar/borrar).
// El alta de visitas se hace desde la ficha de cada paciente.
import { mountVisitas } from "../../modules/components/Visitas.js";

document.addEventListener("DOMContentLoaded", () => {
  mountVisitas({ container: document.getElementById("visitas-section") });
});
