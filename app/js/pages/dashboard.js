// dashboard.js — Pantalla principal (Resumen).
//
// Una sola peticion (DB.getDashboard) trae indicadores, agenda de hoy y
// pacientes recientes, calculados en el servidor sobre la BD de la sede de la
// sesion: la misma pantalla sirve a las dos clinicas. Cada bloque pinta su
// propio error; nada se queda bloqueado si una peticion falla.

import DB from "../modules/classes/DB_API.js";
import { escapeHtml } from "../modules/html.js";
import { fechaISO, fechaLarga, sumarDias } from "../modules/formato.js";
import { marcarContador, obtenerSede } from "../modules/components/AppShell.js";
import {
  pintarIndicadores, pintarSolicitudes, indicadoresError,
  agendaCargando, pintarAgenda, agendaError,
  pintarRecientes, recientesError,
} from "../modules/components/Resumen.js";

const hoy = fechaISO(); // dia LOCAL (no UTC)
let diaAgenda = hoy;
let ultimaPeticionAgenda = 0;

const indicadores = document.getElementById("indicadores");
const agenda = document.getElementById("agenda");
const recientes = document.getElementById("recientes");

function mensajeError(err) {
  if (err.status === 401) {
    return 'Tu sesión ha caducado. <a class="enlace" href="/">Vuelve a entrar</a>';
  }
  return escapeHtml(err.message || "No se pudieron cargar los datos.");
}

function pintarCabecera() {
  const h = new Date().getHours();
  document.querySelector('[data-resumen="saludo"]').textContent =
    h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
  document.querySelector('[data-resumen="fecha"]').textContent = fechaLarga(hoy);
  obtenerSede().then((sede) => {
    if (sede) {
      document.querySelector('[data-resumen="intro"]').textContent =
        `Este es el resumen de HS Dental ${sede.ciudad} para hoy.`;
    }
  });
}

async function cargarResumen() {
  try {
    const datos = await DB.getDashboard(hoy);
    pintarIndicadores(indicadores, datos);
    pintarAgenda(agenda, datos.fecha, datos.agenda, true);
    pintarRecientes(recientes, datos.recientes);
    marcarContador("citas", datos.citas.pendientes_hoy);
  } catch (err) {
    const mensaje = mensajeError(err);
    indicadoresError(indicadores, ["citas", "pendientes", "clientes"]);
    agendaError(agenda, mensaje);
    recientesError(recientes, mensaje);
  }
}

/** Pasar de dia en la agenda: solo se piden las citas de ese dia. */
async function verDia(fecha) {
  diaAgenda = fecha;
  const peticion = ++ultimaPeticionAgenda;
  agendaCargando(agenda, fecha, fecha === hoy);
  try {
    const { agenda: citas } = await DB.getDashboard(fecha, { soloAgenda: true });
    if (peticion === ultimaPeticionAgenda) pintarAgenda(agenda, fecha, citas, fecha === hoy);
  } catch (err) {
    if (peticion === ultimaPeticionAgenda) agendaError(agenda, mensajeError(err));
  }
}

/** Solicitudes del portal pendientes (mismas fuentes que la campana de avisos). */
async function cargarSolicitudes() {
  const contar = (url) => fetch(url, { credentials: "include" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d) => (d && d.count) || 0);
  try {
    const [citas, facturas] = await Promise.all([
      contar("/api/solicitudes.php?accion=count"),
      contar("/api/facturas_solicitudes.php?accion=count"),
    ]);
    pintarSolicitudes(indicadores, { citas, facturas });
  } catch {
    indicadoresError(indicadores, ["solicitudes"]);
  }
}

agenda.querySelector('[data-agenda="anterior"]').addEventListener("click", () => verDia(sumarDias(diaAgenda, -1)));
agenda.querySelector('[data-agenda="siguiente"]').addEventListener("click", () => verDia(sumarDias(diaAgenda, 1)));
agenda.querySelector('[data-agenda="hoy"]').addEventListener("click", () => verDia(hoy));
// "Revisar" en el indicador de solicitudes: abre la campana de avisos.
indicadores.addEventListener("click", (e) => {
  if (e.target.closest("[data-abrir-avisos]")) window.dispatchEvent(new CustomEvent("hs:abrir-avisos"));
});

pintarCabecera();
agendaCargando(agenda, hoy, true);
cargarResumen();
cargarSolicitudes();
