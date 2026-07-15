// modules/components/CodigoQR.js
// Genera codigos propios y sus etiquetas QR imprimibles, para los elementos que
// no traen codigo de barras de fabrica.
//
// El codigo es lo unico que se guarda en BD (inventario.codigo); el QR es solo
// una forma de imprimirlo. Un elemento con codigo de barras de fabrica no
// necesita nada de esto: se escanea su EAN y se guarda tal cual.
//
// qrcode() viene de un <script> CDN (global), como Swal o DataTables. Devuelve
// el QR ya como data URL, asi que no hace falta canvas: se asigna a un <img>.

import { escapeHtml } from "../html.js";

// Sin O/0 ni I/1: si alguien tiene que teclear el codigo a mano o leerlo de una
// etiqueta despegada, esos pares son los que se confunden.
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGITUD = 8;

/** Devuelve un codigo propio del tipo HSD-A7K2M9P4. */
export function generarCodigoPropio() {
    const bytes = crypto.getRandomValues(new Uint8Array(LONGITUD));
    const cuerpo = Array.from(bytes, byte => ALFABETO[byte % ALFABETO.length]).join("");
    return `HSD-${cuerpo}`;
}

/**
 * Devuelve el QR de un codigo como data URL.
 * @param {string} codigo
 * @param {number} celda - px por modulo del QR (a mas, mas resolucion)
 */
function generarQR(codigo, celda) {
    const qr = qrcode(0, "M");   // 0 = tamaño automatico segun lo que ocupe el texto
    qr.addData(codigo);
    qr.make();
    return qr.createDataURL(celda, celda * 2);
}

/** Pinta la vista previa del QR en un <img>. */
export function pintarQR(img, codigo) {
    img.src = generarQR(codigo, 5);
    img.alt = `Código QR de ${codigo}`;
}

/** Abre el dialogo de impresion con la etiqueta lista para recortar y pegar. */
export function imprimirEtiqueta({ codigo, nombre, ubicacion }) {
    const imagen = generarQR(codigo, 10);   // mas resolucion: esto va a papel

    const etiqueta = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Etiqueta ${escapeHtml(codigo)}</title>
            <style>
                @page { margin: 10mm; }
                body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
                .etiqueta {
                    width: 62mm;
                    padding: 4mm;
                    border: 1px dashed #999;
                    border-radius: 3mm;
                    text-align: center;
                }
                /* El QR es un bitmap: sin suavizado los cuadros salen nitidos al escalar. */
                .etiqueta img { width: 34mm; height: 34mm; image-rendering: pixelated; }
                .etiqueta__nombre { margin: 2mm 0 1mm; font-size: 11pt; font-weight: bold; }
                .etiqueta__ubicacion { margin: 0 0 2mm; font-size: 8pt; color: #444; }
                .etiqueta__codigo { margin: 0; font-family: "Courier New", monospace; font-size: 9pt; letter-spacing: .5px; }
            </style>
        </head>
        <body>
            <div class="etiqueta">
                <img src="${imagen}" alt="Código QR de ${escapeHtml(nombre)}" onload="window.focus(); window.print();">
                <p class="etiqueta__nombre">${escapeHtml(nombre)}</p>
                ${ubicacion ? `<p class="etiqueta__ubicacion">${escapeHtml(ubicacion)}</p>` : ""}
                <p class="etiqueta__codigo">${escapeHtml(codigo)}</p>
            </div>
        </body>
        </html>
    `;

    const ventana = window.open("", "_blank");
    if (!ventana) throw new Error("El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.");
    ventana.document.write(etiqueta);
    ventana.document.close();
}
