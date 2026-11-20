// facturas.js — Pantalla "Nueva factura" (pages/facturas/facturas.html).
// Mismo editor que el presupuesto (LineasDocumento + documento.css); el PDF lo
// genera el servidor con la plantilla de facturaHtml.js (no tocar su salida) y
// el numero real lo asigna DB.php.

import DB from "../classes/DB_API.js";
import { escapeHtml } from "../html.js";
import { euros } from "../formato.js";
import { construirFacturaHtml } from "./facturaHtml.js";
import LineasDocumento from "./LineasDocumento.js";

// Datos de clinica: fuente UNICA en clinica.js (window.Clinica). No duplicar aqui.

const el = (id) => document.getElementById(id);
const aviso = el("aviso");
let pacientes = [];

// Funcion (no const): LineasDocumento llama a pintarTotales al crearse.
function descuentoElegido() {
  return parseFloat(el("descuento").value) || 0;
}

function pintarTotales() {
  if (!lineas) return; // primera llamada, desde el constructor del editor
  const { subtotal, valido } = lineas.totales;
  const total = Math.round(subtotal * (1 - descuentoElegido() / 100) * 100) / 100;
  document.querySelector('[data-total="subtotal"]').textContent = valido ? euros(subtotal) : "—";
  document.querySelector('[data-total="total"]').textContent = valido ? euros(total) : "—";
  // Normativa: desde 400 € la factura tiene que llevar DNI y domicilio.
  el("aviso-400").hidden = !(valido && total >= 400);
}

let lineas = null;
lineas = new LineasDocumento(el("lineas"), {
  pieza: false,
  descuento: false,
  concepto: "Servicio",
  placeholder: "Limpieza dental profesional",
  alCambiar: pintarTotales,
});

// La factura es SIEMPRE de la clinica de la sesion: se autodetecta y se bloquea.
async function autodetectarClinica() {
  const sel = el("clinicSelect");
  const clinic = await window.Clinica.actual();
  if (clinic) {
    sel.value = clinic.key;
    sel.disabled = true;
    sel.title = "Detectada automáticamente según tu sesión";
  }
}

async function cargarDatos() {
  const [servicios, clientes] = await Promise.all([
    DB.getRecords("services").catch(() => []),
    DB.getRecords("clients").catch(() => []),
  ]);
  lineas.cargarCatalogo(servicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: Number(s.precio) || 0 })));
  pacientes = clientes;
  el("lista-pacientes").innerHTML = clientes
    .map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.telefono || "")}</option>`)
    .join("");
}

// Elegir un paciente de la lista rellena su telefono (si el campo esta vacio).
el("patientName").addEventListener("input", (e) => {
  e.target.classList.remove("error");
  const p = pacientes.find((x) => x.nombre.trim().toLowerCase() === e.target.value.trim().toLowerCase());
  if (p && !el("patientPhone").value) el("patientPhone").value = p.telefono || "";
});

function limpiar() {
  ["patientName", "patientDNI", "patientPhone", "patientAddress", "observations"].forEach((id) => { el(id).value = ""; });
  el("descuento").value = "0";
  el("patientName").classList.remove("error");
  aviso.textContent = "";
  lineas.vaciar();
}

function validar() {
  const errores = [];
  const sinNombre = !el("patientName").value.trim();
  el("patientName").classList.toggle("error", sinNombre);
  if (sinNombre) errores.push("El nombre del paciente es obligatorio.");
  if (!el("clinicSelect").value) errores.push("Elige la clínica.");
  errores.push(...lineas.errores());
  aviso.textContent = errores.join(" ");
  return !errores.length;
}

async function generarFactura() {
  if (!validar()) return;

  const clinicKey = el("clinicSelect").value;
  const clinic = window.Clinica.DATOS[clinicKey] || window.Clinica.DATOS.mostoles;
  const prefijoClinica = clinic.inicial || "GEN";
  const patientName = el("patientName").value.trim();
  const boton = el("btnPrint");
  boton.disabled = true;

  try {
    const res = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
    const data = await res.json();
    const numeroFactura = (data.ultimoNumero || 0) + 1;

    // Plantilla de factura: fuente UNICA en facturaHtml.js (misma que usa el
    // boton "Generar factura" por pago del panel).
    const facturaHtml = construirFacturaHtml({
      clinic,
      numeroFactura,
      paciente: {
        nombre: patientName,
        dni: el("patientDNI").value.trim(),
        telefono: el("patientPhone").value.trim(),
        domicilio: el("patientAddress").value.trim(),
      },
      lineas: lineas.lineas.map((l) => ({ descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio })),
      paymentMethod: el("paymentMethod").value,
      observaciones: el("observations").value.trim(),
      descuento: descuentoElegido(),
    });

    const formData = new FormData();
    formData.append("nombre_paciente", patientName);
    formData.append("html", facturaHtml);

    const resPost = await fetch("/api/DB.php?table=facturas", { method: "POST", body: formData, credentials: "include" });
    const dataPost = await resPost.json();
    if (!dataPost.success) throw new Error(dataPost.error || "No se pudo guardar la factura");
    // Numero REAL asignado por el servidor (evita desajustes con el calculado en cliente)
    const numero = dataPost.numero || numeroFactura;
    Swal.fire("Factura guardada", `Factura HSD-${prefijoClinica}-${numero} guardada correctamente.`, "success");
    window.open(`/uploads/facturas/factura_HSD-${prefijoClinica}-${numero}.pdf`, "_blank");
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo guardar la factura: " + err.message, "error");
  } finally {
    boton.disabled = false;
  }
}

el("editor").addEventListener("submit", (e) => {
  e.preventDefault();
  generarFactura();
});
el("btnClear").addEventListener("click", limpiar);
el("descuento").addEventListener("change", pintarTotales);

autodetectarClinica();
cargarDatos();
pintarTotales();
