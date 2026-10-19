// modules/components/tac/Panoramica.js
// Panorámica reconstruida y cortes transversales a partir de una curva que se
// dibuja sobre el corte axial siguiendo la arcada (herramienta "Curva").
//
// Geometría (todo en mm, en el plano axial; la altura es siempre la del volumen):
//   - La curva pasa por los puntos que marca el usuario (Catmull-Rom
//     centrípeta: no hace bucles aunque los puntos estén desiguales) y se
//     remuestrea a paso constante = tamaño del vóxel en el plano.
//   - En cada punto, la normal apunta hacia VESTIBULAR: el interior del
//     polígono "curva + cuerda entre sus extremos" es el lado lingual/palatino.
//   - Panorámica: cada columna es un punto de la curva; cada fila, un corte
//     axial; el valor es la MEDIA a lo largo de la normal en un grosor dado
//     (como la capa de una ortopantomografía). La rueda mueve esa capa hacia
//     vestibular o lingual.
//   - Transversales: planos perpendiculares a la curva (40 mm de lingual a
//     vestibular), cinco seguidas con la separación elegida.
//
// En la panorámica las medidas HORIZONTALES son aproximadas (la curva estira o
// encoge la imagen según la capa); para medir, las transversales o los cortes.
//
// La curva se guarda en el navegador por estudio (localStorage): son solo
// coordenadas de vóxel, ningún dato del paciente.

import VistaReconstruida from "./VistaReconstruida.js";
import { formatoNumero } from "./VistaLienzo.js";
import { PLANOS } from "./VistaCorte.js";

export const COLOR_CURVA = "#a87dff";
const TRANSVERSALES = 5;
const CENTRO = (TRANSVERSALES - 1) / 2;
const ANCHO_TRANSVERSAL = 40;      // mm, de lingual a vestibular
const MUESTRAS_GROSOR = 32;        // como mucho, a lo ancho de la capa
const MUESTRAS_GROSOR_RAPIDO = 6;  // mientras se arrastra un punto
const CAPA_MAXIMA = 15;            // mm hacia cada lado
const PASO_CAPA = 0.5;             // mm por muesca de rueda en la panorámica
const RADIO_PUNTO = 8;             // px CSS para agarrar un punto de la curva
const RADIO_CURVA = 6;             // px CSS para insertar un punto sobre la curva
const SIN_CURVA = "Dibuja la curva de la arcada en el corte axial: herramienta Curva (C) y clics de un extremo a otro siguiendo los dientes.";

