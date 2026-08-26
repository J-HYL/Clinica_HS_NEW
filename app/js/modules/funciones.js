//funciones.js
import { validationFormConfig } from "./variables.js";
import {clientInput, form, formSubmit, inputs, serviceInput } from "./selectores.js";
import Alert from "./components/Alert.js";
import { openModal, openMedicoModal } from "./components/Modal.js";
import { createTableInstance } from "./components/Datatables.js";
import { hideSpinnerSection } from "./components/Spinner.js";
import DB from "./classes/DB_API.js";
import UI from "./classes/UI.js";
import { construirFacturaHtml } from "./components/facturaHtml.js";
import { escapeHtml } from "./html.js";

const URLParams = new URLSearchParams(window.location.search);
const requiredValidation = validationFormConfig.required;



//* Form Functions
export function validateInput(e){
    //Input Information
    const input = e.target;
    const inputValidationType = input.dataset.validate;
    const inputRequired = input.dataset.required === "true";
    const inputValue = input.value;

    // Required Validation
    if (inputRequired && !requiredValidation.validate(inputValue)) {
        Alert.showInputAlert(input, requiredValidation.message);
        return;
    }

    //Get the validation format/config in the object validationFormConfig based in the data-attribute validate
    if (inputValidationType) {
        const config = validationFormConfig[inputValidationType];
        if (config && !config.validate(inputValue)) {
            Alert.showInputAlert(input, config.message);
            return;
        }
    }

    // Clean the alert
    Alert.clearInputAlert(input);
}

export function validateForm(){
    for (const input of inputs) {
        const value = input.value;
        const isRequired = input.dataset.required === "true";
        const validationType = input.dataset.validate;

        // Required validation
        if (isRequired && !requiredValidation.validate(value)) {
            return false;
        }

        // Type Validation
        if (validationType) {
            const config = validationFormConfig[validationType];
            if (config && !config.validate(value)) {
                return false;
            }
        }
    }

    return true;
}

export function sendForm(e, objectStore = null){
    e.preventDefault();
    const isValid = validateForm();

    if (!isValid) {
        Alert.showStatusAlert("error", "¡Error!", "Por favor, corrige los errores antes de enviar el formulario.");
        return;
    }

    checkFormAction(objectStore);
}

// ---- Aquí sustituimos / integramos checkFormAction ----

function checkFormAction(objectStore) {
  const formAction = formSubmit.dataset.action;
  const id = getURLId();

  // Crear registro
  if (formAction === "create" && !id) {
    const payload = getFormData();
    DB.addRegister(objectStore, payload)
      .then(() => {
        Alert.showStatusAlert(
          "success",
          "¡Registro creado!",
          `El registro en "${objectStore}" se ha creado correctamente.`,
          reloadPage
        );
      })
      .catch(err => {
        Alert.showStatusAlert("error", "Error al crear", err.message);
      });

  // Editar registro
  } else if (formAction === "edit" && id) {
    const payload = getFormData();
    DB.editRecord(objectStore, id, payload)
      .then(() => {
        Alert.showStatusAlert(
          "success",
          "¡Registro actualizado!",
          `El registro en "${objectStore}" se ha actualizado correctamente.`,
          goToControlPage
        );
      })
      .catch(err => {
        Alert.showStatusAlert("error", "Error al actualizar", err.message);
      });

  // Acción no reconocida
  } else {
    Alert.showStatusAlert("error", "¡Error!", "La acción del formulario no es reconocida.", reloadPage);
  }
}

// ---- Fin de integración de checkFormAction ----

//Function to configure the form according to the action (add or edit)
export function configureActionForm(objectStore) {
    const id = getURLId();
    if (id) UI.showFormEditMode(objectStore, id);
}

export function getURLId() {
    if (!URLParams.size) return; // If there isn't url params return
    const id = URLParams.get("id");
    
    if (URLParams.size > 1 || !id) {
        goToControlPage();
        return;
    }

    return id;
}

//* Appointments Form
export function showSelectRecords(){
    const promises = [DB.getRecords("services"), DB.getRecords("clients")];
    Promise.all(promises)
        .then(([services, clients]) => {
            UI.createSelectOptions(services, serviceInput);
            UI.createSelectOptions(clients, clientInput);
        })
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage))
}

//* Datatables Functions

function displayRecordsInTable(records){
  if ($.fn.DataTable.isDataTable('#table')) {
    $('#table').DataTable().clear().destroy();
  }
    createTableInstance(records);
    hideSpinnerSection();
}

