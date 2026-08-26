// app/js/pages/clientes/dar-cita.js
// Botón "Dar cita" en la ficha del paciente. Abre el calendario (con las citas
// existentes) para elegir hueco; crea una cita enlazada al paciente (client_id),
// que aparece en SU portal, y le avisa por notificación + email.
// Llama a /api/solicitudes.php?accion=dar-cita.
import { elegirFechaHora } from "../../modules/components/SelectorCita.js";

const id = new URLSearchParams(location.search).get("id");
const btn = document.getElementById("dar-cita");

if (btn && id) {
  btn.addEventListener("click", async () => {
    const nombre = (document.getElementById("nombre-paciente")?.textContent || "el paciente").trim();
    const value = await elegirFechaHora({
      titulo: "Programar cita a " + nombre,
      campos: [
        { id: "medico", label: "Gabinete", type: "select", options: [{ v: "med1", t: "Gabinete 1" }, { v: "med2", t: "Gabinete 2" }] },
        { id: "motivo", label: "Motivo (opcional)", type: "text", placeholder: "Revisión, limpieza…" },
      ],
    });
    if (!value) return;

    Swal.fire({ title: "Creando cita…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const res = await fetch("/api/solicitudes.php?accion=dar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ client_id: Number(id), fecha: value.fecha, medico: value.medico, motivo: value.motivo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || "No se pudo crear la cita.");
      Swal.fire({ icon: "success", title: "Cita creada", text: data.message || "", timer: 2000, showConfirmButton: false });
    } catch (e) {
      Swal.fire("Error", e.message, "error");
    }
  });
}
