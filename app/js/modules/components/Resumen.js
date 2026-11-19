// Resumen.js — Bloques de la pantalla principal (Resumen): indicadores, agenda
// del dia, pacientes recientes y aviso de solicitudes del portal.
//
// El HTML base de cada bloque esta en index.html (asi la pagina tiene su forma
// final antes de que lleguen los datos); estas funciones solo lo rellenan con
// lo que devuelve DB.getDashboard() (table=dashboard en DB.php), y cada bloque
// sabe pintar su propio error sin bloquear a los demas.
//
// Los textos que vienen de la BD pasan SIEMPRE por escapeHtml().

import { escapeHtml } from "../html.js";
import { euros, numero, hora, fechaCorta, fechaLarga, iniciales } from "../formato.js";

const GABINETES = { med1: "Gabinete 1", med2: "Gabinete 2" };
const ESTADOS = ["pendiente", "completada", "cancelada"]; // el color de la cita va por estado

const plural = (n, uno, varios) => `${numero(n)} ${n === 1 ? uno : varios}`;

// ================================================================ Indicadores

// Los cuatro de siempre del panel: citas de hoy, pendientes, clientes registrados
// y solicitudes del portal (esta ultima la pinta pintarSolicitudes, otra fuente).
export function pintarIndicadores(raiz, { pacientes, citas }) {
  ponerIndicador(raiz, "citas", numero(citas.hoy),
    !citas.hoy ? "No hay citas hoy"
      : citas.pendientes_hoy ? `<strong>${numero(citas.pendientes_hoy)}</strong> por atender` : "Todas atendidas");

  ponerIndicador(raiz, "pendientes", numero(citas.pendientes),
    citas.pendientes ? "Desde hoy en adelante" : "Ninguna pendiente");

  ponerIndicador(raiz, "clientes", numero(pacientes.total),
    pacientes.altas_mes ? `<strong>+${numero(pacientes.altas_mes)}</strong> altas este mes` : "Sin altas este mes");
}

/** Solicitudes del portal pendientes (de cita y de factura), con acceso a la campana. */
export function pintarSolicitudes(raiz, { citas, facturas }) {
  const total = citas + facturas;
  const detalle = [citas && `${numero(citas)} de cita`, facturas && `${numero(facturas)} de factura`]
    .filter(Boolean).join(" · ");
  ponerIndicador(raiz, "solicitudes", numero(total), total
    ? `${detalle} · <button type="button" class="enlace kpi__accion" data-abrir-avisos>Revisar</button>`
    : "Ninguna pendiente");
}

export function indicadoresError(raiz, claves) {
  claves.forEach((clave) => ponerIndicador(raiz, clave, "—", "No disponible"));
}

// pie: HTML construido aqui solo con cifras y textos fijos (nada de la BD).
function ponerIndicador(raiz, clave, valor, pie) {
  const kpi = raiz.querySelector(`[data-kpi="${clave}"]`);
  if (!kpi) return;
  kpi.querySelector("[data-valor]").textContent = valor;
  kpi.querySelector("[data-pie]").innerHTML = pie;
  kpi.removeAttribute("aria-busy");
}

// ================================================================ Agenda del dia

/** Cabecera de la agenda (fecha, "volver a hoy", enlace al dia) y lista en "cargando". */
export function agendaCargando(raiz, fecha, esHoy) {
  raiz.querySelector('[data-agenda="fecha"]').textContent = fechaLarga(fecha);
  raiz.querySelector('[data-agenda="hoy"]').hidden = esHoy;
  raiz.querySelector('[data-agenda="ver-dia"]').href = `/pages/citas/vista_diaria.html?date=${fecha}`;
  raiz.querySelector('[data-agenda="resumen"]').textContent = "Cargando…";
  const lista = raiz.querySelector('[data-agenda="lista"]');
  lista.setAttribute("aria-busy", "true");
}

export function pintarAgenda(raiz, fecha, citas, esHoy) {
  agendaCargando(raiz, fecha, esHoy);
  const lista = raiz.querySelector('[data-agenda="lista"]');
  const reales = citas.filter((c) => !c.bloqueo);
  const pendientes = reales.filter((c) => (c.estado || "Pendiente").toLowerCase() === "pendiente").length;

  raiz.querySelector('[data-agenda="resumen"]').textContent = reales.length
    ? `${plural(reales.length, "cita", "citas")} · ${plural(pendientes, "pendiente", "pendientes")}`
    : "Sin citas";
  lista.removeAttribute("aria-busy");

  lista.innerHTML = citas.length
    ? citas.map((c) => filaCita(c, fecha)).join("")
    : `<li class="estado-vacio"><i class="ri-calendar-line" aria-hidden="true"></i>No hay citas ${esHoy ? "hoy" : "este día"}</li>`;
}

