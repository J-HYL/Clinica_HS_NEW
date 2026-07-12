// vista-consultorio.js
import DB from "../../modules/classes/DB_API.js";
import Alert from "../../modules/components/Alert.js";
import { reloadPage } from "../../modules/funciones.js";
import { escapeHtml } from "../../modules/html.js";


// El resto de tu código JS existente...
window.addEventListener('DOMContentLoaded', async () => {

    const params = new URLSearchParams(window.location.search);
    const pacienteBox = document.getElementById('pacienteBox');
    const tratamientoBox = document.getElementById('tratamientoBox');
    const tratamientoScrollable = tratamientoBox.querySelector('.scrollable');


    if (!params.has('id')) {
        // Mostrar el modal de búsqueda si no hay ID en la URL
        const modal = document.getElementById('modalBuscador');
        const input = document.getElementById('busquedaPaciente');
        const lista = document.getElementById('listaResultados');

        modal.style.display = 'flex';

        const clientes = await DB.getRecords('clients'); 

        input.addEventListener('input', () => {
            const filtro = input.value.toLowerCase();
            lista.innerHTML = ''; // Limpiar resultados

            const resultados = clientes.filter(cliente =>
                cliente.nombre.toLowerCase().includes(filtro)
            );

            resultados.forEach(cliente => {
                const li = document.createElement('li');
                li.textContent = cliente.nombre;
                li.addEventListener('click', () => {
                    window.location.href = `${window.location.pathname}?id=${cliente.id}`;
                });
                lista.appendChild(li);
            });
        });
    } else {
        //pilla id 
        const clientId = params.get('id');
        const client = await DB.getRecord('clients', clientId);

        if (client) {
            // Actualiza datos
            pacienteBox.querySelector('.scrollable').innerHTML = `
                <p><strong>Nombre:</strong> ${escapeHtml(client.nombre)}</p>
                <p><strong>Edad:</strong> ${escapeHtml(client.edad) || 'N/A'}</p>
                <p><strong>Alergias:</strong> ${escapeHtml(client.alergias) || 'ninguna'}</p>
                <p><strong>Teléfono:</strong> ${escapeHtml(client.telefono) || 'N/A'}</p>
                <p><strong>Email:</strong> ${escapeHtml(client.email) || 'N/A'}</p>
                <p><strong>Fecha de Alta:</strong> ${client.Alta ? new Date(client.Alta).toLocaleDateString() : 'N/A'}</p>
            `;
        } else {
            pacienteBox.querySelector('.scrollable').innerHTML = '<p>Paciente no encontrado.</p>';
        }

        // ---------- Lógica para el Plan de Tratamiento (tratamientoBox) ----------
        let innerTreatmentsHtml = '';


        const treatments = await DB.getTreatmentsByClientId(clientId); 

        if (treatments && treatments.length > 0) {
            for (const treatment of treatments) {
                innerTreatmentsHtml += `<p><strong>${escapeHtml(treatment.diagnostico) || 'Diagnóstico sin especificar'}:</strong>`;
                
                
                const pieces = await DB.getPiecesByTreatmentId(treatment.id);
                if (pieces && pieces.length > 0) {
                    pieces.forEach(piece => {
                        //console.log('Depuración de Pieza:', { id: piece.id, tooth_number: piece.tooth_number, status: piece.status, typeOfStatus: typeof piece.status }); 
                        // Según tu lógica de renderizado: piece_status == 0 significa 'checked' (completado)
                        const isChecked = piece.piece_status == 0 ? 'checked' : ''; 
                        innerTreatmentsHtml += `
                            <label class="item">
                                <input type="checkbox" id="t${piece.tooth_number}_${treatment.id}" data-piece-id="${piece.id}" ${isChecked} />
                                <label class="cbx" for="t${piece.tooth_number}_${treatment.id}">
                                    <svg width="14px" height="12px" viewBox="0 0 14 12">
                                        <polyline points="1 7.6 5 11 13 1"></polyline>
                                    </svg>
                                </label>
                                <label class="cbx-lbl" for="t${piece.tooth_number}_${treatment.id}">${piece.tooth_number}</label>
                            </label>
                        `;
                    });
                } else {
                    innerTreatmentsHtml += ` No hay piezas asociadas.`;
                }
                innerTreatmentsHtml += `</p>`; 
            }
        } else {
            innerTreatmentsHtml = '<p>No se encontraron planes de tratamiento para este paciente.</p>';
        }

        tratamientoScrollable.innerHTML = `<div class="checkbox-wrapper-52">${innerTreatmentsHtml}</div>`;

        // Re-añadir listeners para los nuevos checkboxes dinámicos
        const dynamicCheckboxes = tratamientoScrollable.querySelectorAll('.checkbox-wrapper-52 input[type="checkbox"]');
        dynamicCheckboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const saveBtn = document.getElementById('saveBtn');
                if (saveBtn) {
                   saveBtn.style.display = 'inline-block'; // Muestra el botón al cambiar un checkbox
                }
            });
        });
         await updateHistoryTable(clientId);
    }
});

