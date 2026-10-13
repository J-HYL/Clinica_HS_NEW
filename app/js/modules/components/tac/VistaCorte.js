// modules/components/tac/VistaCorte.js
// Una vista 2D del volumen (axial, coronal o sagital) pintada en un <canvas>.
//
// El corte se saca del volumen COMPLETO en cada pintado (son unos pocos ms) y se
// escala con el tamaño real del vóxel, así coronal y sagital salen con sus
// proporciones aunque los cortes estén más separados que los píxeles.
//
// Ratón:  clic/arrastrar = mover el punto de referencia (las otras dos vistas
//         siguen) · rueda = recorrer cortes · Ctrl+rueda = zoom · botón derecho
//         arrastrando = contraste (ventana/nivel) · botón central o Mayús +
//         arrastrar = desplazar · doble clic = ampliar/reducir la vista.
//         En modo "medir", arrastrar traza una medida en mm.
//
// El estado compartido (volumen, punto de referencia, ventana, modo) vive en el
// objeto `visor` que crea visor.js; esta clase solo lo lee y avisa de cambios.

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

const COLOR_MEDIDA = "#fed600";

export default class VistaCorte {
    constructor(contenedor, plano, visor) {
        this.plano = plano;
        this.definicion = PLANOS[plano];
        this.visor = visor;
        this.zoom = 1;
        this.desplazamiento = [0, 0];
        this.medidas = [];
        this.arrastre = null;
        this.ruedaAcumulada = 0;

        const [nx, ny, nz] = visor.volumen.dims;
        const [sx, sy, sz] = visor.volumen.espaciado;
        [this.ancho, this.alto, this.mmX, this.mmY] = {
            axial: [nx, ny, sx, sy],
            coronal: [nx, nz, sx, sz],
            sagital: [ny, nz, sy, sz],
        }[plano];

        this.lienzo = document.createElement("canvas");
        this.lienzo.className = "tac-panel__canvas";
        contenedor.appendChild(this.lienzo);
        this.ctx = this.lienzo.getContext("2d");

        // Corte a resolución nativa; luego se dibuja escalado en el lienzo visible.
        this.imagen = new ImageData(this.ancho, this.alto);
        this.pixeles = new Uint32Array(this.imagen.data.buffer);
        this.buffer = document.createElement("canvas");
        this.buffer.width = this.ancho;
        this.buffer.height = this.alto;
        this.ctxBuffer = this.buffer.getContext("2d");

        this.observador = new ResizeObserver(() => this.ajustarTamano());
        this.observador.observe(contenedor);
        this.cablear();
    }

    // --- corte actual -------------------------------------------------------

    get indice() {
        return this.visor.cursor[this.definicion.eje];
    }

    get total() {
        return this.visor.volumen.dims[this.definicion.eje];
    }

    moverCorte(pasos) {
        const eje = this.definicion.eje;
        const nuevo = Math.min(this.total - 1, Math.max(0, this.visor.cursor[eje] + pasos));
        if (nuevo === this.visor.cursor[eje]) return;
        this.visor.cursor[eje] = nuevo;
        this.visor.alCambiar();
    }

    /** Punto de referencia en coordenadas de esta imagen [u, v]. */
    cursorEnImagen() {
        const [i, j, k] = this.visor.cursor;
        const nz = this.visor.volumen.dims[2];
        if (this.plano === "axial") return [i, j];
        if (this.plano === "coronal") return [i, nz - 1 - k];
        return [j, nz - 1 - k];
    }

    fijarCursor(u, v) {
        const iu = Math.min(this.ancho - 1, Math.max(0, Math.floor(u)));
        const iv = Math.min(this.alto - 1, Math.max(0, Math.floor(v)));
        const cursor = this.visor.cursor;
        const nz = this.visor.volumen.dims[2];
        if (this.plano === "axial") { cursor[0] = iu; cursor[1] = iv; }
        else if (this.plano === "coronal") { cursor[0] = iu; cursor[2] = nz - 1 - iv; }
        else { cursor[1] = iu; cursor[2] = nz - 1 - iv; }
        this.visor.alCambiar();
    }

    // --- pintado ------------------------------------------------------------

