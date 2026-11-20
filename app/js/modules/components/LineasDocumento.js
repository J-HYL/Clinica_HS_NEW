// LineasDocumento.js — Lineas editables de un documento (presupuesto, factura).
// Mismo componente en los dos: en escritorio es una rejilla alineada; en el
// movil cada linea es una tarjeta con los mismos campos. Estilos en
// css/components/documento.css.
//
// Escribir o elegir un servicio del catalogo (tabla services) rellena su
// precio, que se puede cambiar. Los importes se escriben como texto para poder
// poner "12,5" con coma.
//
//   const lineas = new LineasDocumento(contenedor, {
//     pieza: true,        // columna de pieza dental (FDI)
//     descuento: true,    // descuento % por linea
//     concepto: "Tratamiento",
//     alCambiar: (totales) => ...,
//   });
//   lineas.cargarCatalogo(servicios);   // [{ id, nombre, precio }]
//   lineas.lineas   -> lineas rellenas, con importes ya en numero
//   lineas.totales  -> { subtotal, descuentos, total, valido }

import { escapeHtml } from "../html.js";
import { euros } from "../formato.js";

let secuencia = 0;

/** "12,5" -> 12.5 ; "" -> 0 ; texto no numerico -> NaN */
function aNumero(texto) {
  const limpio = String(texto ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (limpio === "") return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}

const centimos = (n) => Math.round(n * 100) / 100;
const precioATexto = (n) => (n ? String(Number(n)).replace(".", ",") : "");

export default class LineasDocumento {
  #raiz;
  #op;
  #lineas = [];
  #catalogo = [];
  #idCatalogo = `catalogo-${++secuencia}`;

  constructor(raiz, { pieza = true, descuento = true, concepto = "Tratamiento", placeholder = "Implante, limpieza…", alCambiar } = {}) {
    this.#raiz = raiz;
    this.#op = { pieza, descuento, concepto, placeholder, alCambiar };
    this.#montar();
    this.vaciar();
  }

  /** Servicios para el desplegable del concepto: [{ id, nombre, precio }]. */
  cargarCatalogo(servicios) {
    this.#catalogo = (servicios || []).filter((s) => s && s.nombre);
    this.#raiz.querySelector("datalist").innerHTML = this.#catalogo
      .map((s) => `<option value="${escapeHtml(s.nombre)}">${escapeHtml(euros(s.precio))}</option>`)
      .join("");
  }

  /** Deja una sola linea vacia. */
  vaciar() {
    this.#lineas = [this.#nueva()];
    this.#pintar();
  }

  /** Lineas con concepto, ya en numeros: { descripcion, servicioId, pieza, cantidad, precio, descuento, importe }. */
  get lineas() {
    return this.#lineas
      .filter((l) => l.descripcion.trim())
      .map((l) => {
        const n = this.#numeros(l);
        return {
          descripcion: l.descripcion.trim(),
          servicioId: l.servicioId,
          pieza: l.pieza.trim(),
          cantidad: n.cantidad,
          precio: n.precio,
          descuento: n.descuento,
          importe: n.importe,
        };
      });
  }

  /** Totales de las lineas validas. valido=false si alguna linea tiene un numero mal escrito. */
  get totales() {
    let subtotal = 0, descuentos = 0, valido = true;
    for (const l of this.#lineas) {
      const n = this.#numeros(l);
      if (Number.isNaN(n.importe)) { valido = false; continue; }
      subtotal += n.bruto;
      descuentos += n.bruto - n.importe;
    }
    return { subtotal: centimos(subtotal), descuentos: centimos(descuentos), total: centimos(subtotal - descuentos), valido };
  }

  /** Problemas que impiden usar las lineas (vacio si todo esta bien). */
  errores() {
    const errores = [];
    if (!this.lineas.length) errores.push(`Añade al menos un ${this.#op.concepto.toLowerCase()}.`);
    if (!this.totales.valido) errores.push("Revisa los importes marcados en rojo.");
    return errores;
  }

  // ---------------------------------------------------------------- interno

  #nueva() {
    return { clave: `l${++secuencia}`, servicioId: null, descripcion: "", pieza: "", cantidad: "1", precio: "", descuento: "" };
  }

  #numeros(l) {
    const cantidad = aNumero(l.cantidad);
    const precio = aNumero(l.precio);
    const descuento = this.#op.descuento ? aNumero(l.descuento) : 0;
    const malo = [cantidad, precio, descuento].some((n) => Number.isNaN(n) || n < 0) || descuento > 100;
    const bruto = malo ? NaN : centimos(cantidad * precio);
    return { cantidad, precio, descuento, bruto, importe: malo ? NaN : centimos(bruto * (1 - descuento / 100)) };
  }

  #montar() {
    const { pieza, descuento, concepto } = this.#op;
    this.#raiz.classList.add("lineas");
    this.#raiz.classList.toggle("lineas--sin-pieza", !pieza);
    this.#raiz.classList.toggle("lineas--sin-descuento", !descuento);
    this.#raiz.innerHTML = `
      <datalist id="${this.#idCatalogo}"></datalist>
      <div class="lineas__cabecera" aria-hidden="true">
        <span>${escapeHtml(concepto)}</span>
        ${pieza ? "<span>Pieza</span>" : ""}
        <span class="lineas__fin">Cant.</span>
        <span class="lineas__fin">Precio €</span>
        ${descuento ? '<span class="lineas__fin">Dto. %</span>' : ""}
        <span class="lineas__fin">Total</span>
        <span></span>
      </div>
      <ol class="lineas__lista"></ol>
      <button type="button" class="boton boton--secundario boton--pequeno lineas__anadir" data-anadir>
        <i class="ri-add-line" aria-hidden="true"></i> Añadir ${escapeHtml(concepto.toLowerCase())}
      </button>`;

    this.#raiz.addEventListener("input", (e) => this.#alEscribir(e));
    this.#raiz.addEventListener("click", (e) => {
      if (e.target.closest("[data-anadir]")) {
        this.#lineas.push(this.#nueva());
        this.#pintar();
        this.#raiz.querySelector(".lineas__fila:last-child [data-campo='descripcion']")?.focus();
        return;
      }
      const quitar = e.target.closest("[data-quitar]");
      if (quitar) {
        this.#lineas = this.#lineas.filter((l) => l.clave !== quitar.closest("[data-clave]").dataset.clave);
        if (!this.#lineas.length) this.#lineas.push(this.#nueva());
        this.#pintar();
      }
    });
  }

  #alEscribir(e) {
    const campo = e.target.dataset.campo;
    const fila = e.target.closest("[data-clave]");
    if (!campo || !fila) return;
    const linea = this.#lineas.find((l) => l.clave === fila.dataset.clave);
    linea[campo] = e.target.value;

    // Concepto del catalogo -> su precio (se puede cambiar despues).
    if (campo === "descripcion") {
      const servicio = this.#catalogo.find((s) => s.nombre.trim().toLowerCase() === e.target.value.trim().toLowerCase());
      linea.servicioId = servicio ? servicio.id : null;
      if (servicio) {
        linea.precio = precioATexto(servicio.precio) || "0";
        fila.querySelector("[data-campo='precio']").value = linea.precio;
      }
    }
    this.#pintarImporte(fila, linea);
    this.#op.alCambiar?.(this.totales);
  }

  #pintarImporte(fila, linea) {
    const n = this.#numeros(linea);
    const malo = Number.isNaN(n.importe);
    const salida = fila.querySelector("[data-importe]");
    salida.textContent = malo ? "Revisa" : euros(n.importe);
    salida.classList.toggle("lineas__importe--error", malo);
    for (const campo of ["cantidad", "precio", "descuento"]) {
      const input = fila.querySelector(`[data-campo='${campo}']`);
      if (!input) continue;
      const valor = aNumero(input.value);
      const invalido = Number.isNaN(valor) || valor < 0 || (campo === "descuento" && valor > 100);
      input.classList.toggle("error", invalido);
      input.toggleAttribute("aria-invalid", invalido);
    }
  }

  #pintar() {
    const { pieza, descuento, concepto, placeholder } = this.#op;
    const campo = (nombre, etiqueta, valor, extra = "") => `
      <label class="lineas__campo lineas__campo--${nombre}">
        <span class="lineas__etiqueta">${etiqueta}</span>
        <input class="form__input" data-campo="${nombre}" value="${escapeHtml(valor)}" autocomplete="off" ${extra}>
      </label>`;

    this.#raiz.querySelector(".lineas__lista").innerHTML = this.#lineas.map((l, i) => `
      <li class="lineas__fila" data-clave="${l.clave}">
        ${campo("descripcion", escapeHtml(concepto), l.descripcion, `list="${this.#idCatalogo}" placeholder="${escapeHtml(placeholder)}"`)}
        ${pieza ? campo("pieza", "Pieza", l.pieza, 'placeholder="36"') : ""}
        ${campo("cantidad", "Cant.", l.cantidad, 'inputmode="decimal"')}
        ${campo("precio", "Precio €", l.precio, 'inputmode="decimal" placeholder="0,00"')}
        ${descuento ? campo("descuento", "Dto. %", l.descuento, 'inputmode="decimal" placeholder="0"') : ""}
        <output class="lineas__importe" data-importe aria-label="Total de la línea ${i + 1}"></output>
        <button type="button" class="boton boton--icono boton--fantasma lineas__quitar" data-tono="peligro" data-quitar
          aria-label="Quitar la línea ${i + 1}" title="Quitar la línea"${this.#lineas.length === 1 ? " disabled" : ""}>
          <i class="ri-delete-bin-line" aria-hidden="true"></i>
        </button>
      </li>`).join("");

    this.#raiz.querySelectorAll(".lineas__fila").forEach((fila, i) => this.#pintarImporte(fila, this.#lineas[i]));
    this.#op.alCambiar?.(this.totales);
  }
}
