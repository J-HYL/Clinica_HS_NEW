// tablas.js — Columnas y acciones de la tabla de cada entidad del panel
// (pacientes, citas, servicios, tratamientos, pagos y facturas). Todas se pintan
// con el componente unico Tabla.js; aqui solo se dice QUE se ve en cada una.
//
// Antes (Datatables.js) las columnas salian de las claves del primer registro y
// la entidad se adivinaba por el nombre del HTML (renombrar la pagina rompia la
// tabla). Ahora cada entidad declara sus columnas y la pagina dice cual es.
//
// Los botones de accion llevan la clase table__btn--<accion>: es el gancho que
// usa setTableEventsListeners() (funciones.js) para saber que hacer.

import Tabla from "./components/Tabla.js";
import { escapeHtml } from "./html.js";

const GABINETES = { med1: "Gabinete 1", med2: "Gabinete 2" };
const ESTADOS_CITA = ["pendiente", "completada", "cancelada"]; // con color propio (ui.css)

/** Boton de icono para la columna de acciones. */
export function botonAccion(accion, id, icono, etiqueta, { tono } = {}) {
  return `<button type="button" class="boton boton--icono boton--fantasma table__btn table__btn--${accion}"
    data-id="${escapeHtml(id)}" aria-label="${escapeHtml(etiqueta)}" title="${escapeHtml(etiqueta)}"${tono ? ` data-tono="${tono}"` : ""}>
    <i class="${icono}" aria-hidden="true"></i></button>`;
}

/** Enlace con aspecto de boton de icono (descargas). */
function enlaceAccion(href, icono, etiqueta) {
  return `<a class="boton boton--icono boton--fantasma" href="${escapeHtml(href)}" target="_blank" rel="noopener"
    aria-label="${escapeHtml(etiqueta)}" title="${escapeHtml(etiqueta)}"><i class="${icono}" aria-hidden="true"></i></a>`;
}

const borrar = (id) => botonAccion("delete", id, "ri-delete-bin-line", "Eliminar", { tono: "peligro" });

// ---------------------------------------------------------------- piezas comunes

const FACTURA = { generada: ["Emitida", "exito"], solicitada: ["Solicitada", "aviso"] };

const columnaFactura = {
  clave: "factura_estado",
  titulo: "Factura",
  texto: (f) => FACTURA[f.factura_estado]?.[0] ?? "",
  celda: (f) => {
    const [texto, tono] = FACTURA[f.factura_estado] ?? [];
    return texto ? `<span class="pastilla" data-tono="${tono}">${texto}</span>` : '<span class="tabla__nada">—</span>';
  },
};

// Si la factura de ese pago YA esta emitida -> descargarla; si no -> generarla.
function accionesPago(f) {
  const factura = f.factura_estado === "generada" && f.factura_ruta
    ? enlaceAccion(f.factura_ruta, "ri-download-2-line", "Descargar factura")
    : botonAccion("factura", f.id, "ri-file-text-line", "Generar factura");
  return botonAccion("print", f.id, "ri-printer-line", "Imprimir comprobante") + factura + borrar(f.id);
}

const filaPago = {
  registro: ["pago", "pagos"],
  orden: { clave: "fecha_pago", dir: "asc" },
  // Pago con una solicitud de factura pendiente: que se vea.
  claseFila: (f) => (f.factura_estado === "solicitada" ? "tabla__fila--aviso" : ""),
  acciones: accionesPago,
};

// ---------------------------------------------------------------- entidades