export function agendaError(raiz, mensajeHtml) {
  raiz.querySelector('[data-agenda="resumen"]').textContent = "";
  const lista = raiz.querySelector('[data-agenda="lista"]');
  lista.removeAttribute("aria-busy");
  lista.innerHTML = `<li class="estado-error"><i class="ri-error-warning-line" aria-hidden="true"></i>${mensajeHtml}</li>`;
}

// OJO (inconsistencia del proyecto): en appointments `servicio` guarda el NOMBRE
// DEL PACIENTE y `cliente` las OBSERVACIONES (o el fin, si es un bloqueo).
function filaCita(c, fecha) {
  const gabinete = GABINETES[c.medico];
  let estado, etiqueta, titulo, detalle;

  if (c.bloqueo) {
    const fin = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(c.cliente || "") ? hora(c.cliente) : "";
    estado = "bloqueado";
    etiqueta = "Bloqueo";
    titulo = "Horario bloqueado";
    detalle = [fin && `Hasta las ${fin}`, gabinete].filter(Boolean).join(" · ");
  } else {
    const texto = c.estado || "Pendiente";
    estado = ESTADOS.includes(texto.toLowerCase()) ? texto.toLowerCase() : "otro";
    etiqueta = escapeHtml(texto);
    titulo = escapeHtml((c.servicio || "").trim() || "Sin nombre");
    detalle = [(c.cliente || "").trim(), gabinete].filter(Boolean).map(escapeHtml).join(" · ");
  }

  return `
    <li class="agenda__fila">
      <time class="agenda__hora" datetime="${escapeHtml(c.fecha)}">${hora(c.fecha)}</time>
      <a class="agenda__cita" data-estado="${estado}" href="/pages/citas/vista_diaria.html?date=${fecha}">
        <span class="agenda__texto">
          <span class="agenda__paciente">${titulo}</span>
          ${detalle ? `<span class="agenda__detalle">${detalle}</span>` : ""}
        </span>
        <span class="pastilla" data-estado="${estado}">${etiqueta}</span>
      </a>
    </li>`;
}

// ================================================================ Pacientes recientes

export function pintarRecientes(raiz, pacientes) {
  const lista = raiz.querySelector('[data-recientes="lista"]');
  lista.removeAttribute("aria-busy");
  if (!pacientes.length) {
    lista.innerHTML = `<li class="estado-vacio"><i class="ri-user-line" aria-hidden="true"></i>Aún no hay pacientes</li>`;
    return;
  }
  lista.innerHTML = pacientes.map((p) => {
    // Fechas 'AAAA-MM-DD HH:MM:SS': se comparan bien como texto.
    const porVisita = p.ultima_visita && (!p.alta || p.ultima_visita >= p.alta);
    const detalle = porVisita ? `Última visita · ${fechaCorta(p.ultima_visita)}`
      : p.alta ? `Alta · ${fechaCorta(p.alta)}` : "Sin actividad";
    const conDeuda = p.deuda > 0;
    return `
      <li>
        <a class="recientes__fila" href="/pages/clientes/historia-clinica.html?id=${encodeURIComponent(p.id)}">
          <span class="iniciales" aria-hidden="true">${escapeHtml(iniciales(p.nombre))}</span>
          <span class="recientes__texto">
            <span class="recientes__nombre">${escapeHtml(p.nombre)}</span>
            <span class="recientes__detalle">${detalle}</span>
          </span>
          <span class="recientes__saldo${conDeuda ? " recientes__saldo--pendiente" : ""}">
            <span class="solo-lector">${conDeuda ? "Debe" : "Saldo"} </span>${euros(p.deuda)}
          </span>
        </a>
      </li>`;
  }).join("");
}

export function recientesError(raiz, mensajeHtml) {
  const lista = raiz.querySelector('[data-recientes="lista"]');
  lista.removeAttribute("aria-busy");
  lista.innerHTML = `<li class="estado-error"><i class="ri-error-warning-line" aria-hidden="true"></i>${mensajeHtml}</li>`;
}
