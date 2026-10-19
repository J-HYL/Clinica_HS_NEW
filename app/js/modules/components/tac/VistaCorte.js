// modules/components/tac/VistaCorte.js
// Una vista 2D del volumen (axial, coronal o sagital). Lo común a todas las
// vistas 2D (pintado, rótulos, medidas, ratón, captura) está en VistaLienzo.js;
// aquí solo va cómo se saca el corte del volumen y la cruz de referencia.
//
// El corte se saca del volumen COMPLETO en cada pintado (son unos pocos ms) y se
// escala con el tamaño real del vóxel, así coronal y sagital salen con sus
// proporciones aunque los cortes estén más separados que los píxeles.
//
// Cada panel lleva además una barra vertical para recorrer los cortes.

import VistaLienzo, { formatoNumero } from "./VistaLienzo.js";

export const PLANOS = {
    // letras: [izquierda, derecha, arriba, abajo] de la imagen (convención radiológica)
    axial:   { titulo: "Axial",   color: "#2b80f7", letras: ["R", "L", "A", "P"], eje: 2 },
    coronal: { titulo: "Coronal", color: "#3cd856", letras: ["R", "L", "S", "I"], eje: 1 },
    sagital: { titulo: "Sagital", color: "#ff947a", letras: ["A", "P", "S", "I"], eje: 0 },
};

// Qué plano representa cada línea de la cruz en cada vista: [vertical, horizontal].
const LINEAS_CRUZ = {
    axial: ["sagital", "coronal"],
    coronal: ["sagital", "axial"],
    sagital: ["coronal", "axial"],
};

// Rueda hacia abajo: axial baja hacia inferior; coronal y sagital avanzan en su eje.
const SENTIDO_RUEDA = { axial: -1, coronal: 1, sagital: 1 };

export default class VistaCorte extends VistaLienzo {
    /**
     * @param {HTMLElement} panel - <section class="tac-vista"> con su cuerpo y su barra de cortes
     * @param {"axial"|"coronal"|"sagital"} plano
     * @param {Object} visor - estado compartido (visor.js)
     */
    constructor(panel, plano, visor) {
        const definicion = PLANOS[plano];
        super(panel.querySelector(".tac-vista__cuerpo"), visor, { nombre: plano, titulo: definicion.titulo, color: definicion.color });
        this.plano = plano;
        this.definicion = definicion;

        const [nx, ny, nz] = visor.volumen.dims;
        const [sx, sy, sz] = visor.volumen.espaciado;
        this.fijarImagen(...{
            axial: [nx, ny, sx, sy],
            coronal: [nx, nz, sx, sz],
            sagital: [ny, nz, sy, sz],
        }[plano]);

        this.barra = panel.querySelector(".tac-vista__corte");
        this.barra.min = 0;
        this.barra.max = this.total - 1;
        this.barra.style.setProperty("--color-plano", definicion.color);
        this.barra.addEventListener("input", () => {
            this.visor.cursor[this.definicion.eje] = Number(this.barra.value);
            this.visor.alCambiar();
        });
    }

    // --- corte actual -------------------------------------------------------

    get indice() {
        return this.visor.cursor[this.definicion.eje];
    }

    get total() {
        return this.visor.volumen.dims[this.definicion.eje];
    }

    claveCorte() {
        return this.indice;
    }

    moverCorte(pasos) {
        const eje = this.definicion.eje;
        const nuevo = Math.min(this.total - 1, Math.max(0, this.visor.cursor[eje] + pasos));
        if (nuevo === this.visor.cursor[eje]) return;
        this.visor.cursor[eje] = nuevo;
        this.visor.alCambiar();
    }

    alDesplazar(pasos) {
        this.moverCorte(pasos * SENTIDO_RUEDA[this.plano]);
    }

    /** Punto de referencia en coordenadas de esta imagen [u, v]. */
    cursorEnImagen() {
        const [i, j, k] = this.visor.cursor;
        const nz = this.visor.volumen.dims[2];
        if (this.plano === "axial") return [i, j];
        if (this.plano === "coronal") return [i, nz - 1 - k];
        return [j, nz - 1 - k];
    }

