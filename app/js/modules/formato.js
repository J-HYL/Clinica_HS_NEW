// modules/formato.js
// Formato de fechas, importes y cifras para la interfaz (es-ES). Funciones
// puras, sin DOM: se pueden importar desde cualquier pantalla.
//
// Fechas de la BD: 'AAAA-MM-DD HH:MM:SS' (hora local de la clinica). Se leen
// como hora LOCAL, nunca con toISOString(), que pasa a UTC y entre las 00:00 y
// las 01:00/02:00 de Madrid daria el dia anterior.

const LOCALE = "es-ES";

/** 'AAAA-MM-DD' del dia local de una fecha (por defecto, hoy). */
export function fechaISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Date local a partir de 'AAAA-MM-DD' o 'AAAA-MM-DD HH:MM:SS' (null si no vale). */
export function aFecha(texto) {
  if (!texto) return null;
  const [dia, hora = "00:00:00"] = String(texto).split(/[ T]/);
  const [a, m, d] = dia.split("-").map(Number);
  const [h, min, s] = hora.split(":").map(Number);
  const fecha = new Date(a, (m || 1) - 1, d || 1, h || 0, min || 0, s || 0);
  return isNaN(fecha.getTime()) || !a ? null : fecha;
}

/** Suma n dias a 'AAAA-MM-DD' y devuelve 'AAAA-MM-DD'. */
export function sumarDias(iso, n) {
  const f = aFecha(iso);
  f.setDate(f.getDate() + n);
  return fechaISO(f);
}

/** "miércoles, 19 de noviembre" */
export function fechaLarga(iso) {
  return aFecha(iso)?.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" }) ?? "";
}

/** "12 nov 2026" */
export function fechaCorta(texto) {
  return aFecha(texto)?.toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" }).replace(".", "") ?? "";
}

/** "09:30" de 'AAAA-MM-DD HH:MM:SS' */
export function hora(texto) {
  return String(texto || "").slice(11, 16) || "--:--";
}

/** Nombre del mes anterior al de 'AAAA-MM-DD': "octubre" */
export function mesAnterior(iso) {
  const f = aFecha(iso);
  return new Date(f.getFullYear(), f.getMonth() - 1, 1).toLocaleDateString(LOCALE, { month: "long" });
}

/** 1.248 (con separador de miles tambien en 4 cifras) */
export function numero(n) {
  return new Intl.NumberFormat(LOCALE, { useGrouping: "always" }).format(Number(n) || 0);
}

/** 18.420 € / 125,00 € */
export function euros(n, decimales = 2) {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
    useGrouping: "always",
  }).format(Number(n) || 0);
}

/** Variacion porcentual: { texto: "+12,6 %", sube: true }, o null si no hay base. */
export function variacion(actual, anterior) {
  if (!anterior) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  const texto = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, signDisplay: "always" }).format(pct) + " %";
  return { texto, sube: pct >= 0 };
}

/** "María García López" -> "MG" */
export function iniciales(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] || "") + (partes.length > 1 ? partes[1][0] : "")).toUpperCase();
}
