// panel-admin.js — Panel de Admin de dos pestañas: Facturas y Pagos.
//  - Facturas: lista de facturas emitidas (tabla propia).
//  - Pagos: vista general de todos los pagos, con "Registrar pago" (cliente +
//    tratamiento) y por cada fila recibo / convertir en factura / descargar.
// Reutiliza createTableInstance (dos tablas via opts) y setTableEventsListeners
// (recibo/factura) del panel; el POST de pago es el mismo que en tratamientos.
import DB from "../../modules/classes/DB_API.js";
import { createTableInstance } from "../../modules/components/Datatables.js";
import { setTableEventsListeners } from "../../modules/funciones.js";

const $ = (s) => document.querySelector(s);

// ------------------------------------------------------------------ tabs
function initTabs() {
  const botones = document.querySelectorAll(".tab");
  const paneles = {
    facturas: $("#panel-facturas"),
    pagos: $("#panel-pagos"),
  };
  botones.forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.tab;
      botones.forEach((b) => b.classList.toggle("tab--active", b === btn));
      paneles.facturas.hidden = t !== "facturas";
      paneles.pagos.hidden = t !== "pagos";
      // Recalcular anchos de la tabla que estaba oculta (jQuery global; aquí $ es querySelector).
      const tabla = t === "facturas" ? "#table-facturas" : "#table-pagos";
      const jq = window.jQuery;
      if (jq && jq.fn.DataTable && jq.fn.DataTable.isDataTable(tabla)) {
        jq(tabla).DataTable().columns.adjust();
      }
    });
  });
}

// -------------------------------------------------------------- facturas
async function cargarFacturas() {
  const empty = $("#facturas-empty");
  const table = $("#table-facturas");
  try {
    const res = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Error al cargar facturas");
    const facturas = data.facturas || [];
    if (!facturas.length) { empty.hidden = false; table.style.display = "none"; return; }
    empty.hidden = true; table.style.display = "";
    createTableInstance(facturas, { tableSelector: "#table-facturas", objectStore: "facturas" });
  } catch (e) {
    empty.hidden = false; empty.textContent = "No se pudieron cargar las facturas.";
  }
}

// ----------------------------------------------------------------- pagos
async function cargarPagos() {
  const empty = $("#pagos-empty");
  const table = $("#table-pagos");
  try {
    const pagos = await DB.getPaymentsGeneral();
    if (!Array.isArray(pagos) || !pagos.length) { empty.hidden = false; table.style.display = "none"; return; }
    empty.hidden = true; table.style.display = "";
    createTableInstance(pagos, { tableSelector: "#table-pagos", objectStore: "payments" });
  } catch (e) {
    empty.hidden = false; empty.textContent = "No se pudieron cargar los pagos.";
  }
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
    selTrat.innerHTML = '<option value="">Elige primero un cliente</option>';
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
      .map((c) => `<div class="pago-ac__item" data-id="${c.id}">${escape(c.nombre)}</div>`)
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
        .map((t) => `<option value="${t.id}">${escape(t.diagnostico || "Tratamiento")}${t.fecha ? " · " + fmtFecha(t.fecha) : ""}</option>`)
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

  $("#btn-registrar-pago").addEventListener("click", (e) => { e.preventDefault(); abrir(); });
  $("#pago-cancel").addEventListener("click", () => dlg.close());
  btnGuardar.addEventListener("click", guardar);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); dlg.close(); });
  // Cerrar el autocompletado al pulsar fuera del input/lista.
  document.addEventListener("click", (e) => {
    if (!inputCliente.contains(e.target) && !lista.contains(e.target)) lista.classList.remove("show");
  });
}

// ------------------------------------------------------------- helpers
function escape(v) {
  return v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtFecha(s) {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES");
}

// ------------------------------------------------------------- arranque
initTabs();
initModalPago();
cargarFacturas();
cargarPagos();