const saveBtn = document.getElementById('saveBtn'); 

// --- BLOQUE DE CÓDIGO INTEGRADO PARA EL BOTÓN GUARDAR ---
if (saveBtn) { // Asegúrate de que el botón existe en el DOM
    saveBtn.addEventListener('click', async () => {
        const dynamicCheckboxes = document.querySelectorAll('.checkbox-wrapper-52 input[type="checkbox"]');
        let changesMade = false;
        let successfulUpdates = 0;
        let failedUpdates = 0;

        for (const cb of dynamicCheckboxes) {
            const pieceId = cb.dataset.pieceId;
            // newPieceStatus: 0 para 'checked' (completado), 1 para 'unchecked' (pendiente)
            const newPieceStatus = cb.checked ? 0 : 1; 

            try {
                // Obtener el estado actual de la pieza desde el servidor para verificar si cambió
                const currentPiece = await DB.getRecord('pieces', pieceId); 
                if (currentPiece && currentPiece.piece_status != newPieceStatus) {
                    //console.log(`Intentando actualizar pieza ${pieceId}: status de ${currentPiece.piece_status} a ${newPieceStatus}`);
                    await DB.editRecord('pieces', pieceId, { piece_status: newPieceStatus });
                    successfulUpdates++;
                    changesMade = true;
                } else if (!currentPiece) {
                    console.warn(`Pieza con ID ${pieceId} no encontrada para verificar estado.`);
                }
            } catch (error) {
                console.error(`Error al actualizar piece ID ${pieceId}:`, error);
                failedUpdates++;
            }
        }

        if (changesMade) {
            if (failedUpdates === 0) {
                Alert.showStatusAlert('success', '¡Guardado!', 'Cambios guardados correctamente.', () => {
                    saveBtn.style.display = 'none'; // Oculta el botón después de guardar
                    // Opcional: location.reload(); si necesitas una recarga completa
                });
            } else {
                Alert.showStatusAlert('warning', '¡Atención!', `Se guardaron ${successfulUpdates} cambios, pero fallaron ${failedUpdates}.`, () => {
                    saveBtn.style.display = 'none'; // Oculta el botón
                });
            }
        } else {
            Alert.showStatusAlert('info', '¡Info!', 'No hay cambios que guardar.', () => {
                saveBtn.style.display = 'none'; // Oculta el botón si no hay cambios
            });
        }
    });
}
// --- FIN DEL BLOQUE DE CÓDIGO INTEGRADO ---

