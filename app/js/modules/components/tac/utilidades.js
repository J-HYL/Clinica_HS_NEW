// modules/components/tac/utilidades.js
// Piezas compartidas por las pantallas de la sección TAC.

// La sección TAC solo funciona en ordenador: el volumen ocupa cientos de MB de
// memoria y se maneja con ratón (rueda para recorrer cortes, botón derecho para
// el contraste). La MISMA condición oculta la entrada del menú en sidebar.css.
const CONSULTA_ESCRITORIO = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

export function esEscritorio() {
    return window.matchMedia(CONSULTA_ESCRITORIO).matches;
}

export function formatearBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** "2026-01-15" o "2026-01-15 10:30:00" -> "15/01/2026". */
export function formatearFecha(valor) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
}

/** "0.2,0.2,0.2" -> "0,2 mm" (o "0,2 × 0,2 × 0,25 mm" si no es isótropo). */
export function textoVoxel(x, y, z) {
    const valores = [x, y, z].map(Number).filter(v => v > 0);
    if (!valores.length) return "—";
    const formato = (v) => v.toLocaleString("es-ES", { maximumFractionDigits: 3 });
    const iguales = valores.every(v => Math.abs(v - valores[0]) < 0.001);
    return iguales ? `${formato(valores[0])} mm` : `${valores.map(formato).join(" × ")} mm`;
}

// Partículas que no identifican a nadie ("María DE LA Paz").
const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);

/** Palabras de un nombre, sin tildes ni mayúsculas ("GARCÍA^MARÍA" -> ["garcia", "maria"]). */
function palabras(nombre) {
    return (nombre || "")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter(p => p.length > 1 && !PARTICULAS.has(p));
}

/**
 * ¿El nombre que trae el DICOM es el del paciente de la ficha? Se compara por
 * palabras, sin importar el orden (el DICOM lo guarda como "APELLIDOS^NOMBRE"):
 * TODAS las palabras del nombre más corto tienen que estar en el otro. Así
 * "GARCIA^MARIA" vale para "María García Ruiz", pero "LOPEZ^MARIA" no (que
 * coincida un nombre de pila común no basta). null si el DICOM no trae nombre.
 */
export function mismoPaciente(nombreDicom, nombreFicha) {
    const a = palabras(nombreDicom);
    const b = palabras(nombreFicha);
    if (!a.length) return null;
    if (!b.length) return false;
    const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
    return corto.every(p => largo.includes(p));
}
