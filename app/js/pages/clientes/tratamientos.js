// /js/pages/clientes/tratamientos.js
// Ficha de un tratamiento: datos e importes, odontograma (cada pieza alterna
// pendiente <-> completada), historial de pagos, presupuesto PDF e imagenes.

import DB from "../../modules/classes/DB_API.js";
import { showRecordsP, setTableEventsListeners } from "../../modules/funciones.js";
import { table } from "../../modules/selectores.js";
import { euros, formatFecha } from "../../modules/formato.js";

const crearPagoBtn = document.getElementById("crear-pago");
const modal = document.getElementById("edit-modal");
const guardarPagoBtn = document.getElementById("guardar-pago");

// Variables globales para almacenar los IDs
let currentTreatmentId = null;
let currentClientId = null;

const inputMontoPago = document.getElementById("monto");
const selectMetodoPago = document.getElementById("metodo_pago");
const inputNotasPago = document.getElementById("notas");

// Tono de la pastilla segun el estado de pago del tratamiento.
const TONO_ESTADO = { pagado: "exito", parcial: "aviso", pendiente: "peligro" };

crearPagoBtn.addEventListener("click", () => {
  limpiarFormularioPago();
  modal.show();
});

modal.querySelector(".modal__close").addEventListener("click", () => {
  modal.close();
  limpiarFormularioPago();
});

// Cerrar con botón Cancelar
modal.querySelector(".modal__button--close").addEventListener("click", () => {
  modal.close();
  limpiarFormularioPago();
});