    /** Copia el corte actual del volumen a la imagen, aplicando la ventana. */
    extraer() {
        const { datos, dims: [nx, ny, nz] } = this.visor.volumen;
        const { centro, ancho } = this.visor.ventana;
        const minimo = centro - ancho / 2;
        const escala = 255 / ancho;
        const px = this.pixeles;
        const [ci, cj, ck] = this.visor.cursor;

        const gris = (v) => {
            let g = (v - minimo) * escala;
            g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
            return 0xff000000 | (g << 16) | (g << 8) | g;
        };

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

    /** Dónde cae la imagen en el lienzo (px de dispositivo). */
    encuadre() {
        const W = this.lienzo.width;
        const H = this.lienzo.height;
        const anchoMm = this.ancho * this.mmX;
        const altoMm = this.alto * this.mmY;
        const escala = Math.min(W / anchoMm, H / altoMm) * 0.94 * this.zoom;
        const w = anchoMm * escala;
        const h = altoMm * escala;
        return {
            x: (W - w) / 2 + this.desplazamiento[0],
            y: (H - h) / 2 + this.desplazamiento[1],
            w,
            h,
        };
    }

    aImagen(px, py, e = this.encuadre()) {
        return [((px - e.x) / e.w) * this.ancho, ((py - e.y) / e.h) * this.alto];
    }

    aPantalla(u, v, e) {
        return [e.x + (u / this.ancho) * e.w, e.y + (v / this.alto) * e.h];
    }

    pintar() {
        if (!this.lienzo.width || !this.lienzo.height) return;
        this.extraer();
        this.ctxBuffer.putImageData(this.imagen, 0, 0);

        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, this.lienzo.width, this.lienzo.height);

        const e = this.encuadre();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.buffer, e.x, e.y, e.w, e.h);

