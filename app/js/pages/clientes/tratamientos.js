// /js/pages/clientes/tratamientos.js

import DB from "../../modules/classes/DB_API.js";
import { showRecordsP, setTableEventsListeners } from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";

const crearPagoBtn = document.getElementById("crear-pago");
const modal = document.getElementById("edit-modal");
const guardarPagoBtn = document.getElementById("guardar-pago");

// Variables globales para almacenar los IDs
let currentTreatmentId = null;
let currentClientId = null;

const inputMontoPago = document.getElementById("monto");
const selectMetodoPago = document.getElementById("metodo_pago");
const inputNotasPago = document.getElementById("notas");


if (crearPagoBtn) {
    crearPagoBtn.addEventListener("click", (e) => {
      e.preventDefault();
      console.log("Botón crear pago clickeado"); // Para depuración
      limpiarFormularioPago();
      modal.show();
    });
  } else {
    console.error("No se encontró el botón crear-pago");
  }

document.querySelector(".modal__close").addEventListener("click", () => {
  modal.close();
  limpiarFormularioPago();
});

// Cerrar con botón Cancelar
document.querySelector(".modal__button--close").addEventListener("click", () => {
  modal.close();
  limpiarFormularioPago();
});

// Función para limpiar el formulario (renombrada para evitar conflictos con original si existe)
function limpiarFormularioPago() {
  if (inputMontoPago) inputMontoPago.value = "";
  if (selectMetodoPago) selectMetodoPago.value = "efectivo";
  if (inputNotasPago) inputNotasPago.value = "";
}

// Función para validar el formulario (renombrada)
function validarFormularioPago() {
  const monto = inputMontoPago.value;
  const metodo_pago = selectMetodoPago.value;

  if (!monto || isNaN(parseFloat(monto)) || parseFloat(monto) <= 0) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "El monto debe ser un número válido mayor a 0",
    });
    return false;
  }

  if (!metodo_pago) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Debe seleccionar un método de pago",
    });
    return false;
  }

  return true;
}

// Función para guardar el pago
async function guardarPago() {
  if (!validarFormularioPago()) return;

  if (!currentTreatmentId || !currentClientId) {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron obtener los datos del tratamiento",
    });
    return;
  }

  const monto = parseFloat(inputMontoPago.value);
  const metodo_pago = selectMetodoPago.value;
  const notas = inputNotasPago.value || "";

  const pagoData = {
    treatment_id: currentTreatmentId,
    client_id: currentClientId,
    monto_pagado: monto, // Asegúrate de que el nombre de la columna en tu BD sea 'monto_pagado' o 'monto'
    metodo_pago: metodo_pago,
    notas: notas
  };

  try {
    Swal.fire({
      title: 'Guardando pago...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    await DB.addRegister("payments", pagoData);

    modal.close();
    limpiarFormularioPago();

    // Aquí, usa showRecords con el currentTreatmentId para cargar solo los pagos de ese tratamiento
    await showRecordsP("payments", currentTreatmentId);


    // Actualizar la información del tratamiento (deuda)
    // Esta función actualizará los spans si existen, sin causar error si no.
    await actualizarDeudaTratamientoUI(currentTreatmentId);

    Swal.fire({
      icon: "success",
      title: "¡Éxito!",
      text: "El pago se ha guardado correctamente",
    });

  } catch (error) {
    console.error("Error al guardar el pago:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo guardar el pago. Inténtalo de nuevo.",
    });
  }
}