export const TABLAS = {
  clients: {
    etiqueta: "Pacientes",
    registro: ["paciente", "pacientes"],
    vacio: "Todavía no hay pacientes",
    buscador: { placeholder: "Buscar paciente, teléfono, email…" },
    orden: { clave: "Alta", dir: "asc" },
    columnas: [
      { clave: "nombre", titulo: "Nombre", rol: "principal" },
      { clave: "telefono", titulo: "Teléfono" },
      { clave: "email", titulo: "Email" },
      { clave: "Deuda", titulo: "Deuda", tipo: "dinero" },
      { clave: "Alta", titulo: "Alta", tipo: "fecha" },
      { clave: "alergias", titulo: "Alergias" },
      { clave: "edad", titulo: "Edad" },
    ],
    acciones: (f) =>
      botonAccion("extra", f.id, "ri-file-user-line", "Historia clínica") +
      botonAccion("edit", f.id, "ri-edit-line", "Editar paciente") +
      botonAccion("invite", f.id, "ri-mail-send-line", "Invitar al portal") +
      borrar(f.id),
  },

  // Filas ya preparadas por getAppointments() (funciones.js).
  appointments: {
    etiqueta: "Citas",
    registro: ["cita", "citas"],
    vacio: "No hay citas de hoy en adelante",
    buscador: { placeholder: "Buscar paciente, fecha (dd/mm/aaaa)…" },
    orden: { clave: "fecha", dir: "asc" },
    columnas: [
      { clave: "Paciente", titulo: "Paciente", rol: "principal" },
      { clave: "Observaciones", titulo: "Observaciones" },
      { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
      {
        clave: "medico",
        titulo: "Gabinete",
        texto: (f) => GABINETES[f.medico] || f.medico || "",
        celda: (f) => `<button type="button" class="pastilla pastilla--boton table__medico" data-tono="acento"
          data-id="${escapeHtml(f.id)}" aria-label="Cambiar gabinete">${escapeHtml(GABINETES[f.medico] || f.medico || "—")}</button>`,
      },
      {
        // El color va por ESTADO (como el calendario y la agenda del Resumen).
        clave: "estado",
        titulo: "Estado",
        celda: (f) => {
          const estado = f.estado || "Pendiente";
          const clave = estado.toLowerCase();
          const color = ESTADOS_CITA.includes(clave) ? `data-estado="${clave}"` : 'data-tono="acento"';
          return `<button type="button" class="pastilla pastilla--boton table__status" ${color}
            data-id="${escapeHtml(f.id)}" aria-label="Cambiar estado">${escapeHtml(estado)}</button>`;
        },
      },
    ],
    acciones: (f) => botonAccion("edit", f.id, "ri-edit-line", "Editar cita") + borrar(f.id),
  },

  services: {
    etiqueta: "Servicios",
    registro: ["servicio", "servicios"],
    vacio: "Todavía no hay servicios",
    orden: { clave: "nombre", dir: "asc" },
    columnas: [
      { clave: "nombre", titulo: "Nombre", rol: "principal" },
      { clave: "descripcion", titulo: "Descripción" },
      { clave: "precio", titulo: "Precio", tipo: "dinero" },
    ],
    acciones: (f) => botonAccion("edit", f.id, "ri-edit-line", "Editar servicio") + borrar(f.id),
  },

  treatments: {
    etiqueta: "Tratamientos del paciente",
    registro: ["tratamiento", "tratamientos"],
    vacio: "Este paciente aún no tiene tratamientos",
    orden: { clave: "fecha_creacion", dir: "asc" },
    columnas: [
      { clave: "diagnostico", titulo: "Tratamiento", rol: "principal" },
      { clave: "observaciones", titulo: "Observaciones" },
      { clave: "monto_total", titulo: "Total", tipo: "dinero" },
      { clave: "monto_pagado", titulo: "Pagado", tipo: "dinero" },
      { clave: "deuda", titulo: "Deuda", tipo: "dinero" },
      { clave: "fecha_creacion", titulo: "Fecha", tipo: "fecha" },
    ],
    acciones: (f) =>
      botonAccion("treatments", f.id, "ri-eye-line", "Ver tratamiento") +
      botonAccion("edit-treatment", f.id, "ri-edit-line", "Editar tratamiento") +
      borrar(f.id),
  },

  // Pagos de UN tratamiento (ficha del tratamiento).
  payments: {
    ...filaPago,
    etiqueta: "Pagos del tratamiento",
    vacio: "Aún no hay pagos en este tratamiento",
    columnas: [
      { clave: "monto", titulo: "Importe", tipo: "dinero", rol: "principal" },
      { clave: "fecha_pago", titulo: "Fecha", tipo: "fecha" },
      { clave: "metodo_pago", titulo: "Método" },
      { clave: "notas", titulo: "Notas" },
      columnaFactura,
    ],
  },

  // Todos los pagos de la clinica (panel de Admin).
  pagosGenerales: {
    ...filaPago,
    etiqueta: "Pagos registrados",
    vacio: "Todavía no hay pagos",
    columnas: [
      { clave: "cliente", titulo: "Paciente", rol: "principal" },
      { clave: "tratamiento", titulo: "Tratamiento" },
      { clave: "monto", titulo: "Importe", tipo: "dinero" },
      { clave: "fecha_pago", titulo: "Fecha", tipo: "fecha" },
      { clave: "metodo_pago", titulo: "Método" },
      columnaFactura,
    ],
  },

  facturas: {
    etiqueta: "Facturas emitidas",
    registro: ["factura", "facturas"],
    vacio: "Todavía no hay facturas",
    orden: { clave: "fecha", dir: "asc" },
    columnas: [
      { clave: "numero_factura", titulo: "Nº", rol: "principal" },
      { clave: "nombre_paciente", titulo: "Paciente" },
      { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
    ],
    acciones: (f) => (f.ruta ? enlaceAccion(f.ruta, "ri-download-2-line", "Descargar factura") : ""),
  },
};

const instancias = new Map(); // contenedor -> Tabla

/**
 * Tabla de una entidad en un contenedor (por defecto #table). La crea la
 * primera vez; las siguientes devuelve la misma (para repintar con .datos()).
 * Si la URL trae ?search=, arranca ya filtrada (buscador de la barra superior,
 * enlaces del calendario...).
 */
export function obtenerTabla(entidad, contenedor = document.getElementById("table")) {
  let tabla = instancias.get(contenedor);
  if (!tabla) {
    const busquedaInicial = new URLSearchParams(location.search).get("search") || "";
    tabla = new Tabla(contenedor, { ...TABLAS[entidad], busquedaInicial });
    instancias.set(contenedor, tabla);
  }
  return tabla;
}
