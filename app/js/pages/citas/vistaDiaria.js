// vistaDiaria.js
import { getFormData } from '../../modules/funciones.js';
import DB from '../../modules/classes/DB_API.js';
import "../../modules/components/SidebarNav.js"; // sidebar del panel (se autoinicializa y cablea abrir/cerrar)

// --- Parámetros ---
const params = new URLSearchParams(window.location.search);
const dateParam = params.get('date');
const hoy = new Date().toISOString().slice(0, 10);
const horaMin = '09:00';

// Día visible y bloqueos cargados (para impedir reservar encima).
let diaActual = dateParam || hoy;
let bloqueos = []; // [{ medico, inicio:Date, fin:Date }]
let calendar;

// Colores del evento según su estado.
function coloresEstado(estado) {
  const e = (estado || 'Pendiente').toLowerCase();
  if (e === 'completada') return { backgroundColor: '#DEFFD2', borderColor: '#3CD856', textColor: '#087443' };
  if (e === 'cancelada')  return { backgroundColor: '#FCDFDF', borderColor: '#DE5753', textColor: '#B23935' };
  if (e === 'bloqueado')  return { backgroundColor: '#EEF0F4', borderColor: '#C9CFDA', textColor: '#5B6472' };
  return { backgroundColor: '#FCEEDF', borderColor: '#F78E2B', textColor: '#C46A16' }; // pendiente
}

// ¿Este registro es un bloqueo? (estado 'Bloqueado' nuevo, o los "NO TRABAJO" antiguos).
function esBloqueo(app) {
  const estado = (app.estado || '').toLowerCase();
  return estado === 'bloqueado' || /no\s*trabajo/i.test(app.servicio || '');
}

// Rango [inicio, fin) de un bloqueo.
function rangoBloqueo(app) {
  const inicio = new Date(app.fecha);
  // Los bloqueos nuevos guardan el FIN en 'cliente' (datetime).
  const finGuardado = app.cliente ? new Date(app.cliente) : null;
  if (finGuardado && !isNaN(finGuardado) && finGuardado > inicio) {
    return { inicio, fin: finGuardado };
  }
  // Compatibilidad con "NO TRABAJO TODO EL DIA" antiguos.
  if (/todo\s*el\s*d[ií]a/i.test(app.servicio || '')) {
    const dia = app.fecha.slice(0, 10);
    return { inicio: new Date(`${dia}T09:00`), fin: new Date(`${dia}T21:00`) };
  }
  return { inicio, fin: new Date(inicio.getTime() + 30 * 60000) };
}

// Texto a mostrar en el bloqueo.
function motivoBloqueo(app) {
  const s = (app.servicio || '').trim();
  if (!s || /^no\s*trabajo/i.test(s)) return 'No disponible';
  return s;
}

// ¿El rango [ini, fin) pisa algún bloqueo del mismo gabinete?
function slotBloqueado(ini, fin, medico) {
  return bloqueos.some(b => b.medico === medico && ini < b.fin && fin > b.inicio);
}

