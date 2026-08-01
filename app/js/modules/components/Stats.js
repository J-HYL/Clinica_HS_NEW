// src/modules/components/Stats.js
import { reloadPage } from "../funciones.js";
import Alert from "./Alert.js";
import UI from "../classes/UI.js";
import DB from "../classes/DB_API.js";
import { renderGreeting, renderTodayAgenda, renderTreatmentsDonut } from "./DashboardPanels.js";

// Helper: devuelve 'YYYY-MM-DD' de hoy
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadStats() {
  // Saludo: se pinta de inmediato, no depende de la red.
  renderGreeting();
  // Contador de solicitudes de portal (independiente del resto de stats).
  cargarSolicitudesPortal();

  try {
    // 1) Traer todos los registros
    const [appointments, clients, services, treatments] = await Promise.all([
      DB.getRecords("appointments"),
      DB.getRecords("clients"),
      DB.getRecords("services"),
      DB.getRecords("treatments"),
    ]);

    const todayStr = getTodayString();

    // 2) Contar citas de hoy
    const citasHoy = appointments.filter(app => app.fecha.slice(0, 10) === todayStr).length;

    // 3) Contar citas pendientes
    const citasPendientes = appointments.filter(app => app.estado === "Pendiente").length;

    // 4) Totales de clientes y servicios
    const clientesCount = clients.length;
    const serviciosCount = services.length;

    // 5) Mostrar estadísticas en la UI
    UI.showStats({
      today:    citasHoy,
      pending:  citasPendientes,
      clients:  clientesCount,
      services: serviciosCount
    });

    // 6) Paneles: agenda de hoy y donut de tratamientos
    renderTodayAgenda(appointments);
    renderTreatmentsDonut(treatments);

  } catch (err) {
    Alert.showStatusAlert("error", "¡Error!", err.message, reloadPage);
  }
}

/** Solicitudes de portal pendientes = solicitudes de cita + de factura (mismas
 *  fuentes que la campana). Best-effort: si falla, deja el contador en blanco. */
async function cargarSolicitudesPortal() {
  const el = document.getElementById("solicitudes-portal");
  if (el) el.innerHTML = "<strong>0</strong>"; // por defecto: nunca en blanco
  try {
    const [citas, facturas] = await Promise.all([
      fetch("/api/solicitudes.php?accion=count", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/facturas_solicitudes.php?accion=count", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    const total = (citas?.count || 0) + (facturas?.count || 0);
    if (el) el.innerHTML = `<strong>${total}</strong>`;
  } catch (e) { /* silencio: el contador no es crítico */ }
}