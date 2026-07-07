// vistaDiaria.js
import { getFormData } from '../../modules/funciones.js';
import DB from '../../modules/classes/DB_API.js';
import { openSidebar, closeSidebar } from "../../modules/components/Sidebar.js";

// --- 1) Gestión del sidebar ---
const btnAbrirSidebar = document.querySelector('.header__menu');
const btnCerrarSidebar = document.querySelector('.sidebar__close');

btnAbrirSidebar.addEventListener('click', () => {
  openSidebar();
});
btnCerrarSidebar.addEventListener('click', () => {
  closeSidebar();
});

// --- 2) Leer parámetro date de la URL ---
const params = new URLSearchParams(window.location.search);
const dateParam = params.get('date'); // "YYYY-MM-DD" o null

// --- 3) Valores auxiliares para fecha/hora mínima ---
const hoy = new Date().toISOString().slice(0,10);
const horaMin = '09:00';

// Colores del evento según su estado (mismo lenguaje que la agenda del dashboard).
function coloresEstado(estado){
  const e = (estado || 'Pendiente').toLowerCase();
  if (e === 'completada') return { backgroundColor: '#DEFFD2', borderColor: '#3CD856', textColor: '#087443' };
  if (e === 'cancelada')  return { backgroundColor: '#FCDFDF', borderColor: '#DE5753', textColor: '#B23935' };
  return { backgroundColor: '#FCEEDF', borderColor: '#F78E2B', textColor: '#C46A16' }; // pendiente
}