// Función para actualizar la deuda del tratamiento en la UI
// Mantiene los 'if (element)' para evitar errores si los spans no existen en tu HTML
async function actualizarDeudaTratamientoUI(treatmentId) {
  try {
    const treatmentData = await DB.getRecord("treatments", treatmentId);

    if (treatmentData) {
      const deudaSpan = document.getElementById("deuda-tratamiento");
      const costoSpan = document.getElementById("costo-tratamiento"); // Asume que tienes un span con este ID para el monto total
      const pagadoSpan = document.getElementById("pagado-tratamiento"); // Asume que tienes un span con este ID para el monto pagado
      const deudah3 = document.getElementById("deuda-h3"); // Asume que tienes un h3 con este ID para la deuda

      const montoTotal = parseFloat(treatmentData.monto_total || 0).toFixed(2);
      const nuevoMontoPagado = parseFloat(treatmentData.monto_pagado || 0).toFixed(2);
      const nuevaDeuda = parseFloat(treatmentData.deuda || 0).toFixed(2); // Asume que la deuda ya la calcula el backend

      if (costoSpan) costoSpan.textContent = `${montoTotal}€`;
      if (pagadoSpan) pagadoSpan.textContent = `${nuevoMontoPagado}€`;
      if (deudaSpan) deudaSpan.textContent = `${nuevaDeuda}€`;
      if (deudah3) deudah3.textContent = `Deuda: ${nuevaDeuda}€`;

      // También actualiza los otros spans de información del tratamiento si existen
      const nombrePacienteSpan = document.getElementById("nombre-paciente");
      if (nombrePacienteSpan && treatmentData.client_id) {
         const clientData = await DB.getRecord("clients", treatmentData.client_id);
         if (clientData) nombrePacienteSpan.textContent = `${clientData.nombre}`;
      }

      const nombreTratamientoSpan = document.getElementById("nombre-tratamiento");
      if (nombreTratamientoSpan) nombreTratamientoSpan.textContent = treatmentData.diagnostico || 'N/A';

      const fechaTratamientoSpan = document.getElementById("fecha-inicio-tratamiento");
      if (fechaTratamientoSpan) fechaTratamientoSpan.textContent = treatmentData.fecha_creacion;

      const estadoTratamientoSpan = document.getElementById("estado-tratamiento");
      if (estadoTratamientoSpan) estadoTratamientoSpan.textContent = treatmentData.estado || 'N/A';

      const observacionesTratamientoSpan = document.getElementById("observaciones-tratamiento");
      if (observacionesTratamientoSpan) observacionesTratamientoSpan.textContent = treatmentData.observaciones || 'Sin observaciones';

    }
  } catch (error) {
    console.error("Error al actualizar la deuda o info del tratamiento en UI:", error);
    // No mostrar Swal aquí para no interrumpir si solo faltan los spans de UI
  }
}

// Función para eliminar un pago (se mantiene)
async function handleDeletePayment(paymentId) {
    if (confirm("¿Estás seguro de que quieres eliminar este pago?")) {
        try {
            await DB.deleteRecord("payments", paymentId);
            Swal.fire("Eliminado", "El pago ha sido eliminado.", "success");
            // Recargar los pagos y actualizar la deuda después de eliminar
            await showRecordsP("payments", currentTreatmentId);
            await actualizarDeudaTratamientoUI(currentTreatmentId);
        } catch (error) {
            console.error("Error al eliminar pago:", error);
            Swal.fire("Error", `No se pudo eliminar el pago: ${error.message || error}.`, "error");
        }
    }
}


// Event listener para el botón guardar
guardarPagoBtn.addEventListener("click", guardarPago);

// Delegación de eventos para editar/eliminar (se mantiene)
table.addEventListener("click", e => {
  // Si tienes botones de eliminar con data-type="delete-payment"
  if (e.target.dataset.type === "delete-payment") {
     const paymentId = e.target.dataset.id;
     handleDeletePayment(paymentId);
  } else {
     // Usa setTableEventsListeners para otras acciones si corresponde
     setTableEventsListeners(e, "payments");
  }
});
  const uploadBtn = document.getElementById("uploadBtn");
  const pdfUpload = document.getElementById("pdfUpload");
  const fileInfo = document.getElementById("fileInfo");
  const fileName = document.getElementById("fileName");

  const uploadImageBtn = document.getElementById("uploadImageBtn");
  const imageInput = document.getElementById("imageInput");
  const imagePreviewContainer = document.getElementById("imagePreviewContainer");
  const modalI = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  const closeModal = document.querySelector(".modal .close");

  // Función para subir archivos (imágenes o PDFs)
async function uploadFile(file, type) {
  if (!currentTreatmentId || !currentClientId) {
    throw new Error("No se ha seleccionado un tratamiento o cliente válido");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("client_id", currentClientId);
  formData.append("tratamiento_id", currentTreatmentId);
  formData.append("descripcion", type === "pdf" ? "Presupuesto del tratamiento" : "Imagen del tratamiento");

  try {
    const response = await DB.uploadFile("images", formData);
    return response;
  } catch (error) {
    console.error("Error al subir archivo:", error);
    throw error;
  }
}

// Manejo de PDFs
uploadBtn.addEventListener("click", () => {
  pdfUpload.click();
});

pdfUpload.addEventListener("change", async () => {
  const file = pdfUpload.files[0];
  if (file && file.type === "application/pdf") {
    try {
      Swal.fire({
        title: 'Subiendo PDF...',
        didOpen: () => Swal.showLoading()
      });
      
      await uploadFile(file, "pdf");
      
      // Actualizar la visualización
      await loadExistingFiles();
      
      Swal.fire({
        icon: "success",
        title: "¡PDF subido!",
        text: "El presupuesto se ha guardado correctamente"
      });
    } catch (error) {
      console.error("Error al subir PDF:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo subir el PDF. Inténtalo de nuevo."
      });
    }
  } else {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Por favor, selecciona un archivo PDF válido."
    });
  }
});

// Manejo de imágenes
uploadImageBtn.addEventListener("click", () => {
  imageInput.click();
});