export default class Panoramica {
    /**
     * @param {Object} visor - estado compartido (visor.js)
     * @param {Object} opciones
     * @param {import("./VistaCorte.js").default} opciones.vistaAxial
     * @param {HTMLElement} opciones.panelPanoramica
     * @param {HTMLElement[]} opciones.panelesTransversales
     * @param {string} opciones.claveAlmacen - clave de localStorage para este estudio
     */
    constructor(visor, { vistaAxial, panelPanoramica, panelesTransversales, claveAlmacen }) {
        this.visor = visor;
        this.claveAlmacen = claveAlmacen;
        const [sx, sy] = visor.volumen.espaciado;
        this.paso = Math.min(sx, sy);

        this.puntos = [];          // en coordenadas de la imagen axial [u, v]
        this.grosor = 10;
        this.separacion = 1;
        this.capa = 0;
        this.posicion = null;      // mm a lo largo de la curva de la transversal central
        this.longitudPrevia = 0;
        this.version = 0;         // cambia con la curva: las medidas de antes ya no valen
        this.muestras = null;
        this.arrastrando = null;
        this.calculoPendiente = 0;
        this.restaurar();

        vistaAxial.capas.push({
            pintar: (ctx, e, vista) => this.pintarEnAxial(ctx, e, vista),
            alPulsar: (u, v, vista, ev) => this.pulsarEnAxial(u, v, vista, ev),
            alArrastrar: (u, v) => this.arrastrarEnAxial(u, v),
            alSoltar: () => this.soltarEnAxial(),
            alSobrevolar: (u, v, vista) => this.sobrevolarAxial(u, v, vista),
        });

        this.vistaPanoramica = new VistaReconstruida(panelPanoramica, visor, {
            nombre: "panoramica",
            titulo: "Panorámica",
            color: COLOR_CURVA,
            letras: ["R", "L", null, null],   // arriba quedan los números de las transversales
            fuente: {
                clave: () => `${this.version}|${this.grosor}|${this.capa}`,
                lineas: () => this.lineasPanoramica(),
                encima: (ctx, e, vista) => this.encimaPanoramica(ctx, e, vista),
                navegar: (u, v) => this.navegarPanoramica(u, v),
                desplazar: (pasos) => this.moverCapa(-pasos * PASO_CAPA),
            },
        });

        this.vistasTransversales = panelesTransversales.map((panel, n) => new VistaReconstruida(panel, visor, {
            nombre: `t${n + 1}`,
            titulo: `Transversal ${n + 1}`,
            color: COLOR_CURVA,
            letras: ["Ling.", "Vest.", null, null],   // son estrechas: arriba y abajo no caben
            fuente: {
                clave: (vista) => `${this.version}|${Math.round((vista.posicion ?? -1) * 100)}`,
                lineas: (vista) => [`${formatoNumero(vista.posicion, 1)} mm de la curva`],
                encima: (ctx, e, vista) => this.encimaTransversal(ctx, e, vista),
                navegar: (u, v, vista) => this.navegarTransversal(u, v, vista),
                desplazar: (pasos) => this.moverPosicion(pasos * this.separacion),
            },
        }));

        this.cablearControles(panelPanoramica);
        this.recalcular();
    }

    get vistas() {
        return [this.vistaPanoramica, ...this.vistasTransversales];
    }

    get tieneCurva() {
        return this.muestras !== null;
    }

    // --- controles del panel (grosor, separación, borrar) --------------------

    cablearControles(panel) {
        const control = (nombre) => panel.querySelector(`[data-pano="${nombre}"]`);
        this.controles = { grosor: control("grosor"), separacion: control("separacion"), borrar: control("borrar") };
        const { grosor, separacion, borrar } = this.controles;

        // Si lo guardado no es una de las opciones, se vuelve al valor por defecto.
        grosor.value = String(this.grosor);
        if (grosor.value !== String(this.grosor)) this.grosor = Number(grosor.value = "10");
        separacion.value = String(this.separacion);
        if (separacion.value !== String(this.separacion)) this.separacion = Number(separacion.value = "1");

        grosor.addEventListener("change", () => {
            this.grosor = Number(grosor.value);
            this.guardar();
            this.calcularPanoramica();
            this.visor.alCambiar();
        });
        separacion.addEventListener("change", () => {
            this.separacion = Number(separacion.value);
            this.guardar();
            this.calcularTransversales();
            this.visor.alCambiar();
        });
        borrar.addEventListener("click", () => this.borrarCurva());
    }

    // --- curva -------------------------------------------------------------

    /** Tras cualquier cambio de la curva: se guarda y se rehace todo. */
    cambiar() {
        this.version++;
        this.guardar();
        this.recalcular();
        this.visor.alCambiar();
    }

    recalcular() {
        this.calcularMuestras();
        this.ajustarPosicion();
        this.calcularPanoramica();
        this.calcularTransversales();
        this.controles.borrar.disabled = !this.puntos.length;
    }

    borrarCurva() {
        if (!this.puntos.length) return;
        this.puntos = [];
        this.posicion = null;
        this.capa = 0;
        this.cambiar();
    }

    quitarUltimoPunto() {
        if (!this.puntos.length) return false;
        this.puntos.pop();
        this.cambiar();
        return true;
    }