//Function to show the records in the datatable
export function showRecords(objectStore) {
    DB.getRecords(objectStore)
        .then(records => displayRecordsInTable(records))
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage))
}
export function showRecordsP(objectStore, id = null) {
     DB.getRecordsP(objectStore, id) // Usa getRecordsP y pasa el ID
        .then(records => displayRecordsInTable(records))
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage))
}

// Trae solo los tratamientos del paciente (en vez de la tabla completa de la
// clinica) para la vista de historia clinica.
export function showTreatmentsByClientId(clientId) {
    return DB.getTreatmentsByClientId(clientId)
        .then(records => displayRecordsInTable(records))
        .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage))
}

export function getAppointments(callback = displayRecordsInTable) {
  DB.getRecords("appointments")
    .then(appointments => {
      // Fecha de hoy en formato local 'YYYY-MM-DD' para comparar por día.
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      const rows = appointments
        // Solo citas de hoy en adelante (compara la parte 'YYYY-MM-DD').
        // El orden ISO coincide con el cronológico y descarta '0000-00-00'.
        .filter(app => app.fecha && app.fecha.slice(0, 10) >= todayStr)
        .map(app => ({
          id:      app.id,
          Paciente: app.servicio,
          Observaciones: app.cliente,
          fecha:   app.fecha.split("T").join(" "),
          medico:  app.medico,
          estado:  app.estado
        }));
      callback(rows);
    })
    .catch(error => Alert.showStatusAlert("error", "¡Error!", error.message, reloadPage));
}

//Function to set up the table event listeners
export function setTableEventsListeners(e, objectStore, foreignKeyPropertie = null) {
  const button = e.target.closest("button");
  if (!button) return;
  const id = button.dataset.id;

  if (button.classList.contains("table__btn--edit")) {
    openEdition(id);
  } else if (button.classList.contains("table__btn--delete")) {
    Alert.showConfirmationAlert(objectStore, id, foreignKeyPropertie);
  } else if (button.classList.contains("table__status")) {
    openModal();
    UI.showRecordModal(id);
  } else if (button.classList.contains("table__medico")) {
    openMedicoModal();
    UI.showMedicoModal(id);
  } else if (button.classList.contains("table__btn--extra")) { 
    // Redirige a la página de historia clínica pasando el ID del paciente
    window.location.href = `historia-clinica.html?id=${id}`;
  }else if (button.classList.contains("table__btn--treatments")) {
    // Redirige a la página de tratamientos pasando el ID del tratamiento
    window.location.href = `tratamientos.html?id=${id}`;
  }else if (button.classList.contains("table__btn--print")){
    //aqui hay q implementar la funcionalidad de imprimir comprobante de pago
    printPaymentReceipt(id);
  } else if (button.classList.contains("table__btn--factura")) {
    generarFacturaDePago(id);
  } else if (button.classList.contains("table__btn--invite")) {
    invitarPortal(id);
  }
}

// Invita a un paciente al Portal de Pacientes: confirma y llama a
// /api/invitar_portal.php, que crea la cuenta y envia el email de activacion.
async function invitarPortal(clientId) {
  let cliente;
  try {
    cliente = await DB.getRecord("clients", clientId);
  } catch (e) {
    Swal.fire("Error", "No se pudo cargar el paciente.", "error");
    return;
  }
  const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  let email = (cliente && cliente.email ? String(cliente.email) : "").trim();

  // Sin email válido -> pedirlo en un modal (un solo input) y guardarlo en la ficha
  // antes de invitar (invitar_portal.php lee el email desde clients).
  if (!email || email.toLowerCase() === "no proporcionado" || !emailValido(email)) {
    const { value: nuevo } = await Swal.fire({
      title: "Email del paciente",
      text: "Este paciente no tiene email. Introdúcelo para enviarle la invitación al portal.",
      input: "email",
      inputPlaceholder: "paciente@ejemplo.com",
      showCancelButton: true,
      confirmButtonText: "Guardar y continuar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#5671eb",
      inputValidator: (v) => (!v || !emailValido(v.trim()) ? "Introduce un email válido" : undefined),
    });
    if (!nuevo) return;
    email = nuevo.trim();
    try {
      await DB.editRecord("clients", Number(clientId), { email });
    } catch (e) {
      Swal.fire("Error", "No se pudo guardar el email del paciente.", "error");
      return;
    }
  }
  const conf = await Swal.fire({
    icon: "question",
    title: "Invitar al portal",
    text: `Se enviará un email de acceso al portal a ${cliente.nombre || "el paciente"} (${email}).`,
    showCancelButton: true,
    confirmButtonText: "Enviar invitación",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#5671eb",
  });
  if (!conf.isConfirmed) return;

  Swal.fire({ title: "Enviando invitación…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const res = await fetch("/api/invitar_portal.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ client_id: Number(clientId) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || "No se pudo enviar la invitación.");
    Swal.fire({ icon: "success", title: "¡Listo!", text: data.message || "Invitación enviada." });
  } catch (e) {
    Swal.fire("Error", e.message, "error");
  }
}