imageInput.addEventListener("change", async () => {
  const file = imageInput.files[0];
  if (file && file.type.startsWith("image/")) {
    try {
      Swal.fire({
        title: 'Subiendo imagen...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const response = await uploadFile(file, "imagen");
      
      const reader = new FileReader();
      reader.onload = function(e) {
        const imageCard = document.createElement("div");
        imageCard.classList.add("image-card");

        const img = document.createElement("img");
        img.src = e.target.result;
        img.alt = file.name;

        // Evento para abrir la imagen en grande
        img.addEventListener("click", () => {
          modalImage.src = e.target.result;
          modalI.style.display = "flex";
        });

        imageCard.appendChild(img);
        imagePreviewContainer.appendChild(imageCard);
      };
      reader.readAsDataURL(file);
      
      Swal.fire({
        icon: "success",
        title: "¡Éxito!",
        text: "La imagen se ha subido correctamente",
      });
    } catch (error) {
      console.error("Error al subir imagen:", error);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: "No se pudo subir la imagen. Inténtalo de nuevo.",
      });
    }
  } else {
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "Por favor, selecciona una imagen válida.",
    });
  }
});

// Cerrar modal
closeModal.addEventListener("click", () => {
  modalI.style.display = "none";
});

// Función para cargar imágenes existentes al cargar la página
async function loadExistingFiles() {  // Cambiamos el nombre a algo más genérico
  try {
    // Cargar tanto imágenes como PDFs
    const files = await DB.getRecordsP("images", currentTreatmentId);
    
    // Limpiar contenedores
    imagePreviewContainer.innerHTML = '';
    fileInfo.style.display = 'none';
    
    files.forEach(file => {
      if (file.tipo === "imagen") {
        // Código existente para imágenes...
        const imageCard = document.createElement("div");
        imageCard.classList.add("image-card");

        const img = document.createElement("img");
        // Construye la ruta COMPLETA y CORRECTA
        const imageUrl = `https://app.hsdental.es/${file.ruta}`.replace(/([^:])(\/\/+)/g, '$1/');
        img.src = imageUrl;
        img.alt = "Imagen de tratamiento";
        img.style.cursor = "pointer";

        // Asigna el evento click CORRECTAMENTE
        img.addEventListener('click', () => {
          const modalImg = document.getElementById("modalImage");
          if (modalImg) {
            // Usa la MISMA ruta ya verificada
            modalImg.src = imageUrl;
            document.getElementById("imageModal").style.display = "flex";
            
            // Depuración
            console.log("Modal abierto con imagen:", imageUrl);
          } else {
            console.error("No se encontró el elemento modalImage");
          }
        });

        imageCard.appendChild(img);
        imagePreviewContainer.appendChild(imageCard);
      } 
      else if (file.tipo === "pdf") {
    // Mostrar PDF en el área de presupuesto
    fileInfo.style.display = "flex";
    fileInfo.style.alignItems = "center"; // Añadido para alinear verticalmente
    fileInfo.style.gap = "5px"; // Añadido para espacio consistente
    
    // Limpiar y añadir nuevo contenido
    fileInfo.innerHTML = `
        <span style="font-size: 1.2rem;">📄</span>
        <span id="fileName" style="word-break: break-word; flex-grow: 1;">${file.nombre_original}</span>
    `;
    
    // Botón de descarga (manteniendo tu estilo original)
    const pdfLink = document.createElement("a");
    pdfLink.href = `https://app.hsdental.es/${file.ruta}`;
    pdfLink.target = "_blank";
    pdfLink.download = file.nombre_original;
    pdfLink.innerHTML = '<i class="ri-file-download-fill" style="font-size: x-large; text-decoration: none;"></i>';
    pdfLink.style.marginLeft = "10px";
    fileInfo.appendChild(pdfLink);
    
    // Botón de eliminar (estilo similar al de descarga)
    const deleteBtn = document.createElement("button");
    deleteBtn.innerHTML = '<i class="ri-delete-bin-fill" style="font-size: x-large; color: #ff3d3d;"></i>';
    deleteBtn.style.background = "none";
    deleteBtn.style.border = "none";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.padding = "0";
    deleteBtn.style.marginLeft = "5px";
    fileInfo.appendChild(deleteBtn);
    
    // Evento para eliminar
    deleteBtn.onclick = async () => {
        const confirm = await Swal.fire({
            title: '¿Eliminar PDF?',
            text: "Esta acción no se puede deshacer",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar'
        });

        if (confirm.isConfirmed) {
            try {
                await DB.deleteRecord("images", file.id);
                await loadExistingFiles(); // Recargar la lista
                Swal.fire('¡Eliminado!', 'El PDF ha sido eliminado.', 'success');
            } catch (error) {
                console.error("Error al eliminar PDF:", error);
                Swal.fire('Error', 'No se pudo eliminar el PDF', 'error');
            }
        }
    };
}
    });
  } catch (error) {
    console.error("Error al cargar archivos:", error);
  }
}

