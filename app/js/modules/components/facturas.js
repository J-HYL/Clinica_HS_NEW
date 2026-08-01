import { escapeHtml } from "../html.js";
import { construirFacturaHtml } from "./facturaHtml.js";

const servicios = [];

// Datos de clinica: fuente UNICA en clinica.js (window.Clinica). No duplicar aqui.

const el = id => document.getElementById(id);
const tbody = document.querySelector("#servicesTable tbody");
const previewTotal = el("previewTotal");

// --- NUEVO: obtener descuento activo ---
function getSelectedDiscount() {
  const radio = document.querySelector('input[name="desc"]:checked');
  return radio ? parseFloat(radio.value) || 0 : 0;
}

document.addEventListener("DOMContentLoaded", () => {
  autodetectarClinica();

  el("btnAdd").addEventListener("click", e => {
    e.preventDefault();
    agregarServicio();
  });

  el("btnClear").addEventListener("click", e => {
    e.preventDefault();
    limpiarFormulario();
    servicios.length = 0;
    actualizarTabla();
  });

  el("btnPrint").addEventListener("click", e => {
    e.preventDefault();
    imprimirFactura();
  });

  document.querySelectorAll('input[name="desc"]').forEach(r => {
    r.addEventListener("change", actualizarTabla);
  });

  ["servicePrice", "serviceQty"].forEach(id => {
    el(id).addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); agregarServicio(); }
    });
  });

  // Delegacion: el boton de borrar servicio ya no usa onclick inline (este archivo
  // se carga como modulo ES, asi que eliminarServicio no es global).
  tbody.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".btn-eliminar-servicio");
    if (!btn) return;
    eliminarServicio(parseInt(btn.dataset.index, 10));
  });

  actualizarTabla();
});

// Autodetecta la clinica de la SESION (via componente unico window.Clinica) y bloquea
// el selector, para que la factura sea SIEMPRE de la clinica en la que estas logueado.
async function autodetectarClinica() {
  const sel = el("clinicSelect");
  if (!sel) return;
  const clinic = await window.Clinica.actual();
  if (clinic) {
    sel.value = clinic.key;
    sel.disabled = true; // no editable: solo se factura de la clinica en la que estas
    sel.title = "Detectada automaticamente segun tu sesion";
  }
}

function agregarServicio() {
  const desc = el("serviceDesc").value.trim();
  const qty = parseInt(el("serviceQty").value, 10);
  const price = parseFloat(el("servicePrice").value);

  if (!desc || isNaN(qty) || qty <= 0 || isNaN(price) || price < 0) {
    Swal.fire("Datos incompletos", "Rellena descripción, cantidad y precio válidos.", "warning");
    return;
  }

  servicios.push({ descripcion: desc, cantidad: qty, precio: price });
  el("serviceDesc").value = "";
  el("serviceQty").value = 1;
  el("servicePrice").value = "0.00";

  actualizarTabla();
}

function eliminarServicio(index) {
  servicios.splice(index, 1);
  actualizarTabla();
}

function actualizarTabla() {
  tbody.innerHTML = "";
  let total = 0;
  servicios.forEach((s, i) => {
    const tr = document.createElement("tr");
    const totalLinea = s.cantidad * s.precio;
    total += totalLinea;
    tr.innerHTML = `
      <td>${escapeHtml(s.descripcion)}</td>
      <td style="text-align:center">${s.cantidad}</td>
      <td style="text-align:right">€${s.precio.toFixed(2)}</td>
      <td style="text-align:right">€${totalLinea.toFixed(2)}</td>
      <td class="actions"><button data-index="${i}" class="btn-eliminar-servicio" title="Eliminar" style="background:#e53935;border:none;color:#fff;padding:6px;border-radius:4px;cursor:pointer"><i class="ri-delete-bin-6-line"></i></button></td>
    `;
    tbody.appendChild(tr);
  });

  const descuento = getSelectedDiscount();
  let totalConDescuento = total;

  if (descuento > 0) {
    totalConDescuento = total - (total * descuento / 100);
    previewTotal.innerText = `Total: €${totalConDescuento.toFixed(2)} (Descuento ${descuento}% aplicado)`;
  } else {
    previewTotal.innerText = `Total: €${total.toFixed(2)}`;
  }

  if (totalConDescuento >= 400) {
    Swal.fire({
      icon: "info",
      title: "Atención",
      html: "El total de la factura es igual o superior a <strong>400 €</strong>.<br>Debe incluir el <strong>DNI</strong> y el <strong>domicilio</strong> del paciente para cumplir la normativa española.",
      confirmButtonText: "Entendido",
    });
  }
}

function limpiarFormulario() {
  ["serviceDesc", "serviceQty", "servicePrice"].forEach(id => el(id).value = "");
  el("serviceQty").value = 1;
  el("servicePrice").value = "0.00";
  document.querySelector("#noDesc").checked = true;
  previewTotal.innerText = "Total: €0.00";
}

async function imprimirFactura() {
  const patientName = el("patientName").value.trim();
  if (!patientName) {
    Swal.fire("Falta el nombre", "El nombre del paciente es obligatorio.", "warning");
    return;
  }
  const key = el("clinicSelect").value;
  if (key === "#" || key === "" || key === null) {
    Swal.fire("Selecciona una clínica", "Debes elegir una clínica antes de generar la factura.", "warning");
    return;
  }

  const patientDNI = el("patientDNI").value.trim();
  const patientAddress = el("patientAddress").value.trim();
  const patientPhone = el("patientPhone").value.trim();
  const observations = el("observations").value.trim();
  const paymentMethod = el("paymentMethod").value;
  const clinicKey = el("clinicSelect").value;
  const clinic = window.Clinica.DATOS[clinicKey] || window.Clinica.DATOS.mostoles;
  const prefijoClinica = clinic.inicial || "GEN";

  const descuento = getSelectedDiscount();
  const res = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
  const data = await res.json();

  const ultimoNumero = data.ultimoNumero || 0;
  const numeroFactura = ultimoNumero + 1;

  try {
    // Plantilla de factura: fuente UNICA en facturaHtml.js (misma que usa el
    // boton "Generar factura" por pago del panel).
    const facturaHtml = construirFacturaHtml({
      clinic,
      numeroFactura,
      paciente: {
        nombre: patientName,
        dni: patientDNI,
        telefono: patientPhone,
        domicilio: patientAddress,
      },
      lineas: servicios,
      paymentMethod,
      observaciones: observations,
      descuento,
    });

    const formData = new FormData();
    formData.append("nombre_paciente", patientName);
    formData.append("html", facturaHtml);

    const resPost = await fetch("/api/DB.php?table=facturas", {
      method: "POST",
      body: formData,
      credentials: "include"
    });

    const dataPost = await resPost.json();
    if (!dataPost.success) throw new Error(dataPost.error || "No se pudo guardar la factura");
    // Numero REAL asignado por el servidor (evita desajustes con el calculado en cliente)
    const numero = dataPost.numero || numeroFactura;
    Swal.fire("Factura guardada", `Factura HSD-${prefijoClinica}-${numero} guardada correctamente.`, "success");
    window.open(`/uploads/facturas/factura_HSD-${prefijoClinica}-${numero}.pdf`, "_blank");
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudo guardar la factura: " + err.message, "error");
  }
}