// Genera la FACTURA de un pago (boton junto al de recibo) y la GUARDA en el
// servidor —a diferencia del recibo, que solo imprime—. Reutiliza la plantilla
// unica de facturaHtml.js y el endpoint DB.php?table=facturas (PDF + fila en
// `facturas`). Tras generarla, ofrece avisar al paciente (email + notificacion en
// el portal) via facturas_solicitudes.php, que ademas marca como 'generada' la
// solicitud del portal si la hubiera.
async function generarFacturaDePago(paymentId) {
  let payment, treatment, client, clinic;
  try {
    payment = await DB.getRecord("payments", paymentId);
    if (!payment) throw new Error("No se encontró el pago.");
    treatment = await DB.getRecord("treatments", payment.treatment_id);
    if (!treatment) throw new Error("No se encontró el tratamiento asociado.");
    client = await DB.getRecord("clients", payment.client_id);
    if (!client) throw new Error("No se encontró el paciente asociado.");
    clinic = await window.Clinica.actual();
    if (!clinic) throw new Error("No se pudo detectar la clínica de la sesión.");
  } catch (e) {
    Swal.fire("Error", e.message || "No se pudieron cargar los datos del pago.", "error");
    return;
  }

  // OJO: la columna del importe es 'monto' (no 'monto_pagado'). Ver CLAUDE.md.
  const importe = parseFloat(payment.monto || 0);
  const concepto = treatment.diagnostico || "Tratamiento dental";
  const metodo = payment.metodo_pago || "";

  // Datos fiscales extra: la normativa española los exige si la factura >= 400 €.
  let dni = "", domicilio = "";
  if (importe >= 400) {
    const { value: datos } = await Swal.fire({
      title: "Factura ≥ 400 €",
      html:
        '<p style="font-size:14px;margin:0 0 10px">La normativa exige <strong>DNI/NIF</strong> y <strong>domicilio</strong> del paciente.</p>' +
        '<input id="swal-dni" class="swal2-input" placeholder="DNI/NIF">' +
        '<input id="swal-dom" class="swal2-input" placeholder="Domicilio">',
      showCancelButton: true,
      confirmButtonText: "Generar factura",
      cancelButtonText: "Cancelar",
      preConfirm: () => ({
        dni: (document.getElementById("swal-dni").value || "").trim(),
        dom: (document.getElementById("swal-dom").value || "").trim(),
      }),
    });
    if (!datos) return;                 // cancelado
    dni = datos.dni; domicilio = datos.dom;
  } else {
    const conf = await Swal.fire({
      icon: "question",
      title: "Generar factura",
      html: `Se generará la factura de este pago:<br><strong>${escapeHtml(concepto)}</strong><br>Importe: <strong>${importe.toFixed(2)} €</strong>`,
      showCancelButton: true,
      confirmButtonText: "Generar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#5671eb",
    });
    if (!conf.isConfirmed) return;
  }

  Swal.fire({ title: "Generando factura…", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  let numero, ruta;
  try {
    // Numero orientativo para el HTML; el servidor asigna el real (MAX+1).
    const resNum = await fetch("/api/DB.php?table=facturas", { credentials: "include" });
    const dataNum = await resNum.json();
    const numeroFactura = (dataNum.ultimoNumero || 0) + 1;

    const facturaHtml = construirFacturaHtml({
      clinic,
      numeroFactura,
      paciente: { nombre: client.nombre, dni, telefono: client.telefono || "", domicilio },
      lineas: [{ descripcion: concepto, cantidad: 1, precio: importe }],
      paymentMethod: metodo,
      observaciones: "",
      descuento: 0,
    });

    const formData = new FormData();
    formData.append("nombre_paciente", client.nombre || "");
    formData.append("html", facturaHtml);
    const resPost = await fetch("/api/DB.php?table=facturas", { method: "POST", body: formData, credentials: "include" });
    const dataPost = await resPost.json();
    if (!dataPost.success) throw new Error(dataPost.error || "No se pudo guardar la factura.");
    numero = dataPost.numero || numeroFactura;
    ruta = dataPost.ruta;
  } catch (e) {
    Swal.fire("Error", "No se pudo generar la factura: " + e.message, "error");
    return;
  }

  const prefijo = clinic.inicial || "GEN";
  const aviso = await Swal.fire({
    icon: "success",
    title: "Factura generada",
    html: `Factura <strong>HSD-${prefijo}-${numero}</strong> guardada.<br>¿Avisar al paciente?`,
    showCancelButton: true,
    confirmButtonText: "Sí, avisar",
    cancelButtonText: "No",
    confirmButtonColor: "#34c759",
  });

  // Registrar SIEMPRE la generacion (marca la solicitud del portal como 'generada'
  // si existia, o crea la fila 'generada' para que el portal muestre "emitida").
  // El aviso (email + notificacion) va solo si la clinica lo confirma.
  try {
    const resReg = await fetch("/api/facturas_solicitudes.php?accion=registrar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ payment_id: Number(paymentId), factura_numero: Number(numero), avisar: !!aviso.isConfirmed }),
    });
    const dataReg = await resReg.json().catch(() => ({}));
    if (aviso.isConfirmed) {
      if (!resReg.ok || dataReg.error) {
        Swal.fire("Aviso", "La factura se generó, pero no se pudo avisar al paciente: " + (dataReg.error || ""), "warning");
      } else {
        Swal.fire({ icon: "success", title: "Paciente avisado", text: dataReg.message || "", timer: 1800, showConfirmButton: false });
      }
    }
  } catch (e) {
    // Best-effort: la factura ya está guardada aunque el registro/aviso falle.
    console.error("registrar factura:", e);
  }

  const pdfUrl = ruta || `/uploads/facturas/factura_HSD-${prefijo}-${numero}.pdf`;
  window.open(pdfUrl, "_blank");

  // Sustituye "Generar factura" por "Descargar factura" en esa fila (sin recargar).
  const btnFac = document.querySelector(`.table__btn--factura[data-id="${paymentId}"]`);
  if (btnFac) {
    const fila = btnFac.closest("tr");
    const a = document.createElement("a");
    a.className = "table__btn table__btn--descargar";
    a.href = pdfUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "Descargar factura");
    a.innerHTML = '<i class="ri-download-2-line"></i>';
    btnFac.replaceWith(a);
    const badge = fila && fila.querySelector(".fact-badge");
    if (badge) { badge.className = "fact-badge fact-badge--done"; badge.textContent = "Emitida"; }
  }
}

