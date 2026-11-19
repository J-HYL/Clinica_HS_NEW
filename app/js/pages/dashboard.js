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
  pintarIndicadores, indicadoresError,
  agendaCargando, pintarAgenda, agendaError,
  pintarRecientes, recientesError,
  pintarAvisoSolicitudes,
} from "../modules/components/Resumen.js";

const hoy = fechaISO(); // dia LOCAL (no UTC)
let diaAgenda = hoy;
let ultimaPeticionAgenda = 0;

const indicadores = document.getElementById("indicadores");
const agenda = document.getElementById("agenda");
const recientes = document.getElementById("recientes");
const avisoSolicitudes = document.getElementById("aviso-solicitudes");

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
    marcarContador("citas", datos.citas.pendientes);
  } catch (err) {
    const mensaje = mensajeError(err);
    indicadoresError(indicadores);
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
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && d.count) || 0)
    .catch(() => 0);
  const [citas, facturas] = await Promise.all([
    contar("/api/solicitudes.php?accion=count"),
    contar("/api/facturas_solicitudes.php?accion=count"),
  ]);
  pintarAvisoSolicitudes(avisoSolicitudes, { citas, facturas });
}

agenda.querySelector('[data-agenda="anterior"]').addEventListener("click", () => verDia(sumarDias(diaAgenda, -1)));
agenda.querySelector('[data-agenda="siguiente"]').addEventListener("click", () => verDia(sumarDias(diaAgenda, 1)));
agenda.querySelector('[data-agenda="hoy"]').addEventListener("click", () => verDia(hoy));
avisoSolicitudes.querySelector('[data-aviso="abrir"]').addEventListener("click", () => {
  window.dispatchEvent(new CustomEvent("hs:abrir-avisos"));
});

pintarCabecera();
agendaCargando(agenda, hoy, true);
cargarResumen();
cargarSolicitudes();
