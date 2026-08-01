// facturaHtml.js
// Fuente UNICA de la plantilla HTML de la factura. La usan:
//   - app/js/modules/components/facturas.js  (pantalla manual de facturacion)
//   - app/js/modules/funciones.js            (boton "Generar factura" por pago)
// Antes el HTML vivia embebido dentro de imprimirFactura(); se extrajo aqui para
// no duplicarlo (DRY). El HTML es el mismo: no cambiar su salida sin querer.
//
// El logo va como URL absoluta a proposito: DB.php lo sustituye por un data-URI
// base64 server-side antes de renderizar con dompdf (ver CLAUDE.md). No tocar.
import { escapeHtml } from "../html.js";

/**
 * Construye el HTML de una factura.
 * @param {Object}   p
 * @param {Object}   p.clinic        datos fiscales de la clinica (window.Clinica.DATOS[...]):
 *                                   { nombre, nif, direccion, telefono, email, inicial }
 * @param {number}   p.numeroFactura numero correlativo (para mostrar; el real lo asigna el servidor)
 * @param {Object}   p.paciente      { nombre, dni?, telefono?, domicilio? }
 * @param {Array}    p.lineas        [{ descripcion, cantidad, precio }]
 * @param {string}   p.paymentMethod forma de pago
 * @param {string}  [p.observaciones]
 * @param {number}  [p.descuento]    porcentaje de descuento (0-100)
 * @returns {string} HTML completo de la factura
 */
export function construirFacturaHtml({ clinic, numeroFactura, paciente, lineas, paymentMethod, observaciones = "", descuento = 0 }) {
  const prefijoClinica = clinic.inicial || "GEN";
  const fechaExp = new Date().toLocaleDateString();

  const subTotal = lineas.reduce((s, it) => s + it.precio * it.cantidad, 0);
  const descuentoImporte = subTotal * (descuento / 100);
  const totalFinal = subTotal - descuentoImporte;

  const rowsHtml = lineas.map(s => `
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

  const patientName = paciente.nombre || "";
  const patientDNI = paciente.dni || "";
  const patientPhone = paciente.telefono || "";
  const patientAddress = paciente.domicilio || "";
  const observations = observaciones || "";

  return `
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
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
}
