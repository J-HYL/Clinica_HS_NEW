import { escapeHtml } from "../html.js";

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

  const subTotal = servicios.reduce((s, it) => s + it.precio * it.cantidad, 0);
  const descuento = getSelectedDiscount();
  const descuentoImporte = subTotal * (descuento / 100);
  const totalFinal = subTotal - descuentoImporte;
  
  const now = new Date();
  const fechaExp = now.toLocaleDateString();
  const res = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
  const data = await res.json();

  const ultimoNumero = data.ultimoNumero || 0;
  const numeroFactura = ultimoNumero + 1;

  try {


    const rowsHtml = servicios.map(s => `
      <tr>
        <td style="padding:6px;border:1px solid #ccc">${escapeHtml(s.cantidad)}</td>
        <td style="padding:6px;border:1px solid #ccc">${escapeHtml(s.descripcion)}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:right">€${s.precio.toFixed(2)}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:right">€${(s.precio * s.cantidad).toFixed(2)}</td>
      </tr>
    `).join("");

    const descuentoHtml = descuento > 0
      ? `<tr><td>Descuento ${descuento}%</td><td>-€${descuentoImporte.toFixed(2)}</td></tr>`
      : "";

    const facturaHtml = `
<html>
  <head>
    <title>
      Factura - HSD-${escapeHtml(prefijoClinica)}-${escapeHtml(numeroFactura)}
    </title>
    <style>
      body {
        font-family: "Segoe UI", Arial, sans-serif;
        color: #333;
        margin: 0;
        font-size: 13px;
      }
      .factura {
        width: 94%;
        margin: 0 auto;
        padding: 10px 0;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1.5px solid #222;
        padding-bottom: 10px;
        margin-bottom: 15px;
      }
      .logo {
        width: 120px;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .logo img {
        max-width: 135px;
        max-height: 60px;
      }
      .emisor {
        flex: 1;
        margin-left: 15px;
      }
      .emisor h2 {
        margin: 0;
        font-size: 18px;
      }
      .emisor p {
        margin: 0;
      }
      .datos-factura {
        text-align: right;
      }
      section {
        margin-bottom: 20px;
      }
      h3 {
        font-size: 14px;
        border-bottom: 1px solid #ccc;
        padding-bottom: 3px;
        margin-bottom: 6px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 15px;
        font-size: 13px;
      }
      th,
      td {
        padding: 6px;
      }
      th {
        background: #f4f4f4;
        text-align: left;
      }
      td {
        font-size: 13px;
      }
      td:last-child,
      th:last-child {
        text-align: right;
      }
      .totales {
        width: 40%;
        float: right;
        border-collapse: collapse;
        margin-top: 10px;
      }
      .totales td {
        border: 1px solid #ccc;
        padding: 5px;
        font-size: 13px;
      }
      .totales tr:last-child td {
        font-weight: 700;
        background: #f4f4f4;
      }
      .info-cobro {
        clear: both;
        margin-top: 25px;
      }
      footer {
        border-top: 1.5px solid #222;
        margin-top: 25px;
        padding-top: 8px;
        font-size: 12px;
        line-height: 1.3;
      }
    </style>
  </head>
  <body>
    <div class="factura">
      <header>
        <table

        >
          <tr>
            <!-- Logo -->
            <td
              style="width: 120px; text-align: center; vertical-align: middle"
            >
              <img
                src="https://app.hsdental.es/assets/images/logoCompleto.jpg"
                style="max-width: 120px; max-height: 60px"
                alt="logoHS"
              />
            </td>

            <!-- Datos de la clínica -->
            <td style="padding-left: 15px; vertical-align: top">
              <h2 style="margin: 0; font-size: 18px">
                ${escapeHtml(clinic.nombre)}
              </h2>
              <p style="margin: 0">NIF: ${escapeHtml(clinic.nif)}</p>
              <p style="margin: 0">${escapeHtml(clinic.direccion)}</p>
              <p style="margin: 0">
                Tel: ${escapeHtml(clinic.telefono)} | Email:
                ${escapeHtml(clinic.email)}
              </p>
            </td>

            <!-- Datos de la factura -->
            <td style="text-align: right; vertical-align: top">
              <p style="margin: 0">
                <strong>Factura Nº:</strong>
                HSD-${prefijoClinica}-${numeroFactura}
              </p>
              <p style="margin: 0">
                <strong>Fecha de expedición:</strong> ${fechaExp}
              </p>
            </td>
          </tr>
        </table>
      </header>

      <section class="receptor">
        <h3>Datos del paciente</h3>
        <p><strong>Nombre:</strong> ${escapeHtml(patientName)}</p>
        ${patientDNI ? `
        <p><strong>DNI/NIF:</strong> ${escapeHtml(patientDNI)}</p>
        ` : ""} ${patientPhone ? `
        <p><strong>Teléfono:</strong> ${escapeHtml(patientPhone)}</p>
        ` : ""} ${patientAddress ? `
        <p><strong>Domicilio:</strong> ${escapeHtml(patientAddress)}</p>
        ` : ""} ${observations ? `
        <p><strong>Observaciones:</strong> ${escapeHtml(observations)}</p>
        ` : ""}
      </section>

      <table>
        <thead>
          <tr>
            <th style="width: 10%">Cant.</th>
            <th style="width: 60%">Descripción del servicio</th>
            <th style="width: 15%">Precio unitario (€)</th>
            <th style="width: 15%">Importe (€)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <table class="totales">
        <tr>
          <td>Base imponible</td>
          <td>€${subTotal.toFixed(2)}</td>
        </tr>
        ${descuentoHtml}
        <tr>
          <td>Total a pagar</td>
          <td>€${totalFinal.toFixed(2)}</td>
        </tr>
      </table>

      <section class="info-cobro">
        <h3>Información de cobro</h3>
        <p><strong>Forma de pago:</strong> ${escapeHtml(paymentMethod)}</p>
      </section>

      <footer>
        <p>
          <strong>Operación exenta de IVA (art. 20.Uno.3 Ley 37/1992).</strong>
        </p>
        <p>Factura conforme al Real Decreto 1619/2012.</p>
        <p><em>Gracias por confiar en ${escapeHtml(clinic.nombre)}.</em></p>
      </footer>
    </div>
  </body>
</html>`;
  
    //const ventana = window.open("", "_blank");
    	//ventana.document.open();
    	//ventana.document.write(facturaHtml);
    	// aviso de exito movido a DESPUES del POST (ver comprobacion de dataPost.success mas abajo)
      //ventana.print();
      //ventana.document.close();

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


    //if (!dataPost.success) throw new Error(dataPost.error || "Error al guardar factura");


     
  } catch (err) {
    console.error(err);
    //Swal.fire("Error", err.message, "error");
    Swal.fire("Error", "No se pudo guardar la factura: " + err.message, "error");

  }
}