        this.pintarCruz(e);
        this.pintarMedidas(e);
        this.pintarRotulos();
    }

    pintarCruz(e) {
        const ctx = this.ctx;
        const dpr = this.escalaDispositivo();
        const [u, v] = this.cursorEnImagen();
        const [x, y] = this.aPantalla(u + 0.5, v + 0.5, e);
        const hueco = 14 * dpr;   // la cruz no tapa justo el punto que se mira
        const [vertical, horizontal] = LINEAS_CRUZ[this.plano];

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
        ctx.globalAlpha = 1;
    }

    pintarMedidas(e) {
        const ctx = this.ctx;
        const dpr = this.escalaDispositivo();
        ctx.font = `${12 * dpr}px Figtree, Arial, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";

        for (const medida of this.medidas) {
            if (medida.indice !== this.indice) continue;
            const [ax, ay] = this.aPantalla(medida.a[0], medida.a[1], e);
            const [bx, by] = this.aPantalla(medida.b[0], medida.b[1], e);

            ctx.strokeStyle = COLOR_MEDIDA;
            ctx.fillStyle = COLOR_MEDIDA;
            ctx.lineWidth = 1.5 * dpr;
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            for (const [px, py] of [[ax, ay], [bx, by]]) {
                ctx.beginPath(); ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2); ctx.fill();
            }

            const texto = `${this.longitud(medida).toLocaleString("es-ES", { maximumFractionDigits: 1 })} mm`;
            const anchoTexto = ctx.measureText(texto).width;
            const tx = (ax + bx) / 2 + 8 * dpr;
            const ty = (ay + by) / 2 - 10 * dpr;
            ctx.fillStyle = "rgba(0, 0, 0, .65)";
            ctx.fillRect(tx - 4 * dpr, ty - 9 * dpr, anchoTexto + 8 * dpr, 18 * dpr);
            ctx.fillStyle = COLOR_MEDIDA;
            ctx.fillText(texto, tx, ty);
        }
    }

    pintarRotulos() {
        const ctx = this.ctx;
        const dpr = this.escalaDispositivo();
        const W = this.lienzo.width;
        const H = this.lienzo.height;
        const margen = 10 * dpr;
        ctx.font = `${12 * dpr}px Figtree, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, .85)";

        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillText(`Corte ${this.indice + 1} / ${this.total}`, W - margen, margen);
        ctx.textBaseline = "bottom";
        const { centro, ancho } = this.visor.ventana;
        ctx.fillText(`Ventana ${Math.round(ancho)} · Nivel ${Math.round(centro)}`, W - margen, H - margen);
        if (this.zoom !== 1) {
            ctx.textAlign = "left";
            ctx.fillText(`Zoom ${this.zoom.toLocaleString("es-ES", { maximumFractionDigits: 1 })}×`, margen, H - margen);
        }

        // Letras de orientación en el centro de cada borde.
        const [izquierda, derecha, arriba, abajo] = this.definicion.letras;
        ctx.font = `600 ${13 * dpr}px Figtree, Arial, sans-serif`;
        ctx.fillStyle = "rgba(255, 255, 255, .7)";
        ctx.textBaseline = "middle";
        ctx.textAlign = "left";
        ctx.fillText(izquierda, margen, H / 2);
        ctx.textAlign = "right";
        ctx.fillText(derecha, W - margen, H / 2);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(arriba, W / 2, margen);
        ctx.textBaseline = "bottom";
        ctx.fillText(abajo, W / 2, H - margen);
    }

    longitud(medida) {
        return Math.hypot((medida.b[0] - medida.a[0]) * this.mmX, (medida.b[1] - medida.a[1]) * this.mmY);
    }

    escalaDispositivo() {
        return this.lienzo.width / Math.max(1, this.lienzo.clientWidth);
    }

    ajustarTamano() {
        const caja = this.lienzo.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.lienzo.width = Math.max(1, Math.round(caja.width * dpr));
        this.lienzo.height = Math.max(1, Math.round(caja.height * dpr));
        this.pintar();
    }

    // --- acciones desde la barra de herramientas ---------------------------

    restablecer() {
        this.zoom = 1;
        this.desplazamiento = [0, 0];
        this.pintar();
    }

    borrarMedidas() {
        this.medidas = [];
        this.pintar();
    }

    destruir() {
        this.observador.disconnect();
    }

    // --- ratón --------------------------------------------------------------

    cablear() {
        const l = this.lienzo;
        l.addEventListener("contextmenu", (e) => e.preventDefault());
        l.addEventListener("pointerdown", (e) => this.alPulsar(e));
        l.addEventListener("pointermove", (e) => this.alMover(e));
        l.addEventListener("pointerup", (e) => this.alSoltar(e));
        l.addEventListener("pointercancel", (e) => this.alSoltar(e));
        l.addEventListener("wheel", (e) => this.alRueda(e), { passive: false });
        l.addEventListener("dblclick", () => this.visor.alternarAmpliada(this.plano));
    }

    /** Posición del puntero en px de dispositivo del lienzo. */
    punto(e) {
        const caja = this.lienzo.getBoundingClientRect();
        const dpr = this.lienzo.width / caja.width;
        return [(e.clientX - caja.left) * dpr, (e.clientY - caja.top) * dpr];
    }

    alPulsar(e) {
        e.preventDefault();
        this.lienzo.setPointerCapture(e.pointerId);
        const [px, py] = this.punto(e);

        if (e.button === 2) {
            this.arrastre = { tipo: "ventana", x: e.clientX, y: e.clientY, inicial: { ...this.visor.ventana } };
        } else if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
            this.arrastre = { tipo: "mover", x: px, y: py, inicial: [...this.desplazamiento] };
        } else if (e.button === 0 && this.visor.modo === "medir") {
            const [u, v] = this.aImagen(px, py);
            const medida = { indice: this.indice, a: [u, v], b: [u, v] };
            this.medidas.push(medida);
            this.arrastre = { tipo: "medir", medida };
        } else if (e.button === 0) {
            this.arrastre = { tipo: "cursor" };
            this.fijarCursor(...this.aImagen(px, py));
        }
    }

    alMover(e) {
        const a = this.arrastre;
        if (!a) return;
        const [px, py] = this.punto(e);

        if (a.tipo === "ventana") {
            // Derecha = más ancho (menos contraste); abajo = nivel más alto (más oscuro).
            const s = this.visor.sensibilidadVentana;
            this.visor.ventana.ancho = Math.max(1, a.inicial.ancho + (e.clientX - a.x) * s);
            this.visor.ventana.centro = a.inicial.centro + (e.clientY - a.y) * s;
            this.visor.alCambiar();
        } else if (a.tipo === "mover") {
            this.desplazamiento = [a.inicial[0] + px - a.x, a.inicial[1] + py - a.y];
            this.pintar();
        } else if (a.tipo === "medir") {
            a.medida.b = this.aImagen(px, py);
            this.pintar();
        } else if (a.tipo === "cursor") {
            this.fijarCursor(...this.aImagen(px, py));
        }
    }

    alSoltar(e) {
        const a = this.arrastre;
        this.arrastre = null;
        if (this.lienzo.hasPointerCapture(e.pointerId)) this.lienzo.releasePointerCapture(e.pointerId);
        // Un clic suelto en modo medir no deja una medida de 0 mm.
        if (a?.tipo === "medir" && this.longitud(a.medida) < 0.1) {
            this.medidas = this.medidas.filter(m => m !== a.medida);
            this.pintar();
        }
    }

    alRueda(e) {
        e.preventDefault();
        if (e.ctrlKey) {
            // Zoom manteniendo fijo el punto que hay bajo el ratón.
            const [px, py] = this.punto(e);
            const [u, v] = this.aImagen(px, py);
            this.zoom = Math.min(20, Math.max(0.5, this.zoom * Math.exp(-e.deltaY * 0.0015)));
            const [nx, ny] = this.aPantalla(u, v, this.encuadre());
            this.desplazamiento[0] += px - nx;
            this.desplazamiento[1] += py - ny;
            this.pintar();
            return;
        }

        // Rueda de ratón (saltos grandes): un corte por muesca. Trackpad (saltos
        // pequeños y muchos): se acumula para que no vuele.
        let pasos;
        if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) {
            pasos = Math.sign(e.deltaY);
        } else {
            this.ruedaAcumulada += e.deltaY;
            pasos = Math.trunc(this.ruedaAcumulada / 25);
            this.ruedaAcumulada -= pasos * 25;
        }
        if (pasos) this.moverCorte(pasos * SENTIDO_RUEDA[this.plano]);
    }
}