    alNavegar(u, v) {
        const iu = Math.min(this.ancho - 1, Math.max(0, Math.floor(u)));
        const iv = Math.min(this.alto - 1, Math.max(0, Math.floor(v)));
        const cursor = this.visor.cursor;
        const nz = this.visor.volumen.dims[2];
        if (this.plano === "axial") { cursor[0] = iu; cursor[1] = iv; }
        else if (this.plano === "coronal") { cursor[0] = iu; cursor[2] = nz - 1 - iv; }
        else { cursor[1] = iu; cursor[2] = nz - 1 - iv; }
        this.visor.alCambiar();
    }

    // --- imagen -------------------------------------------------------------

    /** Copia el corte actual del volumen a la imagen. */
    rellenar(gris) {
        const { datos, dims: [nx, ny, nz] } = this.visor.volumen;
        const px = this.pixeles;
        const [ci, cj, ck] = this.visor.cursor;

        if (this.plano === "axial") {
            const base = ck * nx * ny;
            for (let p = 0, n = nx * ny; p < n; p++) px[p] = gris(datos[base + p]);
        } else if (this.plano === "coronal") {
            for (let fila = 0; fila < nz; fila++) {
                const base = (nz - 1 - fila) * nx * ny + cj * nx;
                const destino = fila * nx;
                for (let i = 0; i < nx; i++) px[destino + i] = gris(datos[base + i]);
            }
        } else {
            for (let fila = 0; fila < nz; fila++) {
                const base = (nz - 1 - fila) * nx * ny + ci;
                const destino = fila * ny;
                for (let j = 0; j < ny; j++) px[destino + j] = gris(datos[base + j * nx]);
            }
        }
    }

    valorEn(u, v) {
        const iu = Math.floor(u);
        const iv = Math.floor(v);
        if (iu < 0 || iv < 0 || iu >= this.ancho || iv >= this.alto) return NaN;
        const { datos, dims: [nx, ny, nz] } = this.visor.volumen;
        const [ci, cj, ck] = this.visor.cursor;
        if (this.plano === "axial") return datos[ck * nx * ny + iv * nx + iu];
        if (this.plano === "coronal") return datos[(nz - 1 - iv) * nx * ny + cj * nx + iu];
        return datos[(nz - 1 - iv) * nx * ny + iu * nx + ci];
    }

    // --- rótulos y dibujo encima -------------------------------------------

    lineasRotulo() {
        const mm = this.indice * this.visor.volumen.espaciado[this.definicion.eje];
        return [`Corte ${this.indice + 1} / ${this.total}`, `${formatoNumero(mm, 1)} mm`];
    }

    letras() {
        return this.definicion.letras;
    }

    pintar() {
        super.pintar();
        // La barra de cortes sigue al cursor venga el cambio de donde venga.
        if (Number(this.barra.value) !== this.indice) this.barra.value = this.indice;
        this.barra.setAttribute("aria-valuetext", `Corte ${this.indice + 1} de ${this.total}`);
    }

    pintarEncima(ctx, e) {
        const dpr = this.dpr();
        const [u, v] = this.cursorEnImagen();
        const [x, y] = this.aPantalla(u + 0.5, v + 0.5, e);
        const hueco = 14 * dpr;   // la cruz no tapa justo el punto que se mira
        const [vertical, horizontal] = LINEAS_CRUZ[this.plano];

        ctx.save();
        ctx.lineWidth = 1 * dpr;
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = PLANOS[vertical].color;
        ctx.beginPath();
        ctx.moveTo(x, e.y); ctx.lineTo(x, y - hueco);
        ctx.moveTo(x, y + hueco); ctx.lineTo(x, e.y + e.h);
        ctx.stroke();

        ctx.strokeStyle = PLANOS[horizontal].color;
        ctx.beginPath();
        ctx.moveTo(e.x, y); ctx.lineTo(x - hueco, y);
        ctx.moveTo(x + hueco, y); ctx.lineTo(e.x + e.w, y);
        ctx.stroke();
        ctx.restore();
    }
}
