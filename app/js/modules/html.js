// modules/html.js
// Unica fuente de verdad para escapar texto antes de inyectarlo en innerHTML.
// Cualquier dato que venga de la BD (nombre, alergias, diagnostico, etc.) debe
// pasar por aqui antes de interpolarse en un template de HTML.

export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}
