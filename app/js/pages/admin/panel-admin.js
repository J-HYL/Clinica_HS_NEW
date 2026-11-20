// panel-admin.js — Panel de Admin de dos pestañas: Facturas y Pagos.
//  - Facturas: lista de facturas emitidas (tabla propia).
//  - Pagos: vista general de todos los pagos, con "Registrar pago" (cliente +
//    tratamiento) y por cada fila recibo / convertir en factura / descargar.
// Las dos listas son la tabla comun (Tabla.js, columnas en tablas.js) y reutiliza
// setTableEventsListeners (recibo/factura) del panel; el POST de pago es el
// mismo que en tratamientos.
import DB from "../../modules/classes/DB_API.js";
import { obtenerTabla } from "../../modules/tablas.js";
import { setTableEventsListeners } from "../../modules/funciones.js";
import { escapeHtml } from "../../modules/html.js";
import { fechaCorta } from "../../modules/formato.js";

const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ tabs
// Pestañas (pieza .segmentado): la activa lleva aria-selected="true" y solo se
// ve su panel (el de su aria-controls).
function initTabs() {
  const pestanas = document.querySelectorAll('[role="tab"]');
  pestanas.forEach((pestana) => {
    pestana.addEventListener("click", () => {
      pestanas.forEach((p) => {
        const activa = p === pestana;
        p.setAttribute("aria-selected", String(activa));
        document.getElementById(p.getAttribute("aria-controls")).hidden = !activa;
      });
    });
  });
}

// Carga una lista en su tabla: "cargando", datos o el error en la propia tabla.
async function cargarLista(entidad, contenedor, peticion, mensajeError) {
  const tabla = obtenerTabla(entidad, contenedor);
  tabla.cargando();
  try {
    tabla.datos(await peticion());
  } catch (e) {
    tabla.error(mensajeError);
  }
}

// -------------------------------------------------------------- facturas
function cargarFacturas() {
  return cargarLista("facturas", $("#table-facturas"), async () => {
    const res = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error al cargar facturas");
    return data.facturas || [];
  }, "No se pudieron cargar las facturas.");
}

// ----------------------------------------------------------------- pagos
function cargarPagos() {
  return cargarLista("pagosGenerales", $("#table-pagos"), () => DB.getPaymentsGeneral(),
    "No se pudieron cargar los pagos.");
}

// Recibo / factura / descargar / borrar de cada pago (misma lógica que en tratamientos).
$("#table-pagos").addEventListener("click", (e) => setTableEventsListeners(e, "payments"));

// ------------------------------------------------- modal registrar pago
function initModalPago() {
  const dlg = $("#pago-modal");
  const inputCliente = $("#pago-cliente");
  const lista = $("#pago-cliente-list");
  const selTrat = $("#pago-tratamiento");
  const inputMonto = $("#pago-monto");
  const selMetodo = $("#pago-metodo");
  const inputNotas = $("#pago-notas");
  const btnGuardar = $("#pago-guardar");

  let clientes = [];      // cache de todos los clientes (una sola carga)
  let clienteId = null;   // cliente elegido

  function reset() {
    clienteId = null;
    inputCliente.value = "";
    lista.classList.remove("show"); lista.innerHTML = "";
    selTrat.innerHTML = '<option value="">Elige primero un paciente</option>';
    selTrat.disabled = true;
    inputMonto.value = ""; inputNotas.value = ""; selMetodo.value = "Efectivo";
  }

  async function abrir() {
    reset();
    dlg.showModal();
    if (!clientes.length) {
      try { clientes = await DB.getRecords("clients"); }
      catch (e) { Swal.fire("Error", "No se pudieron cargar los clientes.", "error"); }
    }
  }

  // Autocompletado de cliente por nombre.
  inputCliente.addEventListener("input", () => {
    clienteId = null;
    const q = inputCliente.value.trim().toLowerCase();
    if (q.length < 2) { lista.classList.remove("show"); lista.innerHTML = ""; return; }
    const matches = clientes
      .filter((c) => (c.nombre || "").toLowerCase().includes(q))
      .slice(0, 8);
    if (!matches.length) { lista.classList.remove("show"); lista.innerHTML = ""; return; }
    lista.innerHTML = matches
      .map((c) => `<button type="button" class="pago-ac__item" data-id="${escapeHtml(c.id)}">${escapeHtml(c.nombre)}</button>`)
      .join("");
    lista.classList.add("show");
    lista.querySelectorAll(".pago-ac__item").forEach((el) => {
      el.onclick = () => elegirCliente(Number(el.dataset.id), el.textContent);
    });
  });

  async function elegirCliente(id, nombre) {
    clienteId = id;
    inputCliente.value = nombre;
    lista.classList.remove("show"); lista.innerHTML = "";
    selTrat.innerHTML = '<option value="">Cargando…</option>';
    selTrat.disabled = true;
    try {
      const trats = await DB.getTreatmentsByClientId(id);
      if (!trats.length) {
        selTrat.innerHTML = '<option value="">Este paciente no tiene tratamientos</option>';
        return;
      }
      selTrat.innerHTML = trats
        .map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.diagnostico || "Tratamiento")}${t.fecha ? " · " + fechaCorta(t.fecha) : ""}</option>`)
        .join("");
      selTrat.disabled = false;
    } catch (e) {
      selTrat.innerHTML = '<option value="">Error al cargar tratamientos</option>';
    }
  }

  async function guardar() {
    const treatment_id = Number(selTrat.value);
    const monto = parseFloat(inputMonto.value);
    if (!clienteId) return Swal.fire("Falta el cliente", "Elige un paciente de la lista.", "warning");
    if (!treatment_id) return Swal.fire("Falta el tratamiento", "Elige uno de sus tratamientos.", "warning");
    if (isNaN(monto) || monto <= 0) return Swal.fire("Importe no válido", "Introduce un importe mayor que 0.", "warning");

    btnGuardar.disabled = true;
    Swal.fire({ title: "Guardando pago…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      await DB.addRegister("payments", {
        treatment_id,
        client_id: clienteId,
        monto_pagado: monto,
        metodo_pago: selMetodo.value,
        notas: inputNotas.value || "",
      });
      dlg.close();
      await cargarPagos();
      Swal.fire({ icon: "success", title: "Pago registrado", timer: 1600, showConfirmButton: false });
    } catch (e) {
      Swal.fire("Error", "No se pudo registrar el pago.", "error");
    } finally {
      btnGuardar.disabled = false;
    }
  }

  $("#btn-registrar-pago").addEventListener("click", abrir);
  $("#pago-cancel").addEventListener("click", () => dlg.close());
  $("#pago-cerrar").addEventListener("click", () => dlg.close());
  btnGuardar.addEventListener("click", guardar);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); dlg.close(); });
  // Cerrar el autocompletado al pulsar fuera del input/lista.
  document.addEventListener("click", (e) => {
    if (!inputCliente.contains(e.target) && !lista.contains(e.target)) lista.classList.remove("show");
  });
}

// ------------------------------------------------------------- arranque
initTabs();
initModalPago();
cargarFacturas();
cargarPagos();
