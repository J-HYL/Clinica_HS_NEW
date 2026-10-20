// modules/components/tac/VistaLienzo.js
// Base de TODAS las vistas 2D del visor TAC: cortes axial/coronal/sagital
// (VistaCorte) y panorámica/transversales (VistaReconstruida). Aquí vive lo que
// es igual en todas:
//   - pintar la imagen en un <canvas> respetando el tamaño real del píxel (mm),
//     con zoom y desplazamiento;
//   - los rótulos de las esquinas, las letras de orientación ancladas a la
//     imagen y la barra de escala en mm (HTML encima del lienzo: texto nítido);
//   - las medidas (distancia, ángulo, valor de gris), que se pueden
//     seleccionar, mover y borrar;
//   - el ratón común (contraste con el botón derecho, desplazar, zoom) y la
//     captura PNG con los rótulos incluidos.
//
// Cada subclase solo dice cómo es su imagen. Métodos que puede definir:
//   rellenar(gris)        llena this.pixeles (Uint32) pasando cada valor por gris(v)
//   valorEn(u, v)         valor de gris en ese punto de la imagen
//   claveCorte()          qué se está viendo (las medidas van ligadas a eso)
//   lineasRotulo()        líneas propias de la esquina superior izquierda
//   letras()              [izquierda, derecha, arriba, abajo] o null
//   pintarEncima(ctx, e)  cruz de referencia, marcas...
//   alNavegar(u, v)       clic/arrastre con la herramienta "navegar"
//   alDesplazar(pasos)    rueda o flechas: siguiente/anterior corte
//
// Las "capas" (this.capas) son dibujo + ratón añadidos desde fuera, como la
// curva de la panorámica sobre el corte axial (Panoramica.js).
//
// El estado compartido (ventana, herramienta activa, invertir...) vive en el
// objeto `visor` de visor.js.

const COLOR_MEDIDA = "#fed600";
const COLOR_SELECCION = "#ffffff";
const RADIO_AGARRE = 9;                     // px CSS para agarrar un punto de una medida
const ESCALAS_MM = [1, 2, 5, 10, 20, 50, 100];

export default class VistaLienzo {
    /**
     * @param {HTMLElement} contenedor - cuerpo del panel (posición relativa)
     * @param {Object} visor - estado compartido del visor
     * @param {{nombre: string, titulo: string, color: string}} opciones
     */
    constructor(contenedor, visor, { nombre, titulo, color }) {
        this.contenedor = contenedor;
        this.panel = contenedor.closest(".tac-vista");
        this.visor = visor;
        this.nombre = nombre;
        this.titulo = titulo;
        this.color = color;

        this.imagen = null;
        this.mensaje = null;
        this.zoom = 1;
        this.desplazamiento = [0, 0];
        this.medidas = [];
        this.seleccionada = null;
        this.enCurso = null;        // ángulo a medio marcar
        this.arrastre = null;
        this.puntero = null;        // último punto bajo el ratón (coordenadas de imagen)
        this.ruedaAcumulada = 0;
        this.capas = [];

        this.lienzo = document.createElement("canvas");
        this.lienzo.className = "tac-vista__lienzo";
        this.lienzo.tabIndex = 0;
        this.lienzo.setAttribute("role", "img");
        this.lienzo.setAttribute("aria-label", `Vista ${titulo}`);
        this.ctx = this.lienzo.getContext("2d");

        this.rotulos = crearRotulos(titulo, color);
        contenedor.append(this.lienzo, this.rotulos.raiz);

        this.buffer = document.createElement("canvas");
        this.ctxBuffer = this.buffer.getContext("2d");

        this.observador = new ResizeObserver(() => this.ajustarTamano());
        this.observador.observe(contenedor);
        this.cablear();
    }

    // --- imagen -------------------------------------------------------------

    /** Tamaño de la imagen en píxeles y del píxel en mm. */
    fijarImagen(ancho, alto, mmX, mmY) {
        if (!this.imagen || ancho !== this.ancho || alto !== this.alto) {
            this.imagen = new ImageData(ancho, alto);
            this.pixeles = new Uint32Array(this.imagen.data.buffer);
            this.buffer.width = ancho;
            this.buffer.height = alto;
        }
        Object.assign(this, { ancho, alto, mmX, mmY });
        this.mensaje = null;
        this.firmaPintada = null;   // contenido nuevo: hay que volver a pasarlo a grises
    }

    /** Sin imagen que pintar (p. ej. panorámica sin curva): se enseña un mensaje. */
    quitarImagen(mensaje) {
        this.imagen = null;
        this.mensaje = mensaje;
        this.pintar();
    }

    /** Valor -> píxel gris (ventana/nivel del visor, invertido si toca). */
    mapaGris() {
        const { centro, ancho } = this.visor.ventana;
        const minimo = centro - ancho / 2;
        const escala = 255 / ancho;
        const invertir = this.visor.invertir;
        return (v) => {
            let g = (v - minimo) * escala;
            g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
            if (invertir) g = 255 - g;
            return 0xff000000 | (g << 16) | (g << 8) | g;
        };
    }

    // --- geometría ----------------------------------------------------------

    /** Dónde cae la imagen en el lienzo (px de dispositivo). */
    encuadre() {
        const W = this.lienzo.width;
        const H = this.lienzo.height;
        const anchoMm = this.ancho * this.mmX;
        const altoMm = this.alto * this.mmY;
        const escala = Math.min(W / anchoMm, H / altoMm) * 0.94 * this.zoom;
        const w = anchoMm * escala;
        const h = altoMm * escala;
        return { x: (W - w) / 2 + this.desplazamiento[0], y: (H - h) / 2 + this.desplazamiento[1], w, h, escala };
    }

    aImagen(px, py, e = this.encuadre()) {
        return [((px - e.x) / e.w) * this.ancho, ((py - e.y) / e.h) * this.alto];
    }

    aPantalla(u, v, e = this.encuadre()) {
        return [e.x + (u / this.ancho) * e.w, e.y + (v / this.alto) * e.h];
    }

    /** px de dispositivo por px CSS. */
    dpr() {
        return this.lienzo.width / Math.max(1, this.lienzo.clientWidth);
    }

    /** Posición del puntero en px de dispositivo del lienzo. */
    punto(ev) {
        const caja = this.lienzo.getBoundingClientRect();
        const dpr = this.lienzo.width / Math.max(1, caja.width);
        return [(ev.clientX - caja.left) * dpr, (ev.clientY - caja.top) * dpr];
    }

    visible() {
        return this.lienzo.offsetParent !== null;
    }

    // --- pintado ------------------------------------------------------------

    pintar() {
        if (!this.lienzo.width || !this.lienzo.height || !this.visible()) return;
        const ctx = this.ctx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, this.lienzo.width, this.lienzo.height);

        this.rotulos.mensaje.hidden = !!this.imagen || !this.mensaje;
        this.rotulos.mensaje.textContent = this.imagen ? "" : (this.mensaje ?? "");
        if (!this.imagen) {
            this.actualizarRotulos(null);
            return;
        }

        // Pasar la imagen a grises es lo caro: solo si ha cambiado lo que se ve
        // (corte, contraste, invertir). Al mover el ratón solo cambia lo de encima.
        const { centro, ancho } = this.visor.ventana;
        const firma = `${centro}|${ancho}|${this.visor.invertir}|${this.firmaImagen()}`;
        if (firma !== this.firmaPintada) {
            this.rellenar(this.mapaGris());
            this.ctxBuffer.putImageData(this.imagen, 0, 0);
            this.firmaPintada = firma;
        }
        const e = this.encuadre();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(this.buffer, e.x, e.y, e.w, e.h);

        this.pintarEncima?.(ctx, e);
        for (const capa of this.capas) capa.pintar?.(ctx, e, this);
        this.pintarMedidas(ctx, e);
        this.actualizarRotulos(e);
    }

    /** Lo que define el contenido de la imagen (cada subclase dice qué). */
    firmaImagen() {
        return "";
    }

    /** Repinta en el siguiente fotograma: agrupa los movimientos del ratón. */
    repintar() {
        if (this.repintePendiente) return;
        this.repintePendiente = true;
        requestAnimationFrame(() => {
            this.repintePendiente = false;
            this.pintar();
        });
    }

    ajustarTamano() {
        const caja = this.contenedor.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.lienzo.width = Math.max(1, Math.round(caja.width * dpr));
        this.lienzo.height = Math.max(1, Math.round(caja.height * dpr));
        this.pintar();
    }

    // --- rótulos ------------------------------------------------------------

    /** Nombre del contraste en uso (o sus números si se ha ajustado a mano). */
    textoVentana() {
        const { centro, ancho } = this.visor.ventana;
        return this.visor.nombreVentana() ?? `Ventana ${Math.round(ancho)} · Nivel ${Math.round(centro)}`;
    }

    actualizarRotulos(e) {
        const r = this.rotulos;
        ponerLineas(r.si, e ? (this.lineasRotulo?.() ?? []) : []);

        const derecha = e ? [this.textoVentana()] : [];
        if (e && this.visor.invertir) derecha.push("Invertido");
        ponerLineas(r.sd, derecha);

        const abajo = [];
        if (e && this.zoom !== 1) abajo.push(`Zoom ${formatoNumero(this.zoom, 1)}×`);
        if (e && this.visor.herramienta === "sonda" && this.puntero) {
            const valor = this.valorEn(...this.puntero);
            if (Number.isFinite(valor)) abajo.push(`Valor de gris ${Math.round(valor)}`);
        }
        ponerLineas(r.ii, abajo);

        this.colocarLetras(e);
        this.colocarEscala(e);
    }

    /**
     * Letras de orientación en el centro de cada borde de la IMAGEN (no del
     * lienzo): fuera de ella si hay sitio, para no pisar la cruz; si no, dentro.
     */
    colocarLetras(e) {
        const letras = e ? this.letras?.() : null;
        const dpr = this.dpr();
        const anchoCss = this.lienzo.clientWidth;
        const altoCss = this.lienzo.clientHeight;
        const hueco = 24;     // px CSS que necesita una letra fuera de la imagen
        const barra = 30;     // a la derecha va la barra de cortes
        const posiciones = e && (() => {
            const [x0, y0] = [e.x / dpr, e.y / dpr];
            const [x1, y1] = [(e.x + e.w) / dpr, (e.y + e.h) / dpr];
            const [xm, ym] = [(x0 + x1) / 2, (y0 + y1) / 2];
            return {
                izq: [x0 >= hueco ? x0 - 12 : Math.max(x0 + 12, 14), ym],
                der: [anchoCss - x1 >= hueco + barra ? x1 + 12 : Math.min(x1 - 12, anchoCss - barra), ym],
                arr: [xm, y0 >= hueco ? y0 - 12 : Math.max(y0 + 12, 14)],
                aba: [xm, altoCss - y1 >= hueco ? y1 + 12 : Math.min(y1 - 12, altoCss - 14)],
            };
        })();
        ["izq", "der", "arr", "aba"].forEach((lado, n) => {
            const elemento = this.rotulos.letras[lado];
            elemento.hidden = !letras?.[n];
            if (!letras?.[n]) return;
            elemento.textContent = letras[n];
            elemento.style.left = `${posiciones[lado][0]}px`;
            elemento.style.top = `${posiciones[lado][1]}px`;
        });
    }

    /** Barra de escala con una longitud "redonda" (1, 2, 5, 10... mm) de como mucho 120 px. */
    colocarEscala(e) {
        const caja = this.rotulos.escala;
        caja.hidden = !e;
        this.escalaActual = null;
        if (!e) return;
        const pxPorMm = e.escala / this.dpr();
        const mm = [...ESCALAS_MM].reverse().find(l => l * pxPorMm <= 120) ?? ESCALAS_MM[0];
        this.escalaActual = { mm, px: mm * pxPorMm };
        caja.querySelector(".tac-escala__barra").style.width = `${this.escalaActual.px}px`;
        caja.querySelector(".tac-escala__texto").textContent = `${mm} mm`;
    }

    // --- medidas ------------------------------------------------------------

    /** Medidas del corte que se está viendo. */
    medidasVisibles() {
        const clave = this.claveCorte?.() ?? null;
        return this.medidas.filter(m => m.clave === clave);
    }

    longitud(a, b) {
        return Math.hypot((b[0] - a[0]) * this.mmX, (b[1] - a[1]) * this.mmY);
    }

    angulo([a, b, c]) {
        const v1 = [(a[0] - b[0]) * this.mmX, (a[1] - b[1]) * this.mmY];
        const v2 = [(c[0] - b[0]) * this.mmX, (c[1] - b[1]) * this.mmY];
        const coseno = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2) || 1);
        return (Math.acos(Math.min(1, Math.max(-1, coseno))) * 180) / Math.PI;
    }

    /** El ángulo a medio marcar, solo si sigue en el corte donde se empezó. */
    enCursoAqui() {
        return this.enCurso && this.enCurso.clave === (this.claveCorte?.() ?? null) ? this.enCurso : null;
    }

    pintarMedidas(ctx, e) {
        const visibles = this.medidasVisibles();
        if (this.enCursoAqui()) {
            const extremo = this.puntero ?? this.enCurso.puntos.at(-1);
            visibles.push({ ...this.enCurso, puntos: [...this.enCurso.puntos, extremo] });
        }
        for (const medida of visibles) this.pintarMedida(ctx, e, medida, medida === this.seleccionada);
    }

    pintarMedida(ctx, e, medida, seleccionada) {
        const dpr = this.dpr();
        const color = seleccionada ? COLOR_SELECCION : COLOR_MEDIDA;
        const puntos = medida.puntos.map(p => this.aPantalla(p[0], p[1], e));
        ctx.save();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5 * dpr;
        ctx.shadowColor = "rgba(0, 0, 0, .85)";
        ctx.shadowBlur = 3 * dpr;

        let texto = null;
        let ancla = null;
        if (medida.tipo === "sonda") {
            const [x, y] = puntos[0];
            ctx.beginPath();
            ctx.arc(x, y, 5 * dpr, 0, Math.PI * 2);
            ctx.moveTo(x - 10 * dpr, y); ctx.lineTo(x - 6 * dpr, y);
            ctx.moveTo(x + 6 * dpr, y); ctx.lineTo(x + 10 * dpr, y);
            ctx.moveTo(x, y - 10 * dpr); ctx.lineTo(x, y - 6 * dpr);
            ctx.moveTo(x, y + 6 * dpr); ctx.lineTo(x, y + 10 * dpr);
            ctx.stroke();
            const valor = this.valorEn(...medida.puntos[0]);
            texto = Number.isFinite(valor) ? `${Math.round(valor)}` : "—";
            ancla = [x + 12 * dpr, y - 12 * dpr];
        } else {
            ctx.beginPath();
            puntos.forEach(([x, y], n) => (n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.stroke();
            if (medida.tipo === "angulo" && puntos.length === 3) {
                const [a, b, c] = puntos;
                const radio = Math.min(28 * dpr, Math.hypot(a[0] - b[0], a[1] - b[1]) / 2, Math.hypot(c[0] - b[0], c[1] - b[1]) / 2);
                const desde = Math.atan2(a[1] - b[1], a[0] - b[0]);
                let delta = Math.atan2(c[1] - b[1], c[0] - b[0]) - desde;
                while (delta > Math.PI) delta -= Math.PI * 2;
                while (delta < -Math.PI) delta += Math.PI * 2;
                ctx.beginPath();
                ctx.arc(b[0], b[1], radio, desde, desde + delta, delta < 0);
                ctx.stroke();
                texto = `${formatoNumero(this.angulo(medida.puntos), 1)}°`;
                ancla = [b[0] + 12 * dpr, b[1] - 14 * dpr];
            } else if (medida.tipo === "distancia") {
                texto = `${formatoNumero(this.longitud(...medida.puntos), 1)} mm`;
                ancla = [(puntos[0][0] + puntos[1][0]) / 2 + 10 * dpr, (puntos[0][1] + puntos[1][1]) / 2 - 12 * dpr];
            }
            for (const [x, y] of puntos) {
                ctx.beginPath();
                ctx.arc(x, y, (seleccionada ? 4.5 : 3.5) * dpr, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        if (texto) {
            ctx.shadowBlur = 0;
            ctx.font = `600 ${12 * dpr}px Figtree, Arial, sans-serif`;
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            const anchoTexto = ctx.measureText(texto).width;
            ctx.fillStyle = "rgba(8, 11, 16, .8)";
            ctx.fillRect(ancla[0] - 5 * dpr, ancla[1] - 10 * dpr, anchoTexto + 10 * dpr, 20 * dpr);
            ctx.fillStyle = color;
            ctx.fillText(texto, ancla[0], ancla[1]);
        }
        ctx.restore();
    }

    /** Punto de una medida visible cerca del puntero (para moverlo o seleccionarla). */
    puntoCercano(px, py) {
        if (!this.imagen) return null;
        const e = this.encuadre();
        const radio = RADIO_AGARRE * this.dpr();
        for (const medida of this.medidasVisibles()) {
            for (let n = 0; n < medida.puntos.length; n++) {
                const [x, y] = this.aPantalla(medida.puntos[n][0], medida.puntos[n][1], e);
                if (Math.hypot(x - px, y - py) <= radio) return { medida, indice: n };
            }
        }
        return null;
    }

    /** Borra la medida seleccionada o, si no hay, la última de este corte. */
    borrarMedida() {
        const objetivo = this.seleccionada ?? this.medidasVisibles().at(-1);
        if (!objetivo) return false;
        this.medidas = this.medidas.filter(m => m !== objetivo);
        this.seleccionada = null;
        this.pintar();
        return true;
    }

    borrarMedidas() {
        this.medidas = [];
        this.seleccionada = null;
        this.enCurso = null;
        this.pintar();
    }

    /** Deja a medias lo que se estuviera marcando (Esc). Devuelve si había algo. */
    cancelar() {
        if (!this.enCurso && !this.seleccionada) return false;
        this.enCurso = null;
        this.seleccionada = null;
        this.pintar();
        return true;
    }

    restablecer() {
        this.zoom = 1;
        this.desplazamiento = [0, 0];
        this.pintar();
    }

    // --- captura ------------------------------------------------------------

    /**
     * PNG de la vista tal como se ve, con sus rótulos (el HTML de encima del
     * lienzo no está en el lienzo: se dibuja aquí).
     * @param {string[]} cabecera - líneas extra arriba a la izquierda (paciente, fecha)
     * @returns {Promise<Blob>}
     */
    exportarPNG(cabecera = []) {
        const salida = document.createElement("canvas");
        salida.width = this.lienzo.width;
        salida.height = this.lienzo.height;
        const ctx = salida.getContext("2d");
        ctx.drawImage(this.lienzo, 0, 0);

        const dpr = this.dpr();
        const margen = 12 * dpr;
        const alto = 17 * dpr;
        ctx.font = `500 ${12 * dpr}px Figtree, Arial, sans-serif`;
        ctx.shadowColor = "rgba(0, 0, 0, .95)";
        ctx.shadowBlur = 3 * dpr;
        ctx.fillStyle = "#e6e9f0";
        const escribir = (lineas, x, y, alineacion, base) => {
            ctx.textAlign = alineacion;
            ctx.textBaseline = base;
            lineas.forEach((texto, n) => ctx.fillText(texto, x, base === "top" ? y + n * alto : y - (lineas.length - 1 - n) * alto));
        };
        escribir([...cabecera, this.titulo, ...textosDe(this.rotulos.si)], margen, margen, "left", "top");
        escribir(textosDe(this.rotulos.sd), salida.width - margen, margen, "right", "top");
        escribir(textosDe(this.rotulos.ii), margen, salida.height - margen, "left", "bottom");
        if (this.escalaActual) {
            const x = salida.width - margen;
            const y = salida.height - margen - 20 * dpr;
            ctx.fillRect(x - this.escalaActual.px * dpr, y, this.escalaActual.px * dpr, 2 * dpr);
            escribir([`${this.escalaActual.mm} mm`], x, salida.height - margen, "right", "bottom");
        }
        ctx.font = `700 ${13 * dpr}px Figtree, Arial, sans-serif`;
        for (const elemento of Object.values(this.rotulos.letras)) {
            if (elemento.hidden) continue;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(elemento.textContent, parseFloat(elemento.style.left) * dpr, parseFloat(elemento.style.top) * dpr);
        }
        return new Promise(resolve => salida.toBlob(resolve, "image/png"));
    }

    // --- ratón --------------------------------------------------------------

    cablear() {
        const l = this.lienzo;
        l.addEventListener("contextmenu", (e) => e.preventDefault());
        l.addEventListener("pointerdown", (e) => this.alPulsar(e));
        l.addEventListener("pointermove", (e) => this.alMover(e));
        l.addEventListener("pointerup", (e) => this.alSoltar(e));
        l.addEventListener("pointercancel", (e) => this.alSoltar(e));
        l.addEventListener("pointerleave", () => {
            if (this.arrastre) return;
            this.puntero = null;
            // Fuera lo que sigue al ratón: valor de gris, ángulo a medias, tramo de la curva...
            this.repintar();
        });
        l.addEventListener("pointerenter", () => this.visor.activar(this));
        l.addEventListener("focus", () => this.visor.activar(this));
        l.addEventListener("wheel", (e) => this.alRueda(e), { passive: false });
        l.addEventListener("dblclick", () => {
            if (this.visor.herramienta === "navegar") this.visor.alternarAmpliada(this.nombre);
        });
    }

    alPulsar(ev) {
        ev.preventDefault();
        this.lienzo.focus({ preventScroll: true });
        this.visor.activar(this);
        if (!this.imagen) return;
        this.lienzo.setPointerCapture(ev.pointerId);
        const [px, py] = this.punto(ev);
        const [u, v] = this.aImagen(px, py);

        if (ev.button === 2) {
            this.arrastre = { tipo: "ventana", x: ev.clientX, y: ev.clientY, inicial: { ...this.visor.ventana } };
            return;
        }
        if (ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
            this.arrastre = { tipo: "mover", x: px, y: py, inicial: [...this.desplazamiento] };
            return;
        }
        if (ev.button !== 0) return;

        // Primero las capas (p. ej. la curva de la panorámica con su herramienta).
        for (const capa of this.capas) {
            if (capa.alPulsar?.(u, v, this, ev)) {
                this.arrastre = { tipo: "capa", capa };
                return;
            }
        }
        // Agarrar un punto de una medida ya hecha, con cualquier herramienta.
        const agarre = this.enCursoAqui() ? null : this.puntoCercano(px, py);
        if (agarre) {
            this.seleccionada = agarre.medida;
            this.arrastre = { tipo: "punto", ...agarre };
            this.repintar();
            return;
        }

        const herramienta = this.visor.herramienta;
        const clave = this.claveCorte?.() ?? null;
        if (herramienta === "medir") {
            const medida = { tipo: "distancia", puntos: [[u, v], [u, v]], clave };
            this.medidas.push(medida);
            this.seleccionada = medida;
            this.arrastre = { tipo: "punto", medida, indice: 1, nueva: true };
        } else if (herramienta === "angulo") {
            // Tres clics: un extremo, el vértice y el otro extremo (con vista previa).
            // Si entretanto se ha cambiado de corte, se empieza de nuevo en este.
            if (!this.enCursoAqui()) {
                this.enCurso = { tipo: "angulo", puntos: [[u, v]], clave };
            } else {
                this.enCurso.puntos.push([u, v]);
                if (this.enCurso.puntos.length === 3) {
                    this.medidas.push(this.enCurso);
                    this.seleccionada = this.enCurso;
                    this.enCurso = null;
                }
            }
            this.repintar();
        } else if (herramienta === "sonda") {
            const medida = { tipo: "sonda", puntos: [[u, v]], clave };
            this.medidas.push(medida);
            this.seleccionada = medida;
            this.repintar();
        } else {
            if (this.seleccionada) this.seleccionada = null;
            this.arrastre = { tipo: "navegar" };
            this.alNavegar?.(u, v);
        }
    }

    alMover(ev) {
        const [px, py] = this.punto(ev);
        const [u, v] = this.aImagen(px, py);
        this.puntero = this.imagen && u >= 0 && v >= 0 && u < this.ancho && v < this.alto ? [u, v] : null;
        const a = this.arrastre;

        if (!a) {
            if (!this.imagen) return;
            const sobreCapa = this.capas.some(capa => capa.alSobrevolar?.(u, v, this));
            this.lienzo.classList.toggle("tac-vista__lienzo--agarre", sobreCapa || !!this.puntoCercano(px, py));
            if (this.visor.herramienta === "sonda" || this.enCursoAqui()) this.repintar();
            return;
        }
        if (a.tipo === "ventana") {
            // Derecha = más ancho (menos contraste); abajo = nivel más alto (más oscuro).
            const s = this.visor.sensibilidadVentana;
            this.visor.fijarVentana({
                ancho: Math.max(1, a.inicial.ancho + (ev.clientX - a.x) * s),
                centro: a.inicial.centro + (ev.clientY - a.y) * s,
            });
        } else if (a.tipo === "mover") {
            this.desplazamiento = [a.inicial[0] + px - a.x, a.inicial[1] + py - a.y];
            this.repintar();
        } else if (a.tipo === "punto") {
            a.medida.puntos[a.indice] = [u, v];
            this.repintar();
        } else if (a.tipo === "capa") {
            a.capa.alArrastrar?.(u, v, this);
        } else if (a.tipo === "navegar") {
            this.alNavegar?.(u, v);
        }
    }

    alSoltar(ev) {
        const a = this.arrastre;
        this.arrastre = null;
        if (this.lienzo.hasPointerCapture(ev.pointerId)) this.lienzo.releasePointerCapture(ev.pointerId);
        if (!a) return;
        if (a.tipo === "capa") a.capa.alSoltar?.(this);
        // Un clic suelto con "distancia" no deja una medida de 0 mm.
        if (a.nueva && this.longitud(...a.medida.puntos) < 0.3) {
            this.medidas = this.medidas.filter(m => m !== a.medida);
            this.seleccionada = null;
            this.repintar();
        }
    }

    alRueda(ev) {
        ev.preventDefault();
        if (!this.imagen) return;
        if (ev.ctrlKey) {
            // Zoom manteniendo quieto el punto que hay bajo el ratón.
            const [px, py] = this.punto(ev);
            const [u, v] = this.aImagen(px, py);
            this.zoom = Math.min(20, Math.max(0.5, this.zoom * Math.exp(-ev.deltaY * 0.0015)));
            const [nx, ny] = this.aPantalla(u, v, this.encuadre());
            this.desplazamiento[0] += px - nx;
            this.desplazamiento[1] += py - ny;
            this.repintar();
            return;
        }
        // Rueda de ratón (saltos grandes): un paso por muesca. Trackpad (saltos
        // pequeños y muchos): se acumula para que no vuele.
        let pasos;
        if (ev.deltaMode !== 0 || Math.abs(ev.deltaY) >= 50) {
            pasos = Math.sign(ev.deltaY);
        } else {
            this.ruedaAcumulada += ev.deltaY;
            pasos = Math.trunc(this.ruedaAcumulada / 25);
            this.ruedaAcumulada -= pasos * 25;
        }
        if (pasos) this.alDesplazar?.(pasos);
    }

    destruir() {
        this.observador.disconnect();
    }
}

// --- rótulos (HTML encima del lienzo) ------------------------------------------

function crearRotulos(titulo, color) {
    const raiz = document.createElement("div");
    raiz.className = "tac-rotulos";
    raiz.setAttribute("aria-hidden", "true");
    raiz.innerHTML = `
        <div class="tac-rotulo tac-rotulo--si"><span class="tac-rotulo__titulo"></span><div class="tac-rotulo__lineas" data-lineas></div></div>
        <div class="tac-rotulo tac-rotulo--sd"><div class="tac-rotulo__lineas" data-lineas></div></div>
        <div class="tac-rotulo tac-rotulo--ii"><div class="tac-rotulo__lineas" data-lineas></div></div>
        <div class="tac-escala" hidden><span class="tac-escala__texto"></span><span class="tac-escala__barra"></span></div>
        <span class="tac-letra" data-lado="izq" hidden></span>
        <span class="tac-letra" data-lado="der" hidden></span>
        <span class="tac-letra" data-lado="arr" hidden></span>
        <span class="tac-letra" data-lado="aba" hidden></span>
        <p class="tac-rotulos__mensaje" hidden></p>`;
    const tituloEl = raiz.querySelector(".tac-rotulo__titulo");
    tituloEl.textContent = titulo;
    tituloEl.style.setProperty("--color-plano", color);
    const letra = (lado) => raiz.querySelector(`.tac-letra[data-lado="${lado}"]`);
    return {
        raiz,
        si: raiz.querySelector(".tac-rotulo--si [data-lineas]"),
        sd: raiz.querySelector(".tac-rotulo--sd [data-lineas]"),
        ii: raiz.querySelector(".tac-rotulo--ii [data-lineas]"),
        escala: raiz.querySelector(".tac-escala"),
        letras: { izq: letra("izq"), der: letra("der"), arr: letra("arr"), aba: letra("aba") },
        mensaje: raiz.querySelector(".tac-rotulos__mensaje"),
    };
}

/** Pone líneas de texto (textContent: nunca HTML) solo si han cambiado. */
function ponerLineas(contenedor, lineas) {
    const actuales = textosDe(contenedor);
    if (actuales.length === lineas.length && actuales.every((t, n) => t === lineas[n])) return;
    contenedor.replaceChildren(...lineas.map(texto => {
        const linea = document.createElement("span");
        linea.textContent = texto;
        return linea;
    }));
}

function textosDe(contenedor) {
    return [...contenedor.children].map(hijo => hijo.textContent);
}

/** Número con coma decimal y los decimales justos ("12,5"). */
export function formatoNumero(valor, decimales) {
    return valor.toLocaleString("es-ES", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