async function printPaymentReceipt(paymentId) {
    try {
        // 1. Fetch the payment record
        const payment = await DB.getRecord("payments", paymentId);
        if (!payment) {
            Swal.fire("Error", "No se encontró el pago.", "error");
            return;
        }

        // 2. Fetch the associated treatment record
        const treatment = await DB.getRecord("treatments", payment.treatment_id);
        if (!treatment) {
            Swal.fire("Error", "No se encontró el tratamiento asociado al pago.", "error");
            return;
        }

        // 3. Fetch the associated client record
        const client = await DB.getRecord("clients", payment.client_id);
        if (!client) {
            Swal.fire("Error", "No se encontró el cliente asociado al pago.", "error");
            return;
        }

        // 4. Prepare the content for printing
        const printContent = `
            <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #ccc; border-radius: 8px;">
              <h2 style="text-align: center; color: #333;">Comprobante de Pago</h2>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">

              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                      <td><strong>Fecha de Emisión:</strong></td>
                      <td>${new Date().toLocaleDateString()}</td>
                  </tr>
                  <tr>
                      <td><strong>ID de Pago:</strong></td>
                      <td>${payment.id}</td>
                  </tr>
              </table>

              <br>

              <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Detalles del Paciente</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                      <td><strong>Nombre del Paciente:</strong></td>
                      <td>${client.nombre}</td>
                  </tr>
              </table>

              <br>

              <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Detalles del Tratamiento</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                      <td><strong>Nombre del Tratamiento:</strong></td>
                      <td>${treatment.diagnostico}</td>
                  </tr>
                  <tr>
                      <td><strong>Costo Total del Tratamiento:</strong></td>
                      <td>${parseFloat(treatment.monto_total || 0).toFixed(2)}€</td>
                  </tr>
              </table>

              <br>

              <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Detalles del Pago</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                      <td><strong>Monto Pagado:</strong></td>
                      <td>${parseFloat(payment.monto || 0).toFixed(2)}€</td>
                  </tr>
                  <tr>
                      <td><strong>Método de Pago:</strong></td>
                      <td>${payment.metodo_pago}</td>
                  </tr>
                  <tr>
                      <td><strong>Notas:</strong></td>
                      <td>${payment.notas || 'N/A'}</td>
                  </tr>
                  <tr>
                      <td><strong>Fecha del Pago:</strong></td>
                      <td>${new Date(payment.fecha_pago).toLocaleDateString()} ${new Date(payment.fecha_pago).toLocaleTimeString()}</td>
                  </tr>
              </table>

              <br>

              <h3 style="border-bottom: 1px solid #eee; padding-bottom: 5px;">Estado de la Deuda</h3>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                      <td><strong>Monto Pagado Total:</strong></td>
                      <td>${parseFloat(treatment.monto_pagado || 0).toFixed(2)}€</td>
                  </tr>
                  <tr>
                      <td><strong>Deuda Restante:</strong></td>
                      <td>${parseFloat(treatment.deuda || 0).toFixed(2)}€</td>
                  </tr>
              </table>
            </div>
        `;

        // 5. Open a new window and print the content
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printContent);
        printWindow.document.close();
        printWindow.print();

    } catch (error) {
        console.error("Error al generar el comprobante de pago:", error);
        Swal.fire("Error", "No se pudo generar el comprobante de pago. Inténtalo de nuevo.", "error");
    }
}

