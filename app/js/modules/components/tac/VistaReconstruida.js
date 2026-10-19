// modules/components/tac/VistaReconstruida.js
// Vista 2D de una imagen que NO es un corte del volumen sino que se calcula a
// partir de él: la panorámica y las transversales (Panoramica.js). La imagen
// llega ya hecha como valores de gris (Float32, NaN = fuera del volumen) y aquí
// solo se pinta con la ventana del visor; todo lo demás (rótulos, medidas,
// ratón) es lo de VistaLienzo.
//
// Lo propio de cada una (qué rótulos, qué hace el clic o la rueda) lo pone la
// `fuente` (Panoramica), para no repartir la geometría de la curva en dos sitios.

import VistaLienzo from "./VistaLienzo.js";

export default class VistaReconstruida extends VistaLienzo {
    /**
     * @param {HTMLElement} panel - <section class="tac-vista">
     * @param {Object} visor - estado compartido (visor.js)
     * @param {Object} opciones
     * @param {string} opciones.nombre
     * @param {string} opciones.titulo
     * @param {string} opciones.color
     * @param {string[]} opciones.letras - [izquierda, derecha, arriba, abajo]
     * @param {{clave, lineas, encima, navegar, desplazar}} opciones.fuente
     */
    constructor(panel, visor, { nombre, titulo, color, letras, fuente }) {
        super(panel.querySelector(".tac-vista__cuerpo"), visor, { nombre, titulo, color });
        this.letrasFijas = letras;
        this.fuente = fuente;
        this.valores = null;
    }

    fijarValores(valores, ancho, alto, mmX, mmY) {
        this.valores = valores;
        this.fijarImagen(ancho, alto, mmX, mmY);
    }

    quitarImagen(mensaje) {
        this.valores = null;
        super.quitarImagen(mensaje);
    }

    rellenar(gris) {
        const valores = this.valores;
        const px = this.pixeles;
        for (let p = 0, n = valores.length; p < n; p++) {
            const v = valores[p];
            px[p] = v === v ? gris(v) : 0xff000000;   // NaN (fuera del volumen) = negro
        }
    }

    valorEn(u, v) {
        const iu = Math.floor(u);
        const iv = Math.floor(v);
        if (!this.valores || iu < 0 || iv < 0 || iu >= this.ancho || iv >= this.alto) return NaN;
        return this.valores[iv * this.ancho + iu];
    }

    claveCorte() { return this.fuente.clave(this); }
    lineasRotulo() { return this.fuente.lineas(this); }
    letras() { return this.letrasFijas; }
    pintarEncima(ctx, e) { this.fuente.encima(ctx, e, this); }
    alNavegar(u, v) { this.fuente.navegar(u, v, this); }
    alDesplazar(pasos) { this.fuente.desplazar(pasos, this); }
}
