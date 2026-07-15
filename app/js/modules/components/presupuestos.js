let tratamientos = [];
let clinicaActual = null; // clinica de la SESION, precargada (componente unico window.Clinica)
(async () => { clinicaActual = await window.Clinica.actual(); })();

function agregarTratamiento() {
  const tratamiento = document.getElementById("tratamiento").value;
  const costo = parseFloat(document.getElementById("costo").value);
  const cantidad = parseInt(document.getElementById("cantidad").value);
  const dientesInput = document.getElementById("dientes").value;
  const dientes = dientesInput ? dientesInput.split(",").map(d => d.trim()) : [];

  if (tratamiento && !isNaN(costo) && !isNaN(cantidad)) {
    tratamientos.push({ tratamiento, costo, cantidad, dientes });
    actualizarTabla();
    document.getElementById("tratamiento").value = "";
    document.getElementById("costo").value = "";
    document.getElementById("cantidad").value = "";
    document.getElementById("dientes").value = "";
  } else {
    Swal.fire({
      title: "Faltan datos",
      text: "Por favor, ingresa un tratamiento, costo y cantidad válidos.",
      icon: "error"
    });
  }
}
// (Datos y deteccion de clinica: componente UNICO window.Clinica — ver clinica.js)
function eliminarTratamiento(index) {
  tratamientos.splice(index, 1);
  actualizarTabla();
}

function actualizarTabla() {
  const tabla = document.getElementById("tablaTratamientos").getElementsByTagName("tbody")[0];
  tabla.innerHTML = ""; 
  let total = 0;

  tratamientos.forEach((item, index) => {
    const fila = tabla.insertRow();
    fila.insertCell(0).innerText = item.tratamiento;
    fila.insertCell(1).innerText = item.dientes.join(", ");
    fila.insertCell(2).innerText = item.cantidad;
    fila.insertCell(3).innerText = `€${item.costo.toFixed(2)}`;
    fila.insertCell(4).innerText = `€${(item.costo * item.cantidad).toFixed(2)}`;
    const celdaEliminar = fila.insertCell(5);
    celdaEliminar.innerHTML = `<i class="ri-delete-bin-line" style="cursor:pointer; font-size: 1.2em; background-color: red; color: white; padding: 4px; border-radius: 4px;" onclick="eliminarTratamiento(${index})"></i>`;
    celdaEliminar.style.textAlign = "center";
    total += item.costo * item.cantidad;
  });

  document.getElementById("total").innerText = `Total: €${total.toFixed(2)}`;
}

function seleccionarServicio(tratamiento, costo) {
  document.getElementById("tratamiento").value = tratamiento;
  document.getElementById("costo").value = costo;
}

// El odontograma ahora vive en el componente reutilizable window.Odontograma
// (app/js/modules/components/odontograma.js), cargado en presupuesto.html.

