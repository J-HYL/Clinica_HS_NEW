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

const CITAS_POR_PAGINA = 3;

// Lista de citas del día ordenadas por hora, paginada en un slider de 3 en 3.
// OJO (inconsistencia del proyecto): en appointments la columna `servicio`
// guarda el NOMBRE DEL PACIENTE y `cliente` guarda las OBSERVACIONES.
export function renderTodayAgenda(appointments) {
  const track = document.getElementById("agenda-track");
  const count = document.getElementById("agenda-count");
  const nav = document.getElementById("agenda-nav");
  const dotsWrap = document.getElementById("agenda-dots");
  const prevBtn = document.getElementById("agenda-prev");
  const nextBtn = document.getElementById("agenda-next");
  if (!track) return;

  const todayStr = getTodayString();
  const citas = appointments
    .filter((a) => a.fecha && a.fecha.slice(0, 10) === todayStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  if (count) count.textContent = citas.length ? `${citas.length} ${citas.length === 1 ? "cita" : "citas"}` : "";

  track.innerHTML = "";
  if (dotsWrap) dotsWrap.innerHTML = "";

  // Sin citas: una sola "página" con el estado vacío, sin controles.
  if (!citas.length) {
    if (nav) nav.hidden = true;
    track.style.transform = "translateX(0)";
    const page = document.createElement("div");
    page.className = "agenda__page";
    const empty = document.createElement("div");
    empty.className = "agenda__empty";
    empty.innerHTML = '<i class="ri-calendar-line"></i>';
    empty.append("No hay citas para hoy");
    page.appendChild(empty);
    track.appendChild(page);
    return;
  }

  // Repartir en páginas de 3.
  const paginas = [];
  for (let i = 0; i < citas.length; i += CITAS_POR_PAGINA) {
    paginas.push(citas.slice(i, i + CITAS_POR_PAGINA));
  }

  paginas.forEach((grupo) => {
    const page = document.createElement("div");
    page.className = "agenda__page";
    grupo.forEach((cita) => page.appendChild(crearFilaAgenda(cita)));
    track.appendChild(page);
  });

  // Slider solo si hay más de una página (más de 3 citas).
  const haySlider = paginas.length > 1;
  if (nav) nav.hidden = !haySlider;
  track.style.transform = "translateX(0)";
  if (!haySlider) return;

  let indice = 0;
  const dots = [];

  const actualizar = () => {
    track.style.transform = `translateX(-${indice * 100}%)`;
    if (prevBtn) prevBtn.disabled = indice === 0;
    if (nextBtn) nextBtn.disabled = indice === paginas.length - 1;
    dots.forEach((dot, i) => dot.classList.toggle("agenda__dot--active", i === indice));
  };

  if (dotsWrap) {
    paginas.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "agenda__dot";
      dot.setAttribute("aria-label", `Página ${i + 1}`);
      dot.addEventListener("click", () => { indice = i; actualizar(); });
      dots.push(dot);
      dotsWrap.appendChild(dot);
    });
  }

  // onclick (no addEventListener) para no acumular handlers si se re-renderiza.
  if (prevBtn) prevBtn.onclick = () => { if (indice > 0) { indice--; actualizar(); } };
  if (nextBtn) nextBtn.onclick = () => { if (indice < paginas.length - 1) { indice++; actualizar(); } };

  actualizar();
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