function limpiarFormularioPago() {
  inputMontoPago.value = "";
  selectMetodoPago.value = "efectivo";
  inputNotasPago.value = "";
}

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

  const pagoData = {
    treatment_id: currentTreatmentId,
    client_id: currentClientId,
    monto_pagado: parseFloat(inputMontoPago.value),
    metodo_pago: selectMetodoPago.value,
    notas: inputNotasPago.value || ""
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

    // Solo los pagos de este tratamiento, y los importes de la ficha al dia.
    await showRecordsP("payments", currentTreatmentId);
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

// Pinta los datos del tratamiento (importes, estado, paciente...) en la ficha.
async function actualizarDeudaTratamientoUI(treatmentId) {
  try {
    const treatmentData = await DB.getRecord("treatments", treatmentId);
    if (!treatmentData) return;

    const deuda = parseFloat(treatmentData.deuda || 0);
    document.getElementById("costo-tratamiento").textContent = euros(treatmentData.monto_total);
    document.getElementById("pagado-tratamiento").textContent = euros(treatmentData.monto_pagado);
    const deudaSpan = document.getElementById("deuda-tratamiento");
    deudaSpan.textContent = euros(deuda);
    deudaSpan.dataset.tono = deuda > 0 ? "peligro" : "";
    document.getElementById("deuda-pagos").textContent = `Deuda pendiente: ${euros(deuda)}`;

    // Enlace "volver" a la ficha del paciente, con su nombre.
    if (treatmentData.client_id) {
      document.getElementById("volver-paciente").href =
        `historia-clinica.html?id=${encodeURIComponent(treatmentData.client_id)}`;
      const clientData = await DB.getRecord("clients", treatmentData.client_id);
      if (clientData?.nombre) document.getElementById("nombre-paciente").textContent = clientData.nombre;
    }

    const diagnostico = treatmentData.diagnostico || "N/A";
    document.getElementById("nombre-tratamiento").textContent = diagnostico;
    document.title = `${diagnostico} · HS Dental`;

    document.getElementById("fecha-inicio-tratamiento").textContent = formatFecha(treatmentData.fecha_creacion);

    const estado = treatmentData.estado || "N/A";
    const estadoSpan = document.getElementById("estado-tratamiento");
    estadoSpan.textContent = estado.charAt(0).toUpperCase() + estado.slice(1);
    estadoSpan.dataset.tono = TONO_ESTADO[treatmentData.estado] || "";

    document.getElementById("observaciones-tratamiento").textContent = treatmentData.observaciones || "Sin observaciones";
  } catch (error) {
    console.error("Error al actualizar la deuda o info del tratamiento en UI:", error);
    // No mostrar Swal aquí para no interrumpir la carga del resto de la ficha
  }
}

guardarPagoBtn.addEventListener("click", guardarPago);

// Acciones de la tabla de pagos (recibo, factura, borrar).
table.addEventListener("click", e => setTableEventsListeners(e, "payments"));

const uploadBtn = document.getElementById("uploadBtn");
const pdfUpload = document.getElementById("pdfUpload");
const fileInfo = document.getElementById("fileInfo");
const presupuestoVacio = document.getElementById("presupuesto-vacio");

const uploadImageBtn = document.getElementById("uploadImageBtn");
const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const galeriaVacia = document.getElementById("galeria-vacia");
const visorImagen = document.getElementById("imageModal");
const modalImage = document.getElementById("modalImage");

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

  return DB.uploadFile("images", formData);
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

      await uploadFile(file, "imagen");

      // Miniatura con la imagen local (sin esperar a recargar la galeria).
      const reader = new FileReader();
      reader.onload = (e) => {
        imagePreviewContainer.appendChild(crearMiniatura(e.target.result, file.name));
        galeriaVacia.hidden = true;
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

// Miniatura de la galeria: al pulsarla abre la imagen en grande. Si el archivo
// no carga (ausente), queda un aviso limpio en vez del icono roto.
function crearMiniatura(src, alt) {
  const miniatura = document.createElement("button");
  miniatura.type = "button";
  miniatura.className = "galeria__item";
  miniatura.setAttribute("aria-label", "Ver imagen en grande");

  const img = document.createElement("img");
  img.src = src;
  img.alt = alt;
  img.addEventListener("error", () => {
    miniatura.classList.add("galeria__item--rota");
    miniatura.disabled = true;
    miniatura.removeAttribute("aria-label");
    miniatura.innerHTML = '<i class="ri-image-2-line" aria-hidden="true"></i><span>Imagen no disponible</span>';
  });
  miniatura.appendChild(img);

  miniatura.addEventListener("click", () => {
    modalImage.src = src;
    visorImagen.showModal();
  });
  return miniatura;
}

// Visor: se cierra con su boton, con Escape o pulsando fuera de la imagen.
visorImagen.querySelector(".visor-imagen__cerrar").addEventListener("click", () => visorImagen.close());
visorImagen.addEventListener("click", (e) => {
  if (e.target === visorImagen) visorImagen.close();
});

// Presupuesto PDF adjunto: nombre, descargar y eliminar.
function pintarPresupuesto(file) {
  fileInfo.innerHTML = '<i class="ri-file-pdf-2-line adjunto__icono" aria-hidden="true"></i>';

  const nombre = document.createElement("span");
  nombre.className = "adjunto__nombre";
  nombre.textContent = file.nombre_original;

  const pdfLink = document.createElement("a");
  pdfLink.className = "boton boton--icono boton--fantasma";
  pdfLink.href = `/${file.ruta}`;
  pdfLink.target = "_blank";
  pdfLink.download = file.nombre_original;
  pdfLink.title = "Descargar";
  pdfLink.setAttribute("aria-label", "Descargar PDF");
  pdfLink.innerHTML = '<i class="ri-download-2-line" aria-hidden="true"></i>';

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "boton boton--icono boton--fantasma";
  deleteBtn.dataset.tono = "peligro";
  deleteBtn.title = "Eliminar";
  deleteBtn.setAttribute("aria-label", "Eliminar PDF");
  deleteBtn.innerHTML = '<i class="ri-delete-bin-line" aria-hidden="true"></i>';
  deleteBtn.onclick = async () => {
    const confirm = await Swal.fire({
      title: '¿Eliminar PDF?',
      text: "Esta acción no se puede deshacer",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: "var(--hs-peligro)",
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

  fileInfo.append(nombre, pdfLink, deleteBtn);
  fileInfo.hidden = false;
}

// Carga los adjuntos del tratamiento: imagenes a la galeria y el PDF del presupuesto.
async function loadExistingFiles() {
  try {
    const files = await DB.getRecordsP("images", currentTreatmentId);

    imagePreviewContainer.innerHTML = '';
    fileInfo.hidden = true;

    files.forEach(file => {
      if (file.tipo === "imagen") {
        const imageUrl = `/${file.ruta}`.replace(/([^:])(\/\/+)/g, '$1/');
        imagePreviewContainer.appendChild(crearMiniatura(imageUrl, "Imagen de tratamiento"));
      } else if (file.tipo === "pdf") {
        pintarPresupuesto(file);
      }
    });
  } catch (error) {
    console.error("Error al cargar archivos:", error);
  }
  galeriaVacia.hidden = imagePreviewContainer.children.length > 0;
  presupuestoVacio.hidden = !fileInfo.hidden;
}

// ---- Odontograma ----

let dientesAfectados = []; // Dientes pendientes (piece_status = 1) -> rojo
let dientesCompletados = []; // Dientes completados (piece_status = 0) -> verde
let piezasData = []; // Piezas del tratamiento (con id y estado) para poder togglearlas

const dientesSuperior = [
  18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28
];
const dientesInferior = [
  48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38
];

// Estado de un diente en este tratamiento: completada, pendiente o null (no entra).
function estadoDiente(numero) {
  if (dientesCompletados.includes(numero)) return "completada";
  if (dientesAfectados.includes(numero)) return "pendiente";
  return null;
}

// Las piezas del tratamiento son botones que alternan su estado; el resto, solo dibujo.
function crearDiente(numero) {
  const estado = estadoDiente(numero);
  const diente = document.createElement(estado ? "button" : "span");
  diente.className = "diente";
  diente.dataset.numero = numero;

  if (estado) {
    const otro = estado === "pendiente" ? "completada" : "pendiente";
    diente.type = "button";
    diente.dataset.estado = estado;
    diente.title = `Pieza ${numero}: ${estado}. Pulsa para marcarla como ${otro}.`;
    diente.setAttribute("aria-label", diente.title);
    diente.addEventListener("click", () => togglePieza(numero));
  }

  diente.innerHTML = `<span class="diente__forma" aria-hidden="true"></span><span class="diente__numero">${numero}</span>`;
  return diente;
}

// Recalcula los arrays de dientes pendientes/completados a partir de piezasData.
function recomputeDienteArrays() {
  dientesAfectados = [];
  dientesCompletados = [];
  piezasData.forEach(piece => {
    const status = Number(piece.piece_status);
    if (piece.tooth_number === "General") {
      const allTeeth = [...dientesSuperior, ...dientesInferior];
      if (status === 1) {
        dientesAfectados = [...new Set([...dientesAfectados, ...allTeeth])];
      } else if (status === 0) {
        dientesCompletados = [...new Set([...dientesCompletados, ...allTeeth])];
      }
    } else {
      const numeroPieza = parseInt(piece.tooth_number);
      if (status === 1) {
        dientesAfectados.push(numeroPieza);
      } else if (status === 0) {
        dientesCompletados.push(numeroPieza);
      }
    }
  });
}

// Alterna el estado de una pieza (1 = pendiente/rojo <-> 0 = completada/verde) y repinta.
async function togglePieza(numero) {
  // Busca la pieza concreta de ese diente o, si el tratamiento es "General", la pieza general.
  let piece = piezasData.find(p => String(p.tooth_number) === String(numero));
  if (!piece) piece = piezasData.find(p => p.tooth_number === "General");
  if (!piece) return;

  const nuevoEstado = Number(piece.piece_status) === 0 ? 1 : 0;

  try {
    await DB.editRecord("pieces", piece.id, { piece_status: nuevoEstado });
    piece.piece_status = nuevoEstado;
    recomputeDienteArrays();
    renderOdontograma();
    // Al repintar se recrean los botones: el foco vuelve a la misma pieza.
    document.querySelector(`.diente[data-numero="${numero}"]`)?.focus();
  } catch (error) {
    console.error("Error al actualizar la pieza:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo actualizar el estado de la pieza.",
    });
  }
}

const filaSuperior = document.getElementById("fila-superior");
const filaInferior = document.getElementById("fila-inferior");

// Limpia primero para poder repintar tras cambiar el estado de una pieza sin duplicar dientes.
function renderOdontograma() {
  filaSuperior.replaceChildren(...dientesSuperior.map(crearDiente));
  filaInferior.replaceChildren(...dientesInferior.map(crearDiente));
}

// La boca se dibuja ya (sin piezas marcadas) mientras llegan los datos.
renderOdontograma();


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

    // Datos del tratamiento y del paciente en la ficha.
    await actualizarDeudaTratamientoUI(currentTreatmentId);

    // Pagos de este tratamiento. Desde la campana de avisos (?pago=) se llega
    // a ese pago: la tabla va a su pagina y lo resalta.
    const tablaPagos = await showRecordsP("payments", currentTreatmentId);
    await loadExistingFiles();
    if (params.get("pago")) tablaPagos?.resaltar(params.get("pago"));

    // Piezas del tratamiento -> odontograma.
    piezasData = await DB.getPiecesByTreatmentId(currentTreatmentId);
    recomputeDienteArrays();
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