//Function to go to edit page
function openEdition(id) {
    window.location.href = `agregar.html?id=${id}`;
}


export function getFormData() {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData);
    
    // DEBUG: Ver qué está pasando
    console.log("getFormData() ejecutada");
    console.log("Payload en getFormData():", payload);
    
    // Verificar fecha específicamente
    const fechaInput = document.getElementById("fecha");
    console.log("Input fecha en getFormData():", fechaInput?.value);
    console.log("Fecha en payload:", payload.fecha);
    
    // Si la fecha está vacía, intentar obtenerla directamente
    if (!payload.fecha && fechaInput?.value) {
        console.log("Fecha vacía en payload, usando valor del input");
        payload.fecha = fechaInput.value;
    }
    
    return payload;
}

export function reloadPage() {
    window.location.reload();
}

export function goToControlPage() {
    window.location.href = "./control.html";
}

export function formatTitle(title){
    return title.charAt(0).toUpperCase() + title.slice(1).replace(/_/g, ' ');
}

// Formatea una fecha de BD ('YYYY-MM-DD[ T]HH:MM[:SS]' o 'YYYY-MM-DD') al
// formato de Windows español: 'DD/MM/YYYY' o 'DD/MM/YYYY HH:MM'.
// Trabaja sobre el string (sin new Date) para no desfasar por zona horaria.
export function formatFecha(value){
    if (!value) return "";
    const [datePart, timePart = ""] = String(value).replace("T", " ").split(" ");
    const [y, m, d] = datePart.split("-");
    if (!y || !m || !d) return String(value); // formato no reconocido
    if (y === "0000") return "";              // fecha basura ('0000-00-00')
    let out = `${d}/${m}/${y}`;
    const [hh, mm] = timePart.split(":");
    if (hh && mm) out += ` ${hh}:${mm}`;
    return out;
}

//* Calendar Functions
export function formatDateString(date){
    const dateString = new Date(date).toLocaleDateString("co-CO", {
        month: 'long',
        day: 'numeric',
    });
    const dateStringSplitted = dateString.split(" ");

    // Solo aplicar capitalización si existe la tercera parte, 
    // si no, retornar una versión segura:
    if (dateStringSplitted.length > 2 && dateStringSplitted[2]) {
        dateStringSplitted[2] = dateStringSplitted[2].charAt(0).toUpperCase() + dateStringSplitted[2].slice(1);
        return dateStringSplitted.join(" ");
    } else {
        // Para móvil o cuando falte esa parte:
        const dateObj = new Date(date);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleString("es-CO", { month: 'long' });
        const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);
        return `${day} ${monthCapitalized}`;
    }
}

export function formatTime(date) {
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const timePeriod = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${timePeriod}`;
}
export function toCustomISOFormat(date) {
    return date.toISOString().slice(0, 16);
}
export function getDailyRange(){
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    return [todayStr + "T00:00", todayStr + "T23:59"];
}
export function formatDateRange(range) {
    const [start, end] = range.map(d => d.toISOString().split("T")[0]);
    return [start + "T00:00", end + "T23:59"];
}