// El resto de tu código JS existente para otras funcionalidades permanece sin cambios.
window.openModal = function(section) {
    const modal = document.getElementById('modal');
    const modalContent = document.getElementById('modalContent');
    const contentToCopy = document.getElementById(section + 'Box').cloneNode(true);



    const expandBtnInModalCopy = contentToCopy.querySelector('.expand-btn');
    if (expandBtnInModalCopy) {
        expandBtnInModalCopy.remove();
        
    }

    const saveBtnInModalCopy = contentToCopy.querySelector('.save-btn');
    if (saveBtnInModalCopy) {
        saveBtnInModalCopy.remove();
    }
    
    // Asegurarse de que el modal content también tenga la estructura correcta si va a mostrar checkboxes
    if (section === 'tratamiento') {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentToCopy.querySelector('.scrollable').innerHTML;
        modalContent.innerHTML = tempDiv.innerHTML; 
    } else {
        modalContent.innerHTML = contentToCopy.innerHTML;
    }


    // Re-añadir listeners para los checkboxes dentro del modal
    const modalCheckboxes = modalContent.querySelectorAll('.checkbox-wrapper-52 input[type="checkbox"]');
    modalCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            // No se necesita lógica JS para el tachado, tu CSS lo maneja
        });
    });
    modal.style.display = 'flex';
};

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

window.openFullHistoryModal = function() {
    const fullTableModal = document.getElementById('fullTableModal');
    const fullTableContent = document.getElementById('fullTableContent');

    const currentTable = document.querySelector('.bottom-section table').cloneNode(true);
    fullTableContent.innerHTML = ''; 
    fullTableContent.appendChild(currentTable); 
    fullTableModal.style.display = 'flex';
};

// ** FUNCIÓN MODIFICADA: openAddTreatmentModal **
window.openAddTreatmentModal = async function() { 
    document.getElementById('addTreatmentModal').style.display = 'flex';
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('id');

    if (clientId) {
        const treatments = await DB.getTreatmentsByClientId(clientId); // Fetch treatments for the current client
        const newTreatmentSelect = document.getElementById('newTreatmentSelect');
        newTreatmentSelect.innerHTML = '<option value="">Selecciona un tratamiento</option>'; // Default option

        if (treatments && treatments.length > 0) {
            treatments.forEach(treatment => {
                const option = document.createElement('option');
                option.value = treatment.id; // Assuming treatment.id is the unique identifier
                option.textContent = `${treatment.diagnostico || 'Tratamiento sin especificar'} (Falta por pagar: ${treatment.deuda || '0.00'} €)`; 
                newTreatmentSelect.appendChild(option);
            });
        } else {
            newTreatmentSelect.innerHTML = '<option value="">No hay tratamientos disponibles</option>';
            newTreatmentSelect.disabled = true; // Disable if no treatments
            Alert.showStatusAlert('info', 'Info', 'No hay tratamientos para este paciente. Asigna uno primero.');
        }
    } else {
        Alert.showStatusAlert('error', 'Error', 'No se puede añadir un pago sin un paciente seleccionado.');
        closeModal('addTreatmentModal');
    }
};

// ** FUNCIÓN MODIFICADA: addTreatmentRecord **
window.addTreatmentRecord = async function() { 
    const selectedTreatmentId = document.getElementById('newTreatmentSelect').value;
    const paymentAmount = document.getElementById('newAC').value; // This is the 'pago'
    const doctorName = document.getElementById('newDoctor').value;

    if (!selectedTreatmentId) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo Incompleto',
            text: 'Por favor, selecciona un tratamiento.',
            confirmButtonText: 'Entendido'
        });
        return;
    }
    if (!paymentAmount || isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo Incompleto',
            text: 'Por favor, introduce un monto de pago válido y mayor que cero.',
            confirmButtonText: 'Entendido'
        });
        return;
    }
    if (!doctorName) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo Incompleto',
            text: 'Por favor, introduce el nombre del doctor.',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    // Fecha es el current timestamp
    // Utiliza un formato que tu base de datos MySQL pueda entender para datetime, ej: YYYY-MM-DD HH:MM:SS
    const paymentDate = new Date().toISOString().slice(0, 19).replace('T', ' '); 

    // Payload para el nuevo registro de pago
    const paymentPayload = {
        treatment_id: selectedTreatmentId,
        amount: parseFloat(paymentAmount),
        fecha: paymentDate, // Usar la fecha generada
        doctor: doctorName
    };

    try {
        // Asumiendo que 'payments' es la tabla para los pagos y DB.addRegister funciona así
        await DB.addRegister('payments', paymentPayload); 

        // Obtener los detalles del tratamiento para mostrar su total en la tabla
        const selectedTreatment = await DB.getRecord('treatments', selectedTreatmentId); 

        // Añadir a la tabla de historial mostrada en la interfaz
        const tableBody = document.querySelector('.bottom-section table tbody');
        const newRow = tableBody.insertRow(0); // Insertar al principio
        newRow.insertCell(0).textContent = new Date(paymentDate).toLocaleDateString(); // Formatear para mostrar
        newRow.insertCell(1).textContent = selectedTreatment.diagnostico || 'Tratamiento sin especificar'; // Nombre del tratamiento
        newRow.insertCell(2).textContent = parseFloat(selectedTreatment.monto_total || 0).toFixed(2); // Total del tratamiento, formateado
        newRow.insertCell(3).textContent = parseFloat(paymentAmount).toFixed(2); // Monto del pago, formateado
        newRow.insertCell(4).textContent = doctorName; // Doctor

        Swal.fire({
            icon: 'success',
            title: '¡Pago Añadido!',
            text: 'El pago se ha registrado correctamente.',
            confirmButtonText: 'Ok'
        });

        closeModal('addTreatmentModal');
        // Limpiar los campos del formulario
        document.getElementById('newTreatmentSelect').value = '';
        document.getElementById('newAC').value = '';
        document.getElementById('newDoctor').value = '';

    } catch (error) {
        console.error("Error al añadir pago:", error);
        Alert.showStatusAlert('error', 'Error', 'Hubo un error al guardar el pago.');
    }
};

document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        e.currentTarget.style.display = 'none';
    }
});
document.getElementById('fullTableModal').addEventListener('click', (e) => {
    if (e.target.id === 'fullTableModal') {
        e.currentTarget.style.display = 'none';
    }
});
document.getElementById('addTreatmentModal').addEventListener('click', (e) => {
    if (e.target.id === 'addTreatmentModal' && !e.target.closest('.modal-content')) {
        e.currentTarget.style.display = 'none';
    }
});

// Función modificada para incluir las observaciones
window.handleNewVisit = async function() {
    const selectedTreatmentId = document.getElementById('newTreatmentSelect').value;
    const observaciones = document.getElementById('newObservaciones').value; // <-- NUEVA LÍNEA
    const paymentAmount = document.getElementById('newAC').value;
    const doctorName = document.getElementById('newDoctor').value;
    
    // Obtener el client_id de la URL
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('id');

    // Validaciones
    if (!clientId) {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se encontró el ID del cliente.',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    if (!selectedTreatmentId) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo Incompleto',
            text: 'Por favor, selecciona un tratamiento.',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    if (!doctorName) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo Incompleto',
            text: 'Por favor, introduce el nombre del doctor.',
            confirmButtonText: 'Entendido'
        });
        return;
    }

    // Validar el monto de pago si se proporciona
    let parsedPaymentAmount = null;
    if (paymentAmount && paymentAmount.trim() !== '') {
        if (isNaN(parseFloat(paymentAmount)) || parseFloat(paymentAmount) <= 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Monto Inválido',
                text: 'Por favor, introduce un monto de pago válido y mayor que cero.',
                confirmButtonText: 'Entendido'
            });
            return;
        }
        parsedPaymentAmount = parseFloat(paymentAmount);
    }

    try {
        // Paso 1: Crear el registro de visita
        const visitPayload = {
            client_id: parseInt(clientId),
            treatment_id: parseInt(selectedTreatmentId),
            observaciones: observaciones,
            doctor: doctorName,
            pago_de_visita: parsedPaymentAmount
        };

        console.log('Creando visita con payload:', visitPayload);
        const visitResponse = await DB.addRegister('visits', visitPayload);

        if (!visitResponse.success) {
            throw new Error('Error al crear la visita');
        }

        // Paso 2: Si hay pago, crear el registro de pago
        if (parsedPaymentAmount && parsedPaymentAmount > 0) {
            const paymentPayload = {
                treatment_id: parseInt(selectedTreatmentId),
                client_id: parseInt(clientId),
                monto_pagado: parsedPaymentAmount,
                metodo_pago: 'Efectivo',
                notas: `Pago realizado durante visita con ${doctorName}`
            };

            console.log('Creando pago con payload:', paymentPayload);
            const paymentResponse = await DB.addRegister('payments', paymentPayload);

            if (!paymentResponse.success) {
                throw new Error('Error al crear el pago');
            }

            Swal.fire({
                icon: 'success',
                title: '¡Visita y Pago Guardados!',
                text: 'La visita y el pago se han registrado correctamente.',
                confirmButtonText: 'Ok'
            });
        } else {
            Swal.fire({
                icon: 'success',
                title: '¡Visita Guardada!',
                text: 'La visita se ha registrado correctamente.',
                confirmButtonText: 'Ok'
            });
        }

        // Paso 3: Actualizar la tabla del historial
        await updateHistoryTable(clientId);

        // Paso 4: Cerrar modal y limpiar campos
        closeModal('addTreatmentModal');
        clearVisitForm();

    } catch (error) {
        console.error("Error al guardar la visita:", error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Hubo un error al guardar la visita. Inténtalo de nuevo.',
            confirmButtonText: 'Ok'
        });
    }
};

