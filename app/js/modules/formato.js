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

/**
 * Fecha de BD ('AAAA-MM-DD[ T]HH:MM[:SS]' o 'AAAA-MM-DD') como 'DD/MM/AAAA' o
 * 'DD/MM/AAAA HH:MM'. Trabaja sobre el texto (sin new Date) para no desfasar
 * por zona horaria. '0000-00-00' (basura en datos reales) -> "".
 */
export function formatFecha(value) {
  if (!value) return "";
  const [datePart, timePart = ""] = String(value).replace("T", " ").split(" ");
  const [y, m, d] = datePart.split("-");
  if (!y || !m || !d) return String(value); // formato no reconocido
  if (y === "0000") return "";
  let out = `${d}/${m}/${y}`;
  const [hh, mm] = timePart.split(":");
  if (hh && mm) out += ` ${hh}:${mm}`;
  return out;
}

/** "09:30" de 'AAAA-MM-DD HH:MM:SS' */
export function hora(texto) {
  return String(texto || "").slice(11, 16) || "--:--";
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

/** "María García López" -> "MG" */
export function iniciales(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return ((partes[0][0] || "") + (partes.length > 1 ? partes[1][0] : "")).toUpperCase();
}