function imprimirPresupuesto() {
  const cliente = document.getElementById("clienteNo").value.trim() || "paciente";
  const observaciones = document.getElementById("observaciones").value;
  const medico = document.getElementById("medico").value;

   const clinic = clinicaActual; // clinica de la SESION (precargada por el componente unico)
  if (!clinic) {
    Swal.fire({ title: "Clínica no detectada", text: "No se pudo detectar tu clínica. Recarga la página e inténtalo de nuevo.", icon: "error" });
    return;
  }
  	console.log("Datos de la clínica:", clinic);

  const radios = document.querySelectorAll('input[name="desc"]');
  let valorDesc = 0;
  radios.forEach(radio => {
    if (radio.checked) valorDesc = parseFloat(radio.value);
  });

  let subTotal = tratamientos.reduce((sum, item) => sum + (item.costo * item.cantidad), 0);
  let Descuento = subTotal * (valorDesc / 100);
  let totalFinal = subTotal - Descuento;
  const fecha = new Date();
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const yyyy = fecha.getFullYear();
  const fechaEmision = `${dd}/${mm}/${yyyy}`;
  const obs = (observaciones && observaciones.trim()) ? observaciones : "Sin observaciones";
  // Importes en formato espanol (1.234,56 €).
  const fmt = (n) => n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  // Piezas incluidas en el presupuesto, para resaltarlas en el odontograma.
  const dientesSel = new Set(tratamientos.flatMap(t => (t.dientes || []).map(d => String(d).trim())));

  if (!cliente) {
    Swal.fire({
      title: "Faltan datos",
      text: "Por favor, ingresa un tratamiento, costo y cantidad válidos.",
      icon: "error"
    });
    return;
  }

  const contenidoHTML = `
  <html>
  <head>
    <title>Presupuesto ${cliente} · ${fechaEmision}</title>
    <link rel="icon" href="../../../assets/images/logoCompleto.jpg">
    <style>
      :root{
        --ink:#1f2937; --strong:#111827; --muted:#6b7280; --faint:#9ca3af;
        --line:#e5e7eb; --soft:#f9fafb; --soft2:#f3f4f6;
      }
      *{ box-sizing:border-box; }
      @page{ size:A4; margin:14mm; }
      body{
        font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;
        color:var(--ink); margin:0; font-size:12px; line-height:1.5;
        -webkit-print-color-adjust:exact; print-color-adjust:exact;
      }
      .doc{ max-width:760px; margin:0 auto; }

      .head{ display:flex; justify-content:space-between; align-items:flex-start; gap:20px; padding-bottom:14px; border-bottom:1px solid var(--line); }
      .head__logo{ height:72px; width:auto; }
      .head__clinic{ text-align:right; }
      .head__name{ font-size:14px; font-weight:700; color:var(--strong); }
      .head__meta{ font-size:11px; color:var(--muted); margin-top:2px; }

      .title{ display:flex; justify-content:space-between; align-items:baseline; margin:22px 0 16px; }
      .title h1{ font-size:20px; letter-spacing:.18em; color:var(--strong); margin:0; font-weight:700; }
      .title__date{ font-size:11px; color:var(--muted); }
      .title__date b{ color:var(--ink); font-weight:600; }

      .patient{ background:var(--soft); border:1px solid var(--line); border-radius:8px; padding:12px 16px; display:grid; grid-template-columns:1fr 1fr; gap:6px 24px; }
      .patient .row{ font-size:12px; }
      .patient .k{ color:var(--muted); font-weight:600; }
      .patient .full{ grid-column:1 / -1; }

      .odo{ text-align:center; margin:22px 0 6px; }
      .odo svg{ max-width:100%; height:auto; }
      .odo__cap{ font-size:9.5px; color:var(--faint); margin-top:8px; letter-spacing:.1em; text-transform:uppercase; }

      table{ width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
      thead th{ background:var(--soft2); color:#374151; text-align:left; padding:9px 10px; font-weight:600; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; border-bottom:2px solid var(--faint); }
      thead th.num{ text-align:right; }
      tbody td{ padding:9px 10px; border-bottom:1px solid var(--line); }
      tbody td.num{ text-align:right; white-space:nowrap; }

      .totals{ margin-top:16px; display:flex; justify-content:flex-end; }
      .totals__box{ width:290px; }
      .totals__row{ display:flex; justify-content:space-between; padding:6px 2px; font-size:12px; color:var(--muted); }
      .totals__row span:last-child{ color:var(--ink); }
      .totals__row.grand{ margin-top:6px; padding-top:10px; border-top:2px solid var(--strong); font-size:14px; font-weight:700; color:var(--strong); }
      .totals__row.grand span:last-child{ color:var(--strong); }

      .sign{ margin-top:40px; display:flex; justify-content:space-between; gap:48px; }
      .sign__line{ flex:1; text-align:center; font-size:11px; color:var(--muted); }
      .sign__line .ln{ border-top:1px solid var(--faint); margin-bottom:5px; height:36px; }

      .foot{ margin-top:22px; padding-top:10px; border-top:1px solid var(--line); font-size:9.5px; color:var(--faint); line-height:1.6; }
    </style>
  </head>
  <body>
    <div class="doc">
      <div class="head">
        <img class="head__logo" src="../../../assets/images/logoCompleto.jpg" alt="HS Dental El Greco">
        <div class="head__clinic">
          <div class="head__name">${clinic.nombre}</div>
          <div class="head__meta">NIF ${clinic.nif}</div>
          <div class="head__meta">${clinic.direccion}</div>
          <div class="head__meta">Tel. ${clinic.telefono}</div>
          <div class="head__meta">${clinic.email}</div>
        </div>
      </div>

      <div class="title">
        <h1>PRESUPUESTO</h1>
        <div class="title__date"><b>Fecha</b> ${fechaEmision}</div>
      </div>

      <div class="patient">
        <div class="row"><span class="k">Paciente:</span> ${cliente}</div>
        <div class="row"><span class="k">Sede:</span> ${clinic.ciudad}</div>
        <div class="row full"><span class="k">Observaciones:</span> ${obs}</div>
      </div>

      <div class="odo">
        ${window.Odontograma.svg(dientesSel)}
        <div class="odo__cap">Odontograma &middot; piezas del presupuesto resaltadas</div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Tratamiento</th>
            <th>Pieza(s)</th>
            <th class="num">Cant.</th>
            <th class="num">Precio ud.</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          ${tratamientos.map(item => `
            <tr>
              <td>${item.tratamiento}</td>
              <td>${item.dientes.join(", ") || "—"}</td>
              <td class="num">${item.cantidad}</td>
              <td class="num">${fmt(item.costo)}</td>
              <td class="num">${fmt(item.costo * item.cantidad)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>

      <div class="totals">
        <div class="totals__box">
          <div class="totals__row"><span>Subtotal</span><span>${fmt(subTotal)}</span></div>
          ${valorDesc > 0 ? `<div class="totals__row"><span>Descuento (${valorDesc}%)</span><span>&minus;${fmt(Descuento)}</span></div>` : ""}
          <div class="totals__row grand"><span>Total presupuestado</span><span>${fmt(totalFinal)}</span></div>
        </div>
      </div>

      <div class="sign">
        <div class="sign__line"><div class="ln"></div>Firma del profesional</div>
        <div class="sign__line"><div class="ln"></div>Firma del paciente</div>
      </div>

      <div class="foot">
        Presupuesto informativo sin validez contractual. Válido durante 30 días desde la fecha de emisión.
        Los importes pueden variar según el diagnóstico definitivo.
      </div>
    </div>
    <script>
      window.onload = function() {
        window.print();
      }
    </script>
  </body>
</html>
  `;

  const ventana = window.open("", "_blank");
  ventana.document.open();
  ventana.document.write(contenidoHTML);
  ventana.document.close();
}