    /** Las transversales mantienen su sitio relativo aunque la curva se alargue o se acorte. */
    ajustarPosicion() {
        if (!this.muestras) return;
        const longitud = this.muestras.longitud;
        if (this.posicion === null || !this.longitudPrevia) this.posicion = longitud / 2;
        else this.posicion = limitar((this.posicion / this.longitudPrevia) * longitud, 0, longitud);
        this.longitudPrevia = longitud;
    }

    /** Curva suave por los puntos, remuestreada a paso constante, con su normal vestibular. */
    calcularMuestras() {
        this.muestras = null;
        if (this.puntos.length < 2) return;
        const [sx, sy] = this.visor.volumen.espaciado;
        let control = this.puntos.map(([u, v]) => [u * sx, v * sy]);
        // Siempre de la derecha del paciente (izquierda de la imagen) a su izquierda:
        // así la panorámica sale con la R a la izquierda dibuje como dibuje el usuario.
        if (control[0][0] > control.at(-1)[0]) control = control.reverse();

        const densa = catmullRom(control, this.paso / 2);
        const acumulada = [0];
        for (let n = 1; n < densa.length; n++) {
            acumulada.push(acumulada[n - 1] + Math.hypot(densa[n][0] - densa[n - 1][0], densa[n][1] - densa[n - 1][1]));
        }
        const total = Math.floor(acumulada.at(-1) / this.paso) + 1;
        if (total < 4) return;

        const x = new Float64Array(total);
        const y = new Float64Array(total);
        for (let n = 0, tramo = 0; n < total; n++) {
            const s = n * this.paso;
            while (tramo < densa.length - 2 && acumulada[tramo + 1] < s) tramo++;
            const t = (s - acumulada[tramo]) / ((acumulada[tramo + 1] - acumulada[tramo]) || 1);
            x[n] = densa[tramo][0] + (densa[tramo + 1][0] - densa[tramo][0]) * t;
            y[n] = densa[tramo][1] + (densa[tramo + 1][1] - densa[tramo][1]) * t;
        }

        // Área con signo del polígono curva + cuerda: dice de qué lado queda el interior.
        let area = 0;
        for (let n = 0; n < total; n++) {
            const m = (n + 1) % total;
            area += x[n] * y[m] - x[m] * y[n];
        }
        const nx = new Float64Array(total);
        const ny = new Float64Array(total);
        for (let n = 0; n < total; n++) {
            const a = Math.max(n - 1, 0);
            const b = Math.min(n + 1, total - 1);
            const tx = x[b] - x[a];
            const ty = y[b] - y[a];
            const largo = Math.hypot(tx, ty) || 1;
            nx[n] = (area > 0 ? ty : -ty) / largo;
            ny[n] = (area > 0 ? -tx : tx) / largo;
        }
        this.muestras = { x, y, nx, ny, total, longitud: (total - 1) * this.paso };
    }

    /** Punto de la curva y su normal a `s` mm del principio. */
    puntoEn(s) {
        const m = this.muestras;
        const f = limitar(s / this.paso, 0, m.total - 1);
        const a = Math.floor(f);
        const b = Math.min(a + 1, m.total - 1);
        const t = f - a;
        const mezcla = (serie) => serie[a] + (serie[b] - serie[a]) * t;
        const qx = mezcla(m.nx);
        const qy = mezcla(m.ny);
        const largo = Math.hypot(qx, qy) || 1;
        return { x: mezcla(m.x), y: mezcla(m.y), nx: qx / largo, ny: qy / largo };
    }

    // --- imágenes ----------------------------------------------------------

    /**
     * Prepara la interpolación bilineal (en el plano axial) de un punto en mm:
     * cuatro índices dentro del corte y sus pesos. false si cae fuera.
     */
    prepararMuestra(xm, ym, indices, pesos, desde) {
        const { dims: [nx, ny], espaciado: [sx, sy] } = this.visor.volumen;
        const fx = xm / sx - 0.5;   // el centro del vóxel i está en (i + 0,5) · sx
        const fy = ym / sy - 0.5;
        if (!(fx >= 0 && fy >= 0 && fx <= nx - 1 && fy <= ny - 1)) return false;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(x0 + 1, nx - 1);
        const y1 = Math.min(y0 + 1, ny - 1);
        const ax = fx - x0;
        const ay = fy - y0;
        indices[desde] = y0 * nx + x0; pesos[desde] = (1 - ax) * (1 - ay);
        indices[desde + 1] = y0 * nx + x1; pesos[desde + 1] = ax * (1 - ay);
        indices[desde + 2] = y1 * nx + x0; pesos[desde + 2] = (1 - ax) * ay;
        indices[desde + 3] = y1 * nx + x1; pesos[desde + 3] = ax * ay;
        return true;
    }