// Variables para almacenar los dientes afectados y completados
let dientesAfectados = []; // Dientes con piece_status = 0 (afectados/pendientes)
let dientesCompletados = []; // Dientes con piece_status = 1 (completados)

const dientesSuperior = [
  18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28
];
const dientesInferior = [
  48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38
];

function crearDiente(numero) { // Eliminamos el parámetro esInferior ya que no afecta la lógica de marcado
  const diente = document.createElement("div");
  diente.classList.add("diente");

  // Añadir la clase 'marcado-verde' si está completado
  if (dientesCompletados.includes(numero)) {
    diente.classList.add("marcado-verde");
  }
  // Añadir la clase 'marcado-rojo' si está afectado y no completado
  else if (dientesAfectados.includes(numero)) {
    diente.classList.add("marcado-rojo");
  }

  const num = document.createElement("div");
  num.classList.add("numero");
  num.textContent = numero;

  diente.appendChild(num);
  return diente;
}

const filaSuperior = document.getElementById("fila-superior");
const filaInferior = document.getElementById("fila-inferior");

// Limpiar los dientes existentes antes de volver a renderizar
if (filaSuperior) filaSuperior.innerHTML = '';
if (filaInferior) filaInferior.innerHTML = '';

// Mover la lógica de renderizado a una función para ser llamada después de que se obtengan los datos
function renderOdontograma() {
  if (filaSuperior) {
    dientesSuperior.forEach(n => filaSuperior.appendChild(crearDiente(n)));
  }
  if (filaInferior) {
    dientesInferior.forEach(n => filaInferior.appendChild(crearDiente(n)));
  }
}


document.addEventListener("DOMContentLoaded", async () => { 

  const params = new URLSearchParams(window.location.search); 
  const treatmentId = params.get("id");

  if (!treatmentId) {
    console.error("No se encontró ID de tratamiento en la URL.");
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se encontró el ID del tratamiento en la URL",
    });
    return;
  }

  // Guardar el ID del tratamiento en la variable global
  currentTreatmentId = treatmentId;

  try {
    // Obtener los datos del tratamiento específico
    const treatmentData = await DB.getRecord("treatments", currentTreatmentId);

    if (!treatmentData) {
      console.warn(`No se encontró tratamiento con ID: ${currentTreatmentId}`);
      Swal.fire({
        icon: "warning",
        title: "Advertencia",
        text: "No se encontró el tratamiento especificado",
      });
      return;
    }

    // Guardar el ID del cliente en la variable global
    currentClientId = treatmentData.client_id;

    // Actualizar la información del tratamiento y paciente en la UI
    // Esto llamará a document.getElementById y solo actualizará si el elemento existe.
    await actualizarDeudaTratamientoUI(currentTreatmentId);

    // Cargar los pagos relacionados con este tratamiento usando showRecords
    await showRecordsP("payments", currentTreatmentId);
    setTimeout(() => {
      const dataTable = $('#table').DataTable();
      dataTable.columns([1, 2]).visible(false);
    }, 200);
    await loadExistingFiles(); 

    

    // NUEVA LÓGICA PARA CARGAR Y PINTAR DIENTES DEL ODONTOGRAMA
    const piecesData = await DB.getPiecesByTreatmentId(currentTreatmentId);
    dientesAfectados = []; // Resetear antes de rellenar
    dientesCompletados = []; // Resetear antes de rellenar

     console.log("Datos de piezas recibidos:", piecesData);

    piecesData.forEach(piece => {
      // *** CAMBIO CLAVE AQUÍ: Si el tooth_number es "General", marcar todos los dientes ***
      if (piece.tooth_number === "General") {
        const allTeeth = [...dientesSuperior, ...dientesInferior];
        if (piece.piece_status === 1) { // Asumiendo 1 para afectado/pendiente
            dientesAfectados = [...new Set([...dientesAfectados, ...allTeeth])];
        } else if (piece.piece_status === 0) { // Asumiendo 0 para completado
            dientesCompletados = [...new Set([...dientesCompletados, ...allTeeth])];
        }
      } else {
          const numeroPieza = parseInt(piece.tooth_number);
          if (piece.piece_status === 1) { // Asumiendo 1 para afectado/pendiente
            dientesAfectados.push(numeroPieza);
          } else if (piece.piece_status === 0) { // Asumiendo 0 para completado
            dientesCompletados.push(numeroPieza);
          }
      }
    });

    // Renderizar el odontograma con los datos cargados
    renderOdontograma();

  } catch (error) {
    console.error("Error al cargar los datos iniciales de la página:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudieron cargar los datos. Inténtalo de nuevo.",
    });
  }
});