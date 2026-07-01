// DashboardPanels.js
// Paneles del dashboard: saludo contextual, agenda de citas de hoy y
// donut de estado de tratamientos. Reutiliza los colores/iconos por estado
// ya definidos en el proyecto (variables.js + paleta de base.css).

import { appointmentStatusIcon } from "../variables.js";

const GAB_LABELS = { med1: "Gabinete 1", med2: "Gabinete 2" };

// 'YYYY-MM-DD' de hoy (mismo criterio que Stats.js para que el número
// "Citas para Hoy" y esta lista siempre coincidan).
function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

// Saludo por franja horaria + fecha en español.
export function renderGreeting() {
  const el = document.getElementById("header-greeting");
  if (!el) return;

  const now = new Date();
  const hour = now.getHours();
  const saludo = hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const fecha = now.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  el.textContent = `${saludo} — ${fecha}`;
}

// Lista de citas del día ordenadas por hora.
// OJO (inconsistencia del proyecto): en appointments la columna `servicio`
// guarda el NOMBRE DEL PACIENTE y `cliente` guarda las OBSERVACIONES.
export function renderTodayAgenda(appointments) {
  const list = document.getElementById("agenda-list");
  const count = document.getElementById("agenda-count");
  if (!list) return;

  const todayStr = getTodayString();
  const citas = appointments
    .filter((a) => a.fecha && a.fecha.slice(0, 10) === todayStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (count) count.textContent = citas.length ? `${citas.length} ${citas.length === 1 ? "cita" : "citas"}` : "";

  list.innerHTML = "";

  if (!citas.length) {
    const empty = document.createElement("li");
    empty.className = "agenda__empty";
    empty.innerHTML = '<i class="ri-calendar-line"></i>';
    empty.append("No hay citas para hoy");
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  citas.forEach((cita) => fragment.appendChild(crearFilaAgenda(cita)));
  list.appendChild(fragment);
}

function crearFilaAgenda(cita) {
  const estado = cita.estado || "Pendiente";
  const estadoKey = estado.toLowerCase();
  const hora = (cita.fecha || "").slice(11, 16) || "--:--";
  const paciente = (cita.servicio || "").trim() || "Sin nombre";
  const nota = (cita.cliente || "").trim();

  const li = document.createElement("li");
  li.className = "agenda__item";
  li.dataset.estado = estadoKey;

  // Hora
  const time = document.createElement("span");
  time.className = "agenda__time";
  time.innerHTML = '<i class="ri-time-line"></i>';
  time.append(` ${hora}`);

  // Paciente (+ observaciones)
  const info = document.createElement("div");
  info.className = "agenda__info";
  const pac = document.createElement("span");
  pac.className = "agenda__patient";
  pac.textContent = paciente;
  info.appendChild(pac);
  if (nota) {
    const note = document.createElement("span");
    note.className = "agenda__note";
    note.textContent = nota;
    info.appendChild(note);
  }

  // Gabinete + estado
  const meta = document.createElement("div");
  meta.className = "agenda__meta";
  if (GAB_LABELS[cita.medico]) {
    const gab = document.createElement("span");
    gab.className = `agenda__gab gab--${cita.medico}`;
    gab.textContent = GAB_LABELS[cita.medico];
    meta.appendChild(gab);
  }
  const status = document.createElement("span");
  status.className = "agenda__status";
  const icon = document.createElement("i");
  icon.className = appointmentStatusIcon[estadoKey] || appointmentStatusIcon.pendiente;
  status.appendChild(icon);
  status.append(` ${estado}`);
  meta.appendChild(status);

  li.appendChild(time);
  li.appendChild(info);
  li.appendChild(meta);
  return li;
}

// Donut SVG (sin librerías) del estado de los tratamientos.
export function renderTreatmentsDonut(treatments) {
  const container = document.getElementById("donut");
  if (!container) return;

  const counts = { pagado: 0, parcial: 0, pendiente: 0 };
  treatments.forEach((t) => {
    const estado = (t.estado || "").toLowerCase();
    if (estado in counts) counts[estado] += 1;
  });

  const segments = [
    { label: "Pagado", value: counts.pagado, color: "var(--green)" },
    { label: "Parcial", value: counts.parcial, color: "var(--orange-status)" },
    { label: "Pendiente", value: counts.pendiente, color: "var(--pink)" },
  ];
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  const R = 60;
  const circ = 2 * Math.PI * R;
  let acc = 0;

  const arcs = total
    ? segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const len = (s.value / total) * circ;
          const arc = `<circle class="donut__seg" cx="80" cy="80" r="${R}" fill="none"
            stroke="${s.color}" stroke-width="22"
            stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-acc}" />`;
          acc += len;
          return arc;
        })
        .join("")
    : `<circle cx="80" cy="80" r="${R}" fill="none" stroke="#EBEBEB" stroke-width="22" />`;

  const legend = segments
    .map((s) => {
      const pct = total ? Math.round((s.value / total) * 100) : 0;
      return `<li class="donut__legend-item">
        <span class="donut__dot" style="background:${s.color}"></span>
        <span class="donut__legend-label">${s.label}</span>
        <span class="donut__legend-val">${s.value} · ${pct}%</span>
      </li>`;
    })
    .join("");

  container.innerHTML = `
    <div class="donut__chart">
      <svg viewBox="0 0 160 160" class="donut__svg">
        <g transform="rotate(-90 80 80)">${arcs}</g>
      </svg>
      <div class="donut__center"><strong>${total}</strong><span>tratamientos</span></div>
    </div>
    <ul class="donut__legend">${legend}</ul>
  `;
}