    /**
     * Imagen de `columnas` columnas: la columna c es la media de los puntos
     * (en mm) que da puntosDe(c, anadir) a la altura de cada corte axial.
     */
    reconstruir(columnas, muestrasPorColumna, puntosDe) {
        const { datos, dims: [nx, ny, nz] } = this.visor.volumen;
        const nxny = nx * ny;
        const paso = muestrasPorColumna * 4;
        const indices = new Int32Array(columnas * paso);
        const pesos = new Float32Array(columnas * paso);
        const usados = new Int32Array(columnas);
        const factor = new Float32Array(columnas);

        for (let c = 0; c < columnas; c++) {
            let validas = 0;
            puntosDe(c, (xm, ym) => {
                if (this.prepararMuestra(xm, ym, indices, pesos, c * paso + validas * 4)) validas++;
            });
            usados[c] = validas * 4;
            factor[c] = validas ? 1 / validas : 0;
        }

        const valores = new Float32Array(columnas * nz);
        for (let fila = 0; fila < nz; fila++) {
            const base = (nz - 1 - fila) * nxny;
            const destino = fila * columnas;
            for (let c = 0; c < columnas; c++) {
                const n = usados[c];
                if (!n) { valores[destino + c] = NaN; continue; }
                const inicio = c * paso;
                let suma = 0;
                for (let q = inicio, fin = inicio + n; q < fin; q++) suma += pesos[q] * datos[base + indices[q]];
                valores[destino + c] = suma * factor[c];
            }
        }
        return valores;
    }

    calcularPanoramica(rapido = false) {
        const m = this.muestras;
        if (!m) {
            this.vistaPanoramica.quitarImagen(this.puntos.length ? "Añade otro punto a la curva para ver la panorámica." : SIN_CURVA);
            return;
        }
        const maximo = rapido ? MUESTRAS_GROSOR_RAPIDO : MUESTRAS_GROSOR;
        const cuantas = this.grosor > 0 ? limitar(Math.round(this.grosor / this.paso), 1, maximo) : 1;
        const valores = this.reconstruir(m.total, cuantas, (c, anadir) => {
            for (let g = 0; g < cuantas; g++) {
                const o = this.capa + (cuantas > 1 ? (g / (cuantas - 1) - 0.5) * this.grosor : 0);
                anadir(m.x[c] + o * m.nx[c], m.y[c] + o * m.ny[c]);
            }
        });
        const [, , sz] = this.visor.volumen.espaciado;
        this.vistaPanoramica.fijarValores(valores, m.total, this.visor.volumen.dims[2], this.paso, sz);
    }

    calcularTransversales() {
        const m = this.muestras;
        const [, , sz] = this.visor.volumen.espaciado;
        const nz = this.visor.volumen.dims[2];
        const columnas = Math.round(ANCHO_TRANSVERSAL / this.paso) + 1;

        this.vistasTransversales.forEach((vista, n) => {
            const s = m ? this.posicion + (n - CENTRO) * this.separacion : NaN;
            if (!m || s < 0 || s > m.longitud) {
                vista.posicion = null;
                vista.quitarImagen(m ? "Fuera de la curva" : "Sin curva");
                return;
            }
            vista.posicion = s;
            const p = this.puntoEn(s);
            const valores = this.reconstruir(columnas, 1, (c, anadir) => {
                const o = -ANCHO_TRANSVERSAL / 2 + c * this.paso;
                anadir(p.x + o * p.nx, p.y + o * p.ny);
            });
            vista.fijarValores(valores, columnas, nz, this.paso, sz);
        });
    }

    /** La panorámica tarda unas decenas de ms: como mucho una vez por fotograma. */
    programarPanoramica(rapido = false) {
        cancelAnimationFrame(this.calculoPendiente);
        this.calculoPendiente = requestAnimationFrame(() => {
            this.calcularPanoramica(rapido);
            this.visor.alCambiar();
        });
    }

    moverCapa(delta) {
        if (!this.muestras) return;
        const nueva = limitar(Math.round((this.capa + delta) / PASO_CAPA) * PASO_CAPA, -CAPA_MAXIMA, CAPA_MAXIMA);
        if (nueva === this.capa) return;
        this.capa = nueva;
        this.guardar();
        this.programarPanoramica();
    }

    moverPosicion(delta) {
        if (!this.muestras) return;
        const nueva = limitar(this.posicion + delta, 0, this.muestras.longitud);
        if (nueva === this.posicion) return;
        this.posicion = nueva;
        this.calcularTransversales();
        this.visor.alCambiar();
    }

    // --- navegación: un clic lleva la cruz de referencia a ese punto ---------

    fijarCursor(xm, ym, fila) {
        const { dims: [nx, ny, nz], espaciado: [sx, sy] } = this.visor.volumen;
        const cursor = this.visor.cursor;
        cursor[0] = limitar(Math.floor(xm / sx), 0, nx - 1);
        cursor[1] = limitar(Math.floor(ym / sy), 0, ny - 1);
        cursor[2] = limitar(nz - 1 - Math.floor(fila), 0, nz - 1);
    }

    navegarPanoramica(u, v) {
        if (!this.muestras) return;
        this.posicion = limitar((u - 0.5) * this.paso, 0, this.muestras.longitud);
        const p = this.puntoEn(this.posicion);
        this.fijarCursor(p.x + this.capa * p.nx, p.y + this.capa * p.ny, v);
        this.calcularTransversales();
        this.visor.alCambiar();
    }

    navegarTransversal(u, v, vista) {
        if (vista.posicion === null) return;
        const p = this.puntoEn(vista.posicion);
        const o = -ANCHO_TRANSVERSAL / 2 + (u - 0.5) * this.paso;
        this.fijarCursor(p.x + o * p.nx, p.y + o * p.ny, v);
        this.visor.alCambiar();
    }

    // --- dibujo sobre las vistas -------------------------------------------

    lineasPanoramica() {
        const grosor = this.grosor > 0 ? `Grosor ${formatoNumero(this.grosor, 0)} mm` : "Corte fino";
        if (this.capa === 0) return [grosor, "Capa centrada"];
        const lado = this.capa > 0 ? "vestibular" : "lingual";
        return [grosor, `Capa ${formatoNumero(Math.abs(this.capa), 1)} mm hacia ${lado}`];
    }

    /** Altura del corte axial actual en las imágenes reconstruidas (fila). */
    filaAxial() {
        return this.visor.volumen.dims[2] - 1 - this.visor.cursor[2] + 0.5;
    }