// Función auxiliar para limpiar el formulario (modificada)
function clearVisitForm() {
    document.getElementById('newTreatmentSelect').value = '';
    document.getElementById('newObservaciones').value = ''; // <-- NUEVA LÍNEA
    document.getElementById('newAC').value = '';
    document.getElementById('newDoctor').value = '';
}

// Función auxiliar para actualizar la tabla del historial (modificada)
async function updateHistoryTable(clientId) {
    try {
        // Obtener las visitas del cliente
        const visits = await DB.getVisitsByClientId(clientId);
        const tableBody = document.querySelector('.bottom-section table tbody');
        
        // Limpiar tabla actual
        tableBody.innerHTML = '';
        
        if (visits && visits.length > 0) {
            // Ordenar por fecha (más antigua primero para que la más reciente quede abajo)
            visits.sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // <-- LÍNEA MODIFICADA
            
            for (const visit of visits) {
                // Obtener detalles del tratamiento
                const treatment = await DB.getRecord('treatments', visit.treatment_id);
                
                const newRow = tableBody.insertRow();
                newRow.insertCell(0).textContent = new Date(visit.fecha).toLocaleDateString();
                newRow.insertCell(1).textContent = treatment ? (treatment.diagnostico || 'Tratamiento sin especificar') : 'N/A';
                newRow.insertCell(2).textContent = visit.observaciones || 'Sin observaciones'; // <-- NUEVA LÍNEA
                newRow.insertCell(3).textContent = treatment ? parseFloat(treatment.monto_total || 0).toFixed(2) : '0.00';
                newRow.insertCell(4).textContent = visit.pago_de_visita ? parseFloat(visit.pago_de_visita).toFixed(2) : '0.00';
                newRow.insertCell(5).textContent = visit.doctor || 'N/A';
            }
        }
    } catch (error) {
        console.error('Error al actualizar la tabla del historial:', error);
    }
}
window.changePatient = function() {
    window.location.href = window.location.pathname;
};

document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        e.currentTarget.style.display = 'none';
    }
});
document.getElementById('fullTableModal').addEventListener('click', (e) => {
    if (e.target.id === 'fullTableModal') {
        e.currentTarget.style.display = 'none';
    }
});
document.getElementById('addTreatmentModal').addEventListener('click', (e) => {
    if (e.target.id === 'addTreatmentModal') {
        e.currentTarget.style.display = 'none';
    }
});
const editBtn = document.querySelector('#tratamientoBox .edit-btn');
if (editBtn) {
    editBtn.addEventListener('click', () => {
        openEditPiecesModal();
    });
}

// Función para abrir el modal de edición de piezas
window.openEditPiecesModal = async function() {
    const editPiecesModal = document.getElementById('editPiecesModal');
    const editTreatmentSelect = document.getElementById('editTreatmentSelect');
    const odontogramaContainer = document.getElementById('odontogramaContainer');
    const savePiecesBtn = document.getElementById('savePiecesBtn');
    const params = new URLSearchParams(window.location.search);
    const clientId = params.get('id');

    if (!clientId) {
        Alert.showStatusAlert('error', 'Error', 'No se puede editar sin un paciente seleccionado.');
        return;
    }

    try {
        const treatments = await DB.getTreatmentsByClientId(clientId);
        editTreatmentSelect.innerHTML = '<option value="">Selecciona un tratamiento</option>';
        odontogramaContainer.innerHTML = '';
        savePiecesBtn.style.display = 'none';

        if (treatments && treatments.length > 0) {
            treatments.forEach(treatment => {
                const option = document.createElement('option');
                option.value = treatment.id;
                option.textContent = treatment.diagnostico || 'Tratamiento sin especificar';
                editTreatmentSelect.appendChild(option);
            });
        } else {
            editTreatmentSelect.innerHTML = '<option value="">No hay tratamientos disponibles</option>';
            editTreatmentSelect.disabled = true;
            Alert.showStatusAlert('info', 'Info', 'No hay tratamientos para este paciente.');
        }

        editPiecesModal.style.display = 'flex';

    } catch (error) {
        console.error("Error al cargar tratamientos para edición:", error);
        Alert.showStatusAlert('error', 'Error', 'No se pudieron cargar los tratamientos.');
    }
};

// Listener para el cambio de selección en el modal de edición
document.getElementById('editTreatmentSelect').addEventListener('change', async (e) => {
    const treatmentId = e.target.value;
    const odontogramaContainer = document.getElementById('odontogramaContainer');
    const savePiecesBtn = document.getElementById('savePiecesBtn');

    if (treatmentId) {
        try {
            const pieces = await DB.getPiecesByTreatmentId(treatmentId);
            renderOdontograma(odontogramaContainer, pieces);
            savePiecesBtn.style.display = 'block';
        } catch (error) {
            console.error("Error al cargar las piezas:", error);
            odontogramaContainer.innerHTML = '<p>Error al cargar las piezas.</p>';
            savePiecesBtn.style.display = 'none';
        }
    } else {
        odontogramaContainer.innerHTML = '';
        savePiecesBtn.style.display = 'none';
    }
});

// Función para renderizar el odontograma con checkboxes editables
function renderOdontograma(container, existingPieces) {
    container.innerHTML = '<h4>Odontograma del Tratamiento</h4>';
    const topRow = document.createElement('div');
    const bottomRow = document.createElement('div');
    topRow.className = 'odontograma-row';
    bottomRow.className = 'odontograma-row';
    
    // Lista de todos los dientes que quieres mostrar
    const teethNumbersTop = [...Array.from({length: 8}, (_, i) => i + 11)];
    const teethNumbersBottom = [...Array.from({length: 8}, (_, i) => i + 21)];
    const allTeeth = [...teethNumbersTop, ...teethNumbersBottom];
    
    allTeeth.forEach(toothNumber => {
        const piece = existingPieces.find(p => p.tooth_number == toothNumber);
        const isChecked = piece !== undefined;
        const isDisabled = isChecked; // Los dientes ya asignados no se pueden desmarcar

        const label = document.createElement('label');
        label.className = 'tooth-label';
        label.innerHTML = `
            <input type="checkbox" data-tooth-number="${toothNumber}" ${isChecked ? 'checked' : ''} ${isDisabled ? 'disabled' : ''} />
            ${toothNumber}
        `;
        if (teethNumbersTop.includes(toothNumber)) {
            topRow.appendChild(label);
        } else {
            bottomRow.appendChild(label);
        }
    });

    container.appendChild(topRow);
    container.appendChild(bottomRow);
}

// Listener para el botón de guardar
document.getElementById('savePiecesBtn').addEventListener('click', async () => {
    const treatmentId = document.getElementById('editTreatmentSelect').value;
    if (!treatmentId) {
        Alert.showStatusAlert('error', 'Error', 'Por favor, selecciona un tratamiento.');
        return;
    }

    const newPieces = [];
    // Seleccionamos solo los checkboxes no deshabilitados y marcados
    const checkboxes = document.querySelectorAll('#odontogramaContainer input[type="checkbox"]:not(:disabled)');
    
    checkboxes.forEach(checkbox => {
        if (checkbox.checked) {
            const toothNumber = checkbox.dataset.toothNumber;
            newPieces.push({
                treatment_id: treatmentId,
                tooth_number: toothNumber,
                piece_status: 1// Usando 0 para 'activo', ajusta si es necesario
            });
        }
    });

    if (newPieces.length === 0) {
        Alert.showStatusAlert('info', 'Info', 'No se han seleccionado nuevas piezas.');
        closeModal('editPiecesModal');
        return;
    }

    try {
        // Usamos Promise.all para enviar todas las solicitudes en paralelo
        await Promise.all(newPieces.map(piece => DB.createPiece(piece)));
        Alert.showStatusAlert('success', 'Éxito', 'Nuevas piezas añadidas al tratamiento.', () => {
            closeModal('editPiecesModal');
            reloadPage();
        });
    } catch (error) {
        console.error("Error al guardar nuevas piezas:", error);
        Alert.showStatusAlert('error', 'Error', 'Error al guardar las nuevas piezas.');
    }
});

// Asegurarse de que el nuevo modal se pueda cerrar al hacer clic fuera
window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

document.getElementById('editPiecesModal').addEventListener('click', (e) => {
    if (e.target.id === 'editPiecesModal') {
        closeModal('editPiecesModal');
    }
});


// --- NUEVO CÓDIGO PARA EL MODAL DE ASIGNAR TRATAMIENTO (agregarTratamiento) ---

// Elementos del formulario del modal "Asignar Tratamiento"
const assignTreatmentModal = document.getElementById('agregarTratamiento');
// Cambiado para seleccionar el formulario por su nuevo ID
const assignTreatmentForm = assignTreatmentModal.querySelector('#addTreatmentForm'); 
// CAMBIO: Ahora selecciona el botón por su nuevo ID único
const assignTreatmentBtn = assignTreatmentModal.querySelector('#saveNewTreatmentBtn'); 
const assignGeneralCheckbox = assignTreatmentModal.querySelector('input[name="piezas[]"][value="general"]');
const assignToothCheckboxes = assignTreatmentModal.querySelectorAll('input[name="piezas[]"]:not([value="general"])');


// Lógica para habilitar/deshabilitar los checkboxes de dientes en el modal de asignar tratamiento
if (assignGeneralCheckbox) {
  assignGeneralCheckbox.addEventListener('change', function() {
    if (this.checked) {
      assignToothCheckboxes.forEach(checkbox => {
        checkbox.disabled = true;
        checkbox.checked = false; // Desmarcar los dientes individuales si "General" está marcado
      });
    } else {
      assignToothCheckboxes.forEach(checkbox => {
        checkbox.disabled = false;
      });
    }
  });
}


// Función para abrir el modal de asignar tratamiento y resetearlo
window.addTreatment = function() {
    assignTreatmentModal.style.display = 'flex';
    // Resetear el formulario y el estado de los checkboxes al abrir el modal
    if (assignTreatmentForm) { // Asegurarse de que el formulario exista antes de resetear
        assignTreatmentForm.reset();
    }
    if (assignGeneralCheckbox) assignGeneralCheckbox.checked = false;
    assignToothCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
        checkbox.disabled = false;
    });
};


// Función para guardar el tratamiento y las piezas (similar a historia-clinica.js)
if (assignTreatmentBtn) {
    assignTreatmentBtn.addEventListener('click', async (e) => {
        e.preventDefault();

        const params = new URLSearchParams(window.location.search);
        const patientId = params.get("id");

        if (!patientId) {
            Swal.fire({
                icon: "error",
                title: "Error",
                text: "No se encontró el ID del paciente en la URL"
            });
            return;
        }

        let diagnostico = assignTreatmentModal.querySelector("#diagnostico").value;
        const observaciones = assignTreatmentModal.querySelector("#observaciones").value;
        const montoTotalInput = assignTreatmentModal.querySelector("#monto_total");
        const montoPagadoInput = assignTreatmentModal.querySelector("#monto_pagado");

        const total = parseFloat(montoTotalInput.value);
        const abonado = parseFloat(montoPagadoInput.value) || 0; // Puede ser nulo o vacío, se establece a 0



        if (diagnostico === "otro") {
            const customInput = assignTreatmentModal.querySelector("#customTreatmentInput").value.trim();
            if (!customInput) {
                Swal.fire({
                    icon: "warning",
                    title: "Falta tratamiento personalizado",
                    text: "Por favor, escribe el nombre del tratamiento personalizado.",
                });
                return;
            }
            diagnostico = customInput;
        }

        if (!diagnostico || isNaN(total)) {
            Swal.fire({
                icon: "warning",
                title: "Campos incompletos o inválidos",
                text: "Por favor, rellena los campos obligatorios (Tratamiento y Monto total) con valores numéricos válidos."
            });
            return;
        }

        const tratamiento = {
            client_id: patientId,
            diagnostico,
            observaciones,
            monto_total: total,
            monto_pagado: abonado,
            deuda: total - abonado,
            estado: abonado === total ? "pagado" : abonado === 0 ? "pendiente" : "parcial",
        };

        try {
            // 1. Guardar el tratamiento en la tabla 'treatments'
            const responseTreatment = await DB.addRegister("treatments", tratamiento);
            const newTreatmentId = responseTreatment.id; // Asume que el backend devuelve el ID del nuevo tratamiento
            Swal.fire({
                icon: 'success',
                title: 'Tratamiento Creado',
                text: 'El tratamiento principal se ha guardado exitosamente.'
            });
            // 2. Determinar qué piezas guardar
            const piezasSeleccionadas = [];
            if (assignGeneralCheckbox && assignGeneralCheckbox.checked) {
                piezasSeleccionadas.push("General");
            } else {
                assignToothCheckboxes.forEach(checkbox => {
                    if (checkbox.checked) {
                        piezasSeleccionadas.push(checkbox.value);
                    }
                });
            }

            // 3. Guardar las piezas en la tabla 'pieces'
            if (piezasSeleccionadas.length > 0) {
                for (const toothNumber of piezasSeleccionadas) {
                    const pieceData = {
                        treatment_id: newTreatmentId,
                        tooth_number: toothNumber,
                        piece_status: 1 // o el estado por defecto que necesites
                    };
                    await DB.addRegister("pieces", pieceData);
                }
            } else {
                console.warn("No se seleccionó ninguna pieza para el tratamiento.");
            }

            Swal.fire({
                icon: "success",
                title: "Tratamiento y piezas guardadas",
                text: "El tratamiento y las piezas se han guardado correctamente."
            });
            closeModal('agregarTratamiento'); // Cierra el modal de asignar tratamiento
            reloadPage(); // Recarga la página para ver los cambios

        } catch (err) {
            Swal.fire({
                icon: "error",
                title: "Error al guardar",
                text: `Hubo un error al guardar el tratamiento o las piezas: ${err.message}`
            });
            console.error("Error completo:", err);
        }
    });
    const tratamientoSelect = document.getElementById('diagnostico');
    const customTreatmentWrapper = document.getElementById('customTreatmentWrapper');

    if (tratamientoSelect) {
        tratamientoSelect.addEventListener('change', () => {
            customTreatmentWrapper.style.display = tratamientoSelect.value === 'otro' ? 'block' : 'none';
        });
    }
}