document.addEventListener('DOMContentLoaded', async () => {
  // --- 4) Preparar input de fecha/hora (Crear Cita) ---
  const inputFecha = document.getElementById('fecha');
  inputFecha.min = `${hoy}T${horaMin}`;
  if (dateParam) {
    inputFecha.value = `${dateParam}T${horaMin}`;
  }

  // --- 4.1) Bottom sheet "Crear Cita" (móvil) ---
  const formSheet    = document.getElementById('form-sheet');
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const openFormBtn  = document.getElementById('open-form');
  const closeFormBtn = document.getElementById('close-form');

  const openSheet = () => {
    formSheet.classList.add('is-open');
    sheetBackdrop.classList.add('is-open');
    document.body.classList.add('sheet-open');
  };
  const closeSheet = () => {
    formSheet.classList.remove('is-open');
    sheetBackdrop.classList.remove('is-open');
    document.body.classList.remove('sheet-open');
  };

  if (openFormBtn)  openFormBtn.addEventListener('click', openSheet);
  if (closeFormBtn) closeFormBtn.addEventListener('click', closeSheet);
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeSheet);

  // --- 5) Inicializar FullCalendar ---
  const calendar = new FullCalendar.Calendar(
    document.getElementById('calendar'),
    {
      schedulerLicenseKey: 'CC-Attribution-NonCommercial-NoDerivatives',
      locale: 'es',
      locales: FullCalendar.globalLocales,
      initialView: 'resourceTimeGridDay',
      slotDuration: '00:30:00',
      defaultTimedEventDuration: '00:30:00', 
      initialDate: dateParam || hoy,
      slotMinTime: '09:00:00',
      slotMaxTime: '21:00:00',
      allDaySlot: false,
      height: 'auto',
      headerToolbar: { left: 'prev,next today', center: 'title', right: '' },
      buttonText: { today: 'Hoy' },
      
      // ==================================================================
      // -> [NUEVO] AÑADIDO PARA PERMITIR DRAG & DROP <-
      editable: true,
      // ==================================================================

      views: {
        resourceTimeGridDay: {
          titleFormat: {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
          }
        }
      },
      resources: [
        { id: 'med1', title: 'GABINETE 1' },
        { id: 'med2', title: 'GABINETE 2' }
      ],

      // --- 5.1) dateClick: asignar al input "Crear Cita" ---
      dateClick: info => {
        inputFecha.value = info.dateStr.slice(0,16);
        openSheet(); // en móvil, abre el formulario ya con la hora seleccionada
      },

      // --- 5.2) datesSet: cargar y mostrar citas del día actual ---
      datesSet: async info => {
        calendar.removeAllEvents();

        const year = info.start.getFullYear();
        const month = String(info.start.getMonth() + 1).padStart(2, '0');
        const day = String(info.start.getDate()).padStart(2, '0');
        const diaStr = `${year}-${month}-${day}`;

        let todas;
        try {
          todas = await DB.getRecords('appointments');
        } catch (err) {
          console.error('Error cargando citas:', err);
          return;
        }

        const citas = todas.filter(app => app.fecha.slice(0,10) === diaStr);

        citas.forEach(app => {
          calendar.addEvent({
            id: app.id,
            resourceId: app.medico,
            title: `${app.servicio} – ${app.cliente}`,
            start: app.fecha,
            extendedProps: {
              cliente: app.cliente,
              servicio: app.servicio,
              medico: app.medico,
              estado: app.estado
            },
            ...coloresEstado(app.estado)
          });
        });
      },

      // --- 5.3) eventClick: abrir modal de edición y rellenar campos ---
      eventClick: function(info) {
        // Obtener elementos del modal
        const modal = document.getElementById('edit-modal');
        const inputServicioEdit = document.getElementById('edit-servicio');
        const inputObservacionesEdit = document.getElementById('edit-cliente');
        const inputFechaHoraEdit = document.getElementById('edit-fecha');
        const selectMedicoEdit = document.getElementById('edit-medico');
        const selectEstadoEdit = document.getElementById('edit-estado');

        // Rellenar campos del modal con datos del evento
        inputServicioEdit.value = info.event.extendedProps.servicio || '';
        inputObservacionesEdit.value = info.event.extendedProps.cliente || '';
        inputFechaHoraEdit.value = info.event.startStr.slice(0,16);
        selectMedicoEdit.value = info.event.extendedProps.medico || '';
        selectEstadoEdit.value = info.event.extendedProps.estado || 'Pendiente';

        // Guardar el ID en dataset para usarlo al guardar cambios
        modal.dataset.eventId = info.event.id;

        // Abrir el modal
        if (typeof modal.showModal === 'function') {
          modal.showModal();
        } else {
          modal.setAttribute('open', '');
        }
      },

      // ==================================================================
      // -> [NUEVO] FUNCIÓN PARA GUARDAR CAMBIOS AL ARRASTRAR Y SOLTAR <-
      eventDrop: async function(info) {
        // Extraer la información relevante del evento movido
        const eventId = info.event.id;
        const nuevaFechaHora = info.event.startStr.slice(0, 16); // Formato YYYY-MM-DDTHH:mm
        const nuevoMedicoId = info.event.getResources()[0]?.id || info.oldEvent.getResources()[0]?.id; // Nuevo médico (recurso)

        // Validar que la nueva hora no sea antes de las 9:00 AM
        if (info.event.start.getHours() < 9) {
          Swal.fire({
            title: "Movimiento no válido",
            text: "La hora de la cita no puede ser antes de las 09:00.",
            icon: "error"
          });
          // Esta función revierte el movimiento, devolviendo el evento a su posición original.
          info.revert();
          return;
        }

        try {
          // Mostramos un indicador de carga
          Swal.fire({
            title: 'Actualizando cita...',
            text: 'Por favor, espera.',
            allowOutsideClick: false,
            didOpen: () => {
              Swal.showLoading();
            }
          });

          // Preparamos los datos para la base de datos
          const datosActualizados = {
            fecha: nuevaFechaHora,
            medico: nuevoMedicoId,
            // Mantenemos el resto de datos que no cambian con el drag&drop
            cliente: info.event.extendedProps.cliente,
            servicio: info.event.extendedProps.servicio,
            estado: info.event.extendedProps.estado
          };
          
          // Llamamos a tu clase DB para editar el registro
          await DB.editRecord('appointments', eventId, datosActualizados);

          // Actualizamos los datos internos del evento en el calendario
          info.event.setExtendedProp('medico', nuevoMedicoId);

          Swal.close(); // Cerramos el loading
          // Opcional: podrías mostrar una confirmación de éxito si lo deseas
          // Swal.fire('¡Actualizado!', 'La cita se ha movido correctamente.', 'success');

        } catch (err) {
          console.error("Error al actualizar la cita con drag&drop:", err);
          Swal.fire('Error', 'No se pudo actualizar la cita. Se revertirán los cambios.', 'error');
          // Si hay un error en la base de datos, revertimos el cambio en la interfaz
          info.revert();
        }
      }
      // ==================================================================
    }
  );

  calendar.render();

  // Listener para que el calendario navegue al cambiar la fecha en el formulario de creación
  const inputFechaCrear = document.getElementById('fecha');
  inputFechaCrear.addEventListener('change', function() {
    if (this.value) {
        calendar.gotoDate(this.value);
    }
  });

  // --- 6) Configurar el modal de edición ---
  const modal = document.getElementById('edit-modal');
  const inputServicioEdit = document.getElementById('edit-servicio');
  const inputObservacionesEdit = document.getElementById('edit-cliente');
  const inputFechaHoraEdit = document.getElementById('edit-fecha');
  const selectMedicoEdit = document.getElementById('edit-medico');
  const selectEstadoEdit = document.getElementById('edit-estado');
  const btnCerrarModalIcon = modal.querySelector('.modal__close');
  const btnCerrarModalFooter = modal.querySelector('.modal__button--close');
  const btnGuardarModal = modal.querySelector('#update-medico');

  // Listener para cerrar el modal con el icono "X"
  btnCerrarModalIcon.addEventListener('click', () => {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.classList.remove('closing');
      modal.close();
    }, 200);
  });

  // Listener para cerrar el modal con el botón "Cancelar"
  btnCerrarModalFooter.addEventListener('click', () => {
    modal.classList.add('closing');
    setTimeout(() => {
      modal.classList.remove('closing');
      modal.close();
    }, 200);
  });

  // --- 7) Manejo de "Guardar Cambios" en el modal ---
  btnGuardarModal.addEventListener('click', async () => {
    const eventId = modal.dataset.eventId;
    if (!eventId) {
      // Si no hay ID, cerramos el modal
      modal.classList.add('closing');
      setTimeout(() => {
        modal.classList.remove('closing');
        modal.close();
      }, 200);
      return;
    }

    // Leer valores del modal
    const nuevoPaciente    = inputServicioEdit.value.trim();
    const nuevasObservac  = inputObservacionesEdit.value.trim();
    const nuevoFechaHora  = inputFechaHoraEdit.value;
    const nuevoMedico     = selectMedicoEdit.value;
    const nuevoEstado     = selectEstadoEdit.value;

    // Validar hora mínima al editar
    if (new Date(nuevoFechaHora).getHours() < 9) {
      Swal.fire({
        title: "Fecha inválida",
        text: "La hora debe ser posterior a las 09:00.",
        icon: "error"
      });
      return;
    }

    try {
      // 7.1) Actualizar en la base de datos
      await DB.editRecord('appointments', eventId, {
        cliente:   nuevasObservac,
        servicio:  nuevoPaciente,
        fecha:     nuevoFechaHora,
        medico:    nuevoMedico,
        estado:    nuevoEstado
      });

      // 7.2) Actualizar el evento en FullCalendar
      const fcEvent = calendar.getEventById(eventId);
      if (fcEvent) {
        // Ajustar título para mostrar Observaciones – Paciente
        fcEvent.setProp('title', `${nuevasObservac} – ${nuevoPaciente}`);
        // Cambiar fecha/hora
        fcEvent.setStart(nuevoFechaHora);
        // Cambiar recurso (columna de médico)
        fcEvent.setProp('resourceId', nuevoMedico);
        // Cambiar datos internos
        fcEvent.setExtendedProp('cliente',  nuevasObservac);
        fcEvent.setExtendedProp('servicio', nuevoPaciente);
        fcEvent.setExtendedProp('medico',   nuevoMedico);
        fcEvent.setExtendedProp('estado',   nuevoEstado);

        // Cambiar color según estado
        const c = coloresEstado(nuevoEstado);
        fcEvent.setProp('backgroundColor', c.backgroundColor);
        fcEvent.setProp('borderColor',     c.borderColor);
        fcEvent.setProp('textColor',       c.textColor);
      }
    } catch (err) {
      console.error('Error al actualizar la cita:', err);
      Swal.fire('Error', 'No se pudo actualizar la cita en el servidor.', 'error');
    }

    // 7.3) Cerrar el modal
    modal.classList.add('closing');
    setTimeout(() => {
      modal.classList.remove('closing');
      modal.close();
      location.reload();
    }, 200);
  });

  // --- 8) Gestión del formulario de creación de cita ---
  const form = document.getElementById('event-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const data = getFormData(form);

    // Validación de hora mínima
    if (new Date(data.fecha).getHours() < 9) {
      Swal.fire({
        title: "Fecha inválida",
        text: "La hora debe ser posterior a las 09:00.",
        icon: "error"
      });
      return;
    }

    try {
      // 8.1) Agregar registro en la base de datos
      const result = await DB.addRegister('appointments', data);

      // 8.2) Añadir evento en FullCalendar
      calendar.addEvent({
        id:            result.id,
        resourceId:    data.medico,
        title:         `${data.servicio} - ${data.cliente}`,
        start:         data.fecha,
        extendedProps: {
          cliente:  data.cliente,
          servicio: data.servicio,
          medico:   data.medico,
          estado:   data.estado
        },
        ...coloresEstado(data.estado)
      });

      Swal.fire('Éxito','Cita guardada exitosamente.','success');
      form.reset();
      closeSheet();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });
});