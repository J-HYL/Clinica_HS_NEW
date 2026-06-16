// src/modules/components/Stats.js
import { reloadPage } from "../funciones.js";
import Alert from "./Alert.js";
import UI from "../classes/UI.js";
import DB from "../classes/DB_API.js";

// Helper: devuelve 'YYYY-MM-DD' de hoy
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

export async function loadStats() {
  try {
    // 1) Traer todos los registros
    const [appointments, clients, services] = await Promise.all([
      DB.getRecords("appointments"),
      DB.getRecords("clients"),
      DB.getRecords("services"),
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

  } catch (err) {
    Alert.showStatusAlert("error", "¡Error!", err.message, reloadPage);
  }
}