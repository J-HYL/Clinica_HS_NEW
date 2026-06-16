let tratamientos = [];

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
function getClinicInfo() {
  console.log("CLINIC:", window.CLINIC); // Esto imprimirá el valor en la consola
  switch (window.CLINIC) {
    case "clinic1":
      return {
        direccion: "Calle mayor 65 1B",
        telefono: "916 43 12 12 - 641 26 59 85",
        ciudad: "Alcorcón"
      };
    case "clinic2":
      return {
        direccion: "C/ Pintor el Greco 2 Bajo D",
        telefono: "916 18 24 24 - 678 48 45 39",
        ciudad: "Móstoles"
      };
    default:
      return {
        direccion: "Calle mayor 65 1B - C/ Pintor el Greco 2 Bajo D ",
        telefono: "916 43 12 12(Alc) - 916 18 24 24(Mts)",
        ciudad: "Alcorcón - Móstoles"
      };
  }
}
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

function imprimirPresupuesto() {
  const cliente = document.getElementById("clienteNo").value.trim() || "paciente";
  const observaciones = document.getElementById("observaciones").value;
  const medico = document.getElementById("medico").value;

   const clinic = getClinicInfo(); // Aquí obtenemos la clínica
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
  const fechaTexto = `${fecha.getDate().toString().padStart(2, "0")}-${(fecha.getMonth()+1).toString().padStart(2, "0")}`;

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
    <title>presupuesto-${cliente}-${fechaTexto}</title>
    <link rel="icon" href="../../../assets/images/logoCompleto.jpg">
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        margin: 20px;
      }
      .imagen-conteiner {
        text-align: center; 
      }
      img {
        display: inline-block; 
      }
      .direccion, .telefono {
        padding: 0%;
        margin: 0%;
        margin-bottom: -3px;
      }
      table {
        width: 100%;
        margin-top: 10px;
        border-collapse: collapse;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: rgb(157, 221, 246);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .total {
        font-weight: bold;
        text-align: right;
      }
      .odontograma-container {
        text-align: center;
        margin: 20px 0;
      }
      .odontograma {
        width: 650px;
        height: 200px;
      }
      .info {
        margin-bottom: -9px;
      }
    </style>
  </head>
  <body>
    <div class="imagen-conteiner">
      <img src="../../../assets/images/logoCompleto.jpg" alt="logo de la clinica" height="150px">
      <p class="direccion"><strong><small>${clinic.direccion}</small></strong></p>
      <p class="telefono"><strong><small>${clinic.telefono}</small></strong></p>
      <p class="direccion"><strong><small>${clinic.ciudad}</small></strong></p>
    </div>
    <p class="info"><strong>Nombre del paciente: </strong> ${cliente}</p>
    <p class="info"><strong>Fecha de la visita: </strong> ${new Date().toLocaleDateString()}</p>
    <!--<p class="info"><strong>Médico: </strong>${medico}</p>-->
    <p class="info"><strong>Observaciones:</strong> ${observaciones}</p>
    <div class="odontograma-container">
      <img class="odontograma" src="../../../assets/images/odontograma.jpg" alt="Odontograma">
    </div>
    <table>
      <thead>
        <tr>
          <th>Tratamiento</th>
          <th>Pieza</th>
          <th>Cantidad</th>
          <th>Precio Unidad</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${tratamientos.map(item => `
          <tr>
            <td>${item.tratamiento}</td>
            <td>${item.dientes.join(", ")}</td>
            <td>${item.cantidad}</td>
            <td>€${item.costo.toFixed(2)}</td>
            <td>€${(item.costo * item.cantidad).toFixed(2)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <p class="total"><strong>Sub-total: </strong> €${subTotal.toFixed(2)}</p>
    ${valorDesc > 0 ? `<p class="total"><strong>Descuento: </strong> ${valorDesc}%</p>` : ""}
    <p class="total"><strong>Total presupuestado:</strong> €${totalFinal.toFixed(2)}</p>
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
