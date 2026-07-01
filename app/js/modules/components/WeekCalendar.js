// WeekCalendar.js
// Vista semanal 100% propia (rejilla horas × días, sin FullCalendar),
// con el estilo del calendario custom. La usa la página semana.html.

import { reloadPage } from "../funciones.js";
import DB from "../classes/DB_API.js";
import Alert from "./Alert.js";

// --- Configuración de la rejilla (debe coincidir con el CSS de semana.html) ---
const HORA_INICIO = 9;      // primera hora visible
const HORA_FIN = 21;        // última hora visible (exclusiva)
const ALTO_HORA = 48;       // px por hora
const DURACION_DEF = 30;    // duración por defecto de una cita (min)
const TOTAL_MIN = (HORA_FIN - HORA_INICIO) * 60;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Fecha de referencia de la semana mostrada (se muta al navegar).
const semanaActual = new Date();

const ymd = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Lunes de la semana que contiene `date`.
function inicioSemana(date) {
  const d = new Date(date);
  const dia = d.getDay();                 // 0=Domingo ... 6=Sábado
  const desfase = dia === 0 ? -6 : 1 - dia;
  d.setDate(d.getDate() + desfase);
  d.setHours(0, 0, 0, 0);
  return d;
}

function tituloSemana(lunes, domingo) {
  const anio = domingo.getFullYear();
  if (lunes.getMonth() === domingo.getMonth()) {
    return `${lunes.getDate()} – ${domingo.getDate()} de ${MESES[domingo.getMonth()]} de ${anio}`;
  }
  return `${lunes.getDate()} de ${MESES[lunes.getMonth()]} – ${domingo.getDate()} de ${MESES[domingo.getMonth()]} de ${anio}`;
}

export function setSemana(step) {
  semanaActual.setDate(semanaActual.getDate() + step * 7);
  renderSemana();
}

export function renderSemana() {
  const heading = document.querySelector("#calendar-date");
  const head = document.querySelector("#week-head");
  const grid = document.querySelector("#week-grid");

  const lunes = inicioSemana(semanaActual);
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(lunes);
    d.setDate(lunes.getDate() + i);
    return d;
  });
  const domingo = dias[6];
  heading.textContent = tituloSemana(lunes, domingo);

  const hoyStr = ymd(new Date());

  // --- Cabecera de días ---
  head.innerHTML = '<div class="week__corner"></div>';
  dias.forEach((d, i) => {
    const el = document.createElement("div");
    el.className = "week__dayhead" + (ymd(d) === hoyStr ? " week__dayhead--today" : "");
    el.innerHTML = `<span class="week__dayname">${DIAS[i]}</span> ${d.getDate()}/${d.getMonth() + 1}`;
    head.appendChild(el);
  });

  // --- Cuerpo: columna de horas + 7 columnas de día ---
  grid.innerHTML = "";

  const horas = document.createElement("div");
  horas.className = "week__hours";
  for (let h = HORA_INICIO; h < HORA_FIN; h++) {
    const lbl = document.createElement("div");
    lbl.className = "week__hour-label";
    lbl.textContent = `${String(h).padStart(2, "0")}:00`;
    horas.appendChild(lbl);
  }
  grid.appendChild(horas);

  const columnas = dias.map(d => {
    const col = document.createElement("div");
    col.className = "week__col";
    col.dataset.date = ymd(d);

    // Zona de destino para arrastrar citas a otro día.
    col.addEventListener("dragover", e => {
      e.preventDefault();
      col.classList.add("drag__over");
    });
    col.addEventListener("dragleave", () => col.classList.remove("drag__over"));
    col.addEventListener("drop", e => moverCita(e, col));

    grid.appendChild(col);
    return col;
  });

  // --- Línea de "ahora" (solo si hoy está en la semana visible) ---
  const ahora = new Date();
  const hoyIdx = dias.findIndex(d => ymd(d) === hoyStr);
  if (hoyIdx >= 0) {
    const nowMin = (ahora.getHours() - HORA_INICIO) * 60 + ahora.getMinutes();
    if (nowMin >= 0 && nowMin <= TOTAL_MIN) {
      const linea = document.createElement("div");
      linea.className = "week__now";
      linea.style.top = `${(nowMin / 60) * ALTO_HORA}px`;
      columnas[hoyIdx].appendChild(linea);
    }
  }

  // --- Cargar y colocar las citas de la semana ---
  const desde = ymd(lunes);
  const hasta = ymd(new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + 1)); // exclusivo

  DB.getRecords("appointments")
    .then(apps => {
      const porDia = Array.from({ length: 7 }, () => []);

      apps.forEach(a => {
        const diaISO = a.fecha.slice(0, 10);
        if (diaISO < desde || diaISO >= hasta) return;
        const idx = dias.findIndex(d => ymd(d) === diaISO);
        if (idx < 0) return;

        const h = Number(a.fecha.slice(11, 13));
        const m = Number(a.fecha.slice(14, 16));
        let inicio = (h - HORA_INICIO) * 60 + m;
        inicio = Math.max(0, Math.min(inicio, TOTAL_MIN - 15));

        porDia[idx].push({
          ...a,
          inicio,
          fin: Math.min(inicio + DURACION_DEF, TOTAL_MIN),
          hora: a.fecha.slice(11, 16)
        });
      });

      porDia.forEach((evs, idx) => {
        posicionar(evs);
        evs.forEach(ev => columnas[idx].appendChild(crearEvento(ev)));
      });
    })
    .catch(err => Alert.showStatusAlert("error", "¡Error!", err.message, reloadPage));
}

// Reparte en carriles las citas que se solapan para mostrarlas lado a lado.
function posicionar(evs) {
  evs.sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);

  const procesar = cluster => {
    const carriles = []; // carril -> minuto de fin del último evento
    cluster.forEach(ev => {
      let carril = carriles.findIndex(fin => ev.inicio >= fin);
      if (carril === -1) {
        carril = carriles.length;
        carriles.push(ev.fin);
      } else {
        carriles[carril] = ev.fin;
      }
      ev.carril = carril;
    });
    cluster.forEach(ev => (ev.carriles = carriles.length));
  };

  let cluster = [];
  let finCluster = -1;
  evs.forEach(ev => {
    if (cluster.length && ev.inicio >= finCluster) {
      procesar(cluster);
      cluster = [];
      finCluster = -1;
    }
    cluster.push(ev);
    finCluster = Math.max(finCluster, ev.fin);
  });
  if (cluster.length) procesar(cluster);
}

function crearEvento(ev) {
  const el = document.createElement("div");
  el.className = `week__event appointment__${(ev.estado || "pendiente").toLowerCase()}`;

  const ancho = 100 / ev.carriles;
  el.style.top = `${(ev.inicio / 60) * ALTO_HORA}px`;
  el.style.height = `${((ev.fin - ev.inicio) / 60) * ALTO_HORA}px`;
  el.style.left = `calc(${ev.carril * ancho}% + 2px)`;
  el.style.width = `calc(${ancho}% - 4px)`;

  el.innerHTML = `<span class="hora">${ev.hora}</span> ${ev.servicio ?? ""}`;
  el.title = `${ev.hora} · ${ev.servicio ?? ""}${ev.cliente ? " · " + ev.cliente : ""}`;

  // Arrastrar para cambiar la cita de día (conserva la hora).
  el.draggable = true;
  el.addEventListener("dragstart", e => {
    e.dataTransfer.setData("id", String(ev.id));
    e.dataTransfer.setData("hora", ev.hora);
    e.dataTransfer.setData("fecha", ev.fecha.slice(0, 10));
    e.dataTransfer.dropEffect = "move";
    el.classList.add("week__event--dragging");
  });
  el.addEventListener("dragend", () => el.classList.remove("week__event--dragging"));

  // Al pulsar una cita, abre la vista diaria de ese día para editarla.
  el.addEventListener("click", e => {
    e.stopPropagation();
    window.location.href = `/pages/citas/vista_diaria.html?date=${ev.fecha.slice(0, 10)}`;
  });

  return el;
}

// Mueve una cita al día de la columna destino (misma hora), confirma y refresca.
async function moverCita(e, col) {
  e.preventDefault();
  col.classList.remove("drag__over");

  const id = e.dataTransfer.getData("id");
  const hora = e.dataTransfer.getData("hora") || "09:00";
  const origen = e.dataTransfer.getData("fecha");
  const destino = col.dataset.date;
  if (!id || destino === origen) return;

  const [y, m, d] = destino.split("-");
  const result = await Swal.fire({
    title: "¿Mover la cita?",
    text: `Se moverá al ${d}/${m}/${y} a las ${hora}.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, mover",
    cancelButtonText: "Cancelar"
  });
  if (!result.isConfirmed) return;

  try {
    await DB.editRecord("appointments", id, { fecha: `${destino}T${hora}` });
    renderSemana();
  } catch (err) {
    Alert.showStatusAlert("error", "¡Error!", "No se pudo mover la cita.", reloadPage);
  }
}