    encimaPanoramica(ctx, e, vista) {
        const dpr = vista.dpr();
        const [, y] = vista.aPantalla(0, this.filaAxial(), e);
        ctx.save();
        ctx.lineWidth = dpr;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = PLANOS.axial.color;
        ctx.beginPath(); ctx.moveTo(e.x, y); ctx.lineTo(e.x + e.w, y); ctx.stroke();

        ctx.strokeStyle = COLOR_CURVA;
        ctx.fillStyle = COLOR_CURVA;
        ctx.font = `700 ${11 * dpr}px Figtree, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const etiquetas = [];
        this.vistasTransversales.forEach((t, n) => {
            if (t.posicion === null) return;
            const [x] = vista.aPantalla(t.posicion / this.paso + 0.5, 0, e);
            ctx.globalAlpha = n === CENTRO ? 1 : 0.7;
            ctx.lineWidth = (n === CENTRO ? 1.5 : 1) * dpr;
            ctx.beginPath(); ctx.moveTo(x, e.y + 16 * dpr); ctx.lineTo(x, e.y + e.h); ctx.stroke();
            etiquetas.push({ n, x, y: e.y + 2 * dpr });
        });
        ctx.globalAlpha = 1;
        pintarNumeros(ctx, etiquetas, dpr);
        ctx.restore();
    }

    encimaTransversal(ctx, e, vista) {
        const dpr = vista.dpr();
        const [, y] = vista.aPantalla(0, this.filaAxial(), e);
        const [x] = vista.aPantalla((ANCHO_TRANSVERSAL / 2 + this.capa) / this.paso + 0.5, 0, e);
        ctx.save();
        ctx.lineWidth = dpr;
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = PLANOS.axial.color;
        ctx.beginPath(); ctx.moveTo(e.x, y); ctx.lineTo(e.x + e.w, y); ctx.stroke();
        // Por dónde pasa la capa de la panorámica.
        ctx.strokeStyle = COLOR_CURVA;
        ctx.setLineDash([4 * dpr, 5 * dpr]);
        ctx.beginPath(); ctx.moveTo(x, e.y); ctx.lineTo(x, e.y + e.h); ctx.stroke();
        ctx.restore();
    }

    pintarEnAxial(ctx, e, vista) {
        if (!this.puntos.length) return;
        const editando = this.visor.herramienta === "curva";
        const [sx, sy] = this.visor.volumen.espaciado;
        const dpr = vista.dpr();
        const enPantalla = (xm, ym) => vista.aPantalla(xm / sx, ym / sy, e);
        const m = this.muestras;

        ctx.save();
        ctx.strokeStyle = COLOR_CURVA;
        ctx.fillStyle = COLOR_CURVA;
        ctx.shadowColor = "rgba(0, 0, 0, .8)";
        ctx.shadowBlur = 2 * dpr;

        if (m) {
            const trazar = (desvio) => {
                ctx.beginPath();
                for (let n = 0; n < m.total; n++) {
                    const [px, py] = enPantalla(m.x[n] + desvio * m.nx[n], m.y[n] + desvio * m.ny[n]);
                    if (n) ctx.lineTo(px, py); else ctx.moveTo(px, py);
                }
                ctx.stroke();
            };
            ctx.lineWidth = 1.5 * dpr;
            trazar(this.capa);
            if (this.grosor > 0) {
                ctx.setLineDash([4 * dpr, 4 * dpr]);
                ctx.lineWidth = dpr;
                ctx.globalAlpha = 0.65;
                trazar(this.capa - this.grosor / 2);
                trazar(this.capa + this.grosor / 2);
                ctx.setLineDash([]);
            }

            ctx.font = `700 ${11 * dpr}px Figtree, Arial, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            const mitad = ANCHO_TRANSVERSAL / 2;
            const etiquetas = [];
            this.vistasTransversales.forEach((t, n) => {
                if (t.posicion === null) return;
                const p = this.puntoEn(t.posicion);
                const [ax, ay] = enPantalla(p.x - mitad * p.nx, p.y - mitad * p.ny);
                const [bx, by] = enPantalla(p.x + mitad * p.nx, p.y + mitad * p.ny);
                ctx.globalAlpha = n === CENTRO ? 1 : 0.75;
                ctx.lineWidth = (n === CENTRO ? 1.5 : 1) * dpr;
                ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
                const [lx, ly] = enPantalla(p.x + (mitad + 2.5) * p.nx, p.y + (mitad + 2.5) * p.ny);
                etiquetas.push({ n, x: lx, y: ly });
            });
            ctx.globalAlpha = 1;
            pintarNumeros(ctx, etiquetas, dpr);
        }

        if (editando || !m) {
            ctx.lineWidth = 1.5 * dpr;
            ctx.strokeStyle = "#fff";
            for (const [u, v] of this.puntos) {
                const [x, y] = vista.aPantalla(u, v, e);
                ctx.beginPath();
                ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            }
        }
        // Mientras se dibuja: por dónde iría el siguiente tramo.
        if (editando && this.arrastrando === null && vista.puntero) {
            const [ax, ay] = vista.aPantalla(...this.puntos.at(-1), e);
            const [bx, by] = vista.aPantalla(...vista.puntero, e);
            ctx.strokeStyle = COLOR_CURVA;
            ctx.globalAlpha = 0.6;
            ctx.lineWidth = dpr;
            ctx.setLineDash([3 * dpr, 4 * dpr]);
            ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
        }
        ctx.restore();
    }

    // --- edición de la curva en el corte axial -----------------------------

    /** Índice del punto de control bajo el puntero (o null). */
    puntoCercano(u, v, vista) {
        const e = vista.encuadre();
        const [px, py] = vista.aPantalla(u, v, e);
        const radio = RADIO_PUNTO * vista.dpr();
        let mejor = null;
        let distanciaMejor = radio;
        this.puntos.forEach(([pu, pv], n) => {
            const [x, y] = vista.aPantalla(pu, pv, e);
            const d = Math.hypot(x - px, y - py);
            if (d <= distanciaMejor) { mejor = n; distanciaMejor = d; }
        });
        return mejor;
    }

    /** ¿El puntero está sobre la curva? (para insertar un punto en medio). */
    sobreLaCurva(u, v, vista) {
        const m = this.muestras;
        if (!m) return false;
        const [sx, sy] = this.visor.volumen.espaciado;
        const xm = u * sx;
        const ym = v * sy;
        let minima = Infinity;
        for (let n = 0; n < m.total; n++) minima = Math.min(minima, Math.hypot(m.x[n] - xm, m.y[n] - ym));
        return minima * vista.encuadre().escala <= RADIO_CURVA * vista.dpr();
    }

    /** Dónde meter un punto nuevo para que alargue la curva lo menos posible. */
    indiceInsercion([u, v]) {
        const [sx, sy] = this.visor.volumen.espaciado;
        const d = (a, b) => Math.hypot((a[0] - b[0]) * sx, (a[1] - b[1]) * sy);
        let mejor = this.puntos.length;
        let coste = Infinity;
        for (let n = 0; n < this.puntos.length - 1; n++) {
            const extra = d(this.puntos[n], [u, v]) + d([u, v], this.puntos[n + 1]) - d(this.puntos[n], this.puntos[n + 1]);
            if (extra < coste) { coste = extra; mejor = n + 1; }
        }
        return mejor;
    }

    dentroDelCorte(u, v) {
        const [nx, ny] = this.visor.volumen.dims;
        return [limitar(u, 0, nx), limitar(v, 0, ny)];
    }

    pulsarEnAxial(u, v, vista, ev) {
        if (this.visor.herramienta !== "curva") return false;
        const cercano = this.puntoCercano(u, v, vista);
        if (cercano !== null) {
            if (ev.altKey) {
                this.puntos.splice(cercano, 1);
                this.cambiar();
            } else {
                this.arrastrando = cercano;
            }
            return true;
        }
        const punto = this.dentroDelCorte(u, v);
        const indice = this.sobreLaCurva(u, v, vista) ? this.indiceInsercion(punto) : this.puntos.length;
        this.puntos.splice(indice, 0, punto);
        this.arrastrando = indice;
        this.calcularMuestras();
        vista.pintar();
        return true;
    }

    arrastrarEnAxial(u, v) {
        if (this.arrastrando === null) return;
        this.puntos[this.arrastrando] = this.dentroDelCorte(u, v);
        this.calcularMuestras();
        this.ajustarPosicion();
        this.calcularTransversales();
        this.programarPanoramica(true);
    }

    soltarEnAxial() {
        if (this.arrastrando === null) return;
        this.arrastrando = null;
        cancelAnimationFrame(this.calculoPendiente);
        this.cambiar();
    }

    sobrevolarAxial(u, v, vista) {
        if (this.visor.herramienta !== "curva") return false;
        if (this.puntos.length) vista.pintar();
        return this.puntoCercano(u, v, vista) !== null;
    }

    // --- guardado (navegador) ----------------------------------------------

    restaurar() {
        try {
            const guardado = JSON.parse(localStorage.getItem(this.claveAlmacen) ?? "null");
            if (!guardado) return;
            const [nx, ny] = this.visor.volumen.dims;
            if (Array.isArray(guardado.puntos)) {
                this.puntos = guardado.puntos
                    .filter(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))
                    .map(([u, v]) => [limitar(u, 0, nx), limitar(v, 0, ny)]);
            }
            if (Number.isFinite(guardado.grosor)) this.grosor = guardado.grosor;
            if (Number.isFinite(guardado.separacion)) this.separacion = guardado.separacion;
            if (Number.isFinite(guardado.capa)) this.capa = limitar(guardado.capa, -CAPA_MAXIMA, CAPA_MAXIMA);
        } catch {
            // Sin almacenamiento (modo privado, bloqueado...): se empieza sin curva.
        }
    }

    guardar() {
        try {
            localStorage.setItem(this.claveAlmacen, JSON.stringify({
                puntos: this.puntos.map(([u, v]) => [Math.round(u * 100) / 100, Math.round(v * 100) / 100]),
                grosor: this.grosor,
                separacion: this.separacion,
                capa: this.capa,
            }));
        } catch {
            // Sin almacenamiento: la curva vale para esta sesión del visor.
        }
    }
}

function limitar(valor, minimo, maximo) {
    return Math.min(maximo, Math.max(minimo, valor));
}

/**
 * Números de las transversales junto a sus marcas. Si están tan juntas que se
 * pisarían (transversales cada 0,5-1 mm con poco zoom), un solo "1–5" en la
 * del centro.
 */
function pintarNumeros(ctx, etiquetas, dpr) {
    if (!etiquetas.length) return;
    const juntas = etiquetas.some((a, i) => i && Math.hypot(a.x - etiquetas[i - 1].x, a.y - etiquetas[i - 1].y) < 14 * dpr);
    if (!juntas) {
        for (const { n, x, y } of etiquetas) ctx.fillText(String(n + 1), x, y);
        return;
    }
    const centro = etiquetas.find(et => et.n === CENTRO) ?? etiquetas[etiquetas.length >> 1];
    ctx.fillText(`${etiquetas[0].n + 1}–${etiquetas.at(-1).n + 1}`, centro.x, centro.y);
}

/**
 * Catmull-Rom centrípeta (Barry-Goldman) por los puntos de control, en mm.
 * Los extremos se prolongan por reflexión para que la curva pase por todos.
 */
function catmullRom(puntos, pasoMm) {
    const reflejo = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
    const p = [reflejo(puntos[0], puntos[1]), ...puntos, reflejo(puntos.at(-1), puntos.at(-2))];
    const nudo = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-4);
    const mezcla = (a, b, ta, tb, t) => {
        const k = (t - ta) / (tb - ta);
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    const salida = [puntos[0]];
    for (let i = 1; i < p.length - 2; i++) {
        const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
        const t0 = 0;
        const t1 = t0 + nudo(p0, p1);
        const t2 = t1 + nudo(p1, p2);
        const t3 = t2 + nudo(p2, p3);
        const tramos = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / pasoMm));
        for (let n = 1; n <= tramos; n++) {
            const t = t1 + ((t2 - t1) * n) / tramos;
            const a1 = mezcla(p0, p1, t0, t1, t);
            const a2 = mezcla(p1, p2, t1, t2, t);
            const a3 = mezcla(p2, p3, t2, t3, t);
            const b1 = mezcla(a1, a2, t0, t2, t);
            const b2 = mezcla(a2, a3, t1, t3, t);
            salida.push(mezcla(b1, b2, t1, t2, t));
        }
    }
    return salida;
}
