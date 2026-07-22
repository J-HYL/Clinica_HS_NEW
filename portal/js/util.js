// portal/js/util.js
// Utilidades del portal: escape, formato es-ES de dinero/fechas, toast, iniciales.

/** Escapa datos de BD antes de meterlos en innerHTML (misma regla que el panel). */
export function escapeHtml(v) {
  if (v == null) return "";
  return String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

const eur   = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const dLong = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });
const dShort= new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
const tFmt  = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

export const fmtMoney = (n) => eur.format(Number(n) || 0);

/** Parsea 'YYYY-MM-DD HH:MM:SS' (hora local de la clinica). Safari exige la 'T'. */
export function parseDbDate(s) {
  if (!s || String(s).startsWith("0000")) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function fmtDateLong(s)  { const d = parseDbDate(s); return d ? cap(dLong.format(d)) : ""; }
export function fmtDateShort(s) { const d = parseDbDate(s); return d ? dShort.format(d) : ""; }
export function fmtTime(s)      { const d = parseDbDate(s); return d ? tFmt.format(d) : ""; }

/** "Hoy" / "Mañana" / "Ayer" o la fecha larga. */
export function relDay(s) {
  const d = parseDbDate(s);
  if (!d) return "";
  const a = new Date(); const hoy = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((b - hoy) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return cap(dLong.format(d));
}

export function initials(name) {
  if (!name) return "?";
  const p = String(name).trim().split(/\s+/);
  return (((p[0] || "")[0] || "") + ((p[1] || "")[0] || "")).toUpperCase() || "?";
}

/** Nombre de pila para el saludo. Soporta "Apellido, Nombre" -> "Nombre". */
export function nombrePila(nombre) {
  if (!nombre) return "";
  let s = String(nombre).trim();
  if (s.includes(",")) s = (s.split(",")[1] || s).trim();
  return s.split(/\s+/)[0] || "";
}

export const spinnerHtml = '<div class="spinner" role="status" aria-label="Cargando"></div>';

let toastEl;
/** Aviso breve tipo iOS. */
export function toast(msg, isError = false) {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.toggle("toast--error", isError);
  // fuerza reflow para reiniciar la animacion si ya estaba visible
  void toastEl.offsetWidth;
  toastEl.classList.add("toast--show");
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.classList.remove("toast--show"), 2600);
}