// Date -> 'YYYY-MM-DDTHH:MM' local.
function toLocalISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Carga (o recarga) citas y bloqueos del día visible.
async function recargarDia() {
  if (!calendar) return;
  calendar.removeAllEvents();
  bloqueos = [];

  let todas;
  try {
    todas = await DB.getRecords('appointments');
  } catch (err) {
    console.error('Error cargando citas:', err);
    return;
  }

  todas
    .filter(app => app.fecha && app.fecha.slice(0, 10) === diaActual)
    .forEach(app => {
      if (esBloqueo(app)) {
        const { inicio, fin } = rangoBloqueo(app);
        bloqueos.push({ medico: app.medico, inicio, fin });
        calendar.addEvent({
          id: app.id,
          resourceId: app.medico,
          title: motivoBloqueo(app),
          start: inicio,
          end: fin,
          editable: false,
          classNames: ['fc-block'],
          extendedProps: { esBloqueo: true },
          ...coloresEstado('bloqueado')
        });
      } else {
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
      }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
  // --- 3) Input de fecha/hora ---
  const inputFecha = document.getElementById('fecha');
  inputFecha.min = `${hoy}T${horaMin}`;
  if (dateParam) inputFecha.value = `${dateParam}T${horaMin}`;

  // --- 4) Bottom sheet (móvil) ---
  const formSheet = document.getElementById('form-sheet');
  const sheetBackdrop = document.getElementById('sheet-backdrop');
  const openFormBtn = document.getElementById('open-form');
  const closeFormBtn = document.getElementById('close-form');
  const openSheet = () => { formSheet.classList.add('is-open'); sheetBackdrop.classList.add('is-open'); document.body.classList.add('sheet-open'); };
  const closeSheet = () => { formSheet.classList.remove('is-open'); sheetBackdrop.classList.remove('is-open'); document.body.classList.remove('sheet-open'); };
  if (openFormBtn) openFormBtn.addEventListener('click', openSheet);
  if (closeFormBtn) closeFormBtn.addEventListener('click', closeSheet);
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closeSheet);

  // --- 5) Toggle Cita / Bloqueo ---
  const form = document.getElementById('event-form');
  const modeBtns = document.querySelectorAll('.form-mode__btn');
  const citaFields = document.querySelectorAll('.js-cita-field');
  const bloqueoFields = document.querySelectorAll('.js-bloqueo-field');
  const durGroup = document.getElementById('dur-group');
  const todoDia = document.getElementById('todo-dia');
  const servicioInput = document.getElementById('servicio');
  const medicoSelect = document.getElementById('medico');
  const ambosOpt = medicoSelect.querySelector('option[value="ambos"]');
  const submitBtn = document.getElementById('submit-btn');
  const formTitle = document.getElementById('form-title');

  const actualizarDurGroup = () => {
    if (form.dataset.mode === 'bloqueo') durGroup.hidden = todoDia.checked;
  };
  const setMode = (mode) => {
    const isBloq = mode === 'bloqueo';
    form.dataset.mode = mode;
    citaFields.forEach(el => { el.hidden = isBloq; });
    bloqueoFields.forEach(el => { el.hidden = !isBloq; });
    servicioInput.required = !isBloq;
    if (ambosOpt) ambosOpt.hidden = !isBloq;
    if (!isBloq && medicoSelect.value === 'ambos') medicoSelect.value = 'med1';
    submitBtn.innerHTML = isBloq ? 'Bloquear horario <i class="ri-lock-2-line"></i>' : 'Crear Cita <i class="ri-add-line"></i>';
    formTitle.textContent = isBloq ? 'Bloquear horario' : 'Crear Cita';
    formTitle.classList.toggle('is-block', isBloq);
    modeBtns.forEach(b => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (isBloq) actualizarDurGroup();
  };
  modeBtns.forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  todoDia.addEventListener('change', actualizarDurGroup);

  // --- 6) FullCalendar ---
  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
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
    editable: true,
    views: {
      resourceTimeGridDay: { titleFormat: { weekday: 'long', day: 'numeric', month: 'long' } }
    },
    resources: [
      { id: 'med1', title: 'GABINETE 1' },
      { id: 'med2', title: 'GABINETE 2' }
    ],

    dateClick: info => {
      inputFecha.value = info.dateStr.slice(0, 16);
      openSheet();
    },

    datesSet: async info => {
      const y = info.start.getFullYear();
      const m = String(info.start.getMonth() + 1).padStart(2, '0');
      const d = String(info.start.getDate()).padStart(2, '0');
      diaActual = `${y}-${m}-${d}`;
      await recargarDia();
    },

    eventClick: async function (info) {
      // Un bloqueo: ofrecer quitarlo (no abrir el modal de cita).
      if (info.event.extendedProps.esBloqueo) {
        const r = await Swal.fire({
          title: '¿Quitar bloqueo?',
          text: info.event.title,
          icon: 'question',
          showCancelButton: true,
          confirmButtonText: 'Sí, quitar',
          cancelButtonText: 'Cancelar',
          confirmButtonColor: '#DE5753'
        });
        if (r.isConfirmed) {
          try {
            await DB.deleteRecord('appointments', info.event.id);
            await recargarDia();
          } catch (e) {
            console.error('Error al quitar el bloqueo:', e);
            Swal.fire('Error', 'No se pudo quitar el bloqueo.', 'error');
          }
        }
        return;
      }

      // Cita normal: abrir el modal de edición.
      const modal = document.getElementById('edit-modal');
      document.getElementById('edit-servicio').value = info.event.extendedProps.servicio || '';
      document.getElementById('edit-cliente').value = info.event.extendedProps.cliente || '';
      document.getElementById('edit-fecha').value = info.event.startStr.slice(0, 16);
      document.getElementById('edit-medico').value = info.event.extendedProps.medico || '';
      document.getElementById('edit-estado').value = info.event.extendedProps.estado || 'Pendiente';
      modal.dataset.eventId = info.event.id;
      if (typeof modal.showModal === 'function') modal.showModal();
      else modal.setAttribute('open', '');
    },

    eventDrop: async function (info) {
      const eventId = info.event.id;
      const nuevaFechaHora = info.event.startStr.slice(0, 16);
      const nuevoMedicoId = info.event.getResources()[0]?.id || info.oldEvent.getResources()[0]?.id;

      if (info.event.start.getHours() < 9) {
        Swal.fire({ title: "Movimiento no válido", text: "La hora de la cita no puede ser antes de las 09:00.", icon: "error" });
        info.revert();
        return;
      }

      // No permitir soltar una cita sobre un horario bloqueado.
      const fin = info.event.end || new Date(info.event.start.getTime() + 30 * 60000);
      if (slotBloqueado(info.event.start, fin, nuevoMedicoId)) {
        Swal.fire({ title: "Horario bloqueado", text: "Ese hueco está marcado como no disponible. Elige otra hora o gabinete.", icon: "error" });
        info.revert();
        return;
      }

      try {
        Swal.fire({ title: 'Actualizando cita...', text: 'Por favor, espera.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        await DB.editRecord('appointments', eventId, {
          fecha: nuevaFechaHora,
          medico: nuevoMedicoId,
          cliente: info.event.extendedProps.cliente,
          servicio: info.event.extendedProps.servicio,
          estado: info.event.extendedProps.estado
        });
        info.event.setExtendedProp('medico', nuevoMedicoId);
        Swal.close();
      } catch (err) {
        console.error("Error al actualizar la cita con drag&drop:", err);
        Swal.fire('Error', 'No se pudo actualizar la cita. Se revertirán los cambios.', 'error');
        info.revert();
      }
    }
  });

  calendar.render();

  // Navegar al cambiar la fecha en el formulario.
  inputFecha.addEventListener('change', function () {
    if (this.value) calendar.gotoDate(this.value);
  });

  // --- 7) Modal de edición de cita ---
  const modal = document.getElementById('edit-modal');
  const inputServicioEdit = document.getElementById('edit-servicio');
  const inputObservacionesEdit = document.getElementById('edit-cliente');
  const inputFechaHoraEdit = document.getElementById('edit-fecha');
  const selectMedicoEdit = document.getElementById('edit-medico');
  const selectEstadoEdit = document.getElementById('edit-estado');
  const btnCerrarModalIcon = modal.querySelector('.modal__close');
  const btnCerrarModalFooter = modal.querySelector('.modal__button--close');
  const btnGuardarModal = modal.querySelector('#update-medico');

  const cerrarModal = () => {
    modal.classList.add('closing');
    setTimeout(() => { modal.classList.remove('closing'); modal.close(); }, 200);
  };
  btnCerrarModalIcon.addEventListener('click', cerrarModal);
  btnCerrarModalFooter.addEventListener('click', cerrarModal);

  btnGuardarModal.addEventListener('click', async () => {
    const eventId = modal.dataset.eventId;
    if (!eventId) { cerrarModal(); return; }

    const nuevoPaciente = inputServicioEdit.value.trim();
    const nuevasObservac = inputObservacionesEdit.value.trim();
    const nuevoFechaHora = inputFechaHoraEdit.value;
    const nuevoMedico = selectMedicoEdit.value;
    const nuevoEstado = selectEstadoEdit.value;

    if (new Date(nuevoFechaHora).getHours() < 9) {
      Swal.fire({ title: "Fecha inválida", text: "La hora debe ser posterior a las 09:00.", icon: "error" });
      return;
    }

    // No permitir editar una cita hacia un horario bloqueado.
    const ini = new Date(nuevoFechaHora);
    const fin = new Date(ini.getTime() + 30 * 60000);
    if (slotBloqueado(ini, fin, nuevoMedico)) {
      Swal.fire({ title: "Horario bloqueado", text: "Ese hueco está marcado como no disponible. Elige otra hora o gabinete.", icon: "error" });
      return;
    }

    try {
      await DB.editRecord('appointments', eventId, {
        cliente: nuevasObservac,
        servicio: nuevoPaciente,
        fecha: nuevoFechaHora,
        medico: nuevoMedico,
        estado: nuevoEstado
      });
      const fcEvent = calendar.getEventById(eventId);
      if (fcEvent) {
        fcEvent.setProp('title', `${nuevoPaciente} – ${nuevasObservac}`);
        fcEvent.setStart(nuevoFechaHora);
        fcEvent.setProp('resourceId', nuevoMedico);
        fcEvent.setExtendedProp('cliente', nuevasObservac);
        fcEvent.setExtendedProp('servicio', nuevoPaciente);
        fcEvent.setExtendedProp('medico', nuevoMedico);
        fcEvent.setExtendedProp('estado', nuevoEstado);
        const c = coloresEstado(nuevoEstado);
        fcEvent.setProp('backgroundColor', c.backgroundColor);
        fcEvent.setProp('borderColor', c.borderColor);
        fcEvent.setProp('textColor', c.textColor);
      }
    } catch (err) {
      console.error('Error al actualizar la cita:', err);
      Swal.fire('Error', 'No se pudo actualizar la cita en el servidor.', 'error');
    }

    modal.classList.add('closing');
    setTimeout(() => { modal.classList.remove('closing'); modal.close(); location.reload(); }, 200);
  });

  // --- 8) Envío del formulario (cita o bloqueo) ---
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (form.dataset.mode === 'bloqueo') { await crearBloqueo(); return; }

    const data = getFormData(form);

    if (new Date(data.fecha).getHours() < 9) {
      Swal.fire({ title: "Fecha inválida", text: "La hora debe ser posterior a las 09:00.", icon: "error" });
      return;
    }

    // Guarda: no crear una cita sobre un horario bloqueado.
    const ini = new Date(data.fecha);
    const fin = new Date(ini.getTime() + 30 * 60000);
    if (slotBloqueado(ini, fin, data.medico)) {
      Swal.fire({ icon: 'error', title: 'Horario bloqueado', text: 'Ese hueco está bloqueado (no disponible). Elige otra hora o gabinete.' });
      return;
    }

    try {
      const result = await DB.addRegister('appointments', data);
      calendar.addEvent({
        id: result.id,
        resourceId: data.medico,
        title: `${data.servicio} - ${data.cliente}`,
        start: data.fecha,
        extendedProps: { cliente: data.cliente, servicio: data.servicio, medico: data.medico, estado: data.estado },
        ...coloresEstado(data.estado)
      });
      Swal.fire('Éxito', 'Cita guardada exitosamente.', 'success');
      form.reset();
      closeSheet();
    } catch (err) {
      Swal.fire('Error', err.message, 'error');
    }
  });

  // Crea un bloqueo (uno o dos gabinetes) con estado 'Bloqueado'.
  async function crearBloqueo() {
    const fechaVal = inputFecha.value;
    if (!fechaVal) {
      Swal.fire({ icon: 'warning', title: 'Falta la fecha', text: 'Indica la fecha y hora del bloqueo.' });
      return;
    }
    const motivo = (document.getElementById('motivo').value || '').trim() || 'No disponible';
    const esTodoDia = todoDia.checked;
    const dur = parseInt(document.getElementById('duracion').value, 10) || 60;
    const gab = medicoSelect.value; // med1 | med2 | ambos
    const dia = fechaVal.slice(0, 10);

    let startStr, endStr;
    if (esTodoDia) {
      startStr = `${dia}T09:00`;
      endStr = `${dia}T21:00`;
    } else {
      startStr = fechaVal.slice(0, 16);
      const startDate = new Date(startStr);
      if (startDate.getHours() < 9) {
        Swal.fire({ title: "Hora inválida", text: "El bloqueo debe empezar a las 09:00 o después.", icon: "error" });
        return;
      }
      endStr = toLocalISO(new Date(startDate.getTime() + dur * 60000));
    }

    const gabinetes = gab === 'ambos' ? ['med1', 'med2'] : [gab];
    try {
      Swal.fire({ title: 'Bloqueando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      for (const g of gabinetes) {
        await DB.addRegister('appointments', {
          servicio: motivo,
          cliente: endStr, // el FIN del bloqueo se guarda aquí (columna libre para bloqueos)
          fecha: startStr,
          medico: g,
          estado: 'Bloqueado'
        });
      }
      await recargarDia();
      Swal.fire('Bloqueado', esTodoDia ? 'El día se marcó como no disponible.' : 'El horario se marcó como no disponible.', 'success');
      document.getElementById('motivo').value = '';
      todoDia.checked = false;
      actualizarDurGroup();
      closeSheet();
    } catch (err) {
      console.error('Error al crear el bloqueo:', err);
      Swal.fire('Error', 'No se pudo crear el bloqueo: ' + (err.message || err), 'error');
    }
  }
});
