// Tabla.js — Tabla UNICA del panel. Todas las listas de datos (pacientes, citas,
// servicios, tratamientos, pagos, facturas, inventario, TAC, visitas) usan este
// componente: no hay otra tabla. Estilos en css/components/tabla.css.
//
// - Escritorio: tabla de verdad (<table>), con cabeceras que ordenan.
// - Movil (<768px): la MISMA tabla se ve como tarjetas, solo con CSS, sin
//   scroll horizontal ni letra diminuta (lo que hacia DataTables).
// - Busca (sin distinguir tildes ni mayusculas), ordena y pagina en memoria:
//   los listados de una clinica caben de sobra en el navegador.
//
// Uso:
//   const tabla = new Tabla(contenedor, {
//     columnas: [
//       { clave: "nombre", titulo: "Nombre", rol: "principal" },
//       { clave: "Alta", titulo: "Alta", tipo: "fecha" },
//       { clave: "estado", titulo: "Estado", celda: (f) => `<span ...>` },  // HTML ya escapado
//     ],
//     acciones: (f) => `<button ...>`,   // ultima columna (opcional)
//     orden: { clave: "Alta", dir: "asc" },
//   });
//   tabla.datos(registros);
//
// Columna: clave, titulo y opcionales:
//   tipo     "texto" (defecto) | "numero" | "dinero" | "fecha"  -> formato, alineado y orden
//   celda    (fila) => HTML propio. OJO: escapar con escapeHtml lo que venga de la BD.
//   texto    (fila) => texto plano para buscar (por defecto, el valor mostrado)
//   valor    (fila) => valor para ordenar (por defecto, el dato crudo)
//   ordenable  false para no ordenar por ella
//   rol      "principal" (titulo de la tarjeta en movil) | "imagen" (miniatura) |
//            "escritorio" (no sale en la tarjeta del movil)
//
// Opciones: acciones, orden, porPagina (10; 0 = sin paginar), buscador (true;
// o { placeholder }), busquedaInicial, textoBusqueda (fila => texto extra que
// tambien se busca), claseFila (fila => clase), vacio (texto), etiqueta
// (nombre accesible), registro (["paciente", "pacientes"] para el contador),
// alPintar (visibles => ...) para resumenes de lo filtrado (p. ej. total cobrado).
//
// Las acciones se cablean por delegacion en el contenedor (data-id en cada
// boton), como antes: la pagina sigue escuchando los clicks como siempre.

import { escapeHtml } from "../html.js";
import { euros, formatFecha, numero } from "../formato.js";

const POR_PAGINA = [10, 20, 50];
const colador = new Intl.Collator("es", { sensitivity: "base", numeric: true });
const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default class Tabla {
  #contenedor;
  #op;
  #filas = [];
  #filtro = null;
  #busqueda = "";
  #orden;
  #pagina = 0;
  #porPagina;

  constructor(contenedor, opciones) {
    this.#contenedor = contenedor;
    this.#op = { buscador: true, vacio: "No hay registros", registro: ["registro", "registros"], ...opciones };
    this.#orden = opciones.orden ? { ...opciones.orden } : null;
    this.#porPagina = opciones.porPagina ?? 10;
    this.#busqueda = opciones.busquedaInicial || "";
    this.#montar();
  }

  /** Registros actuales (sin filtrar). */
  get filas() { return this.#filas; }

  /** Pone los registros y pinta (vuelve a la primera pagina). */
  datos(filas) {
    this.#filas = Array.isArray(filas) ? filas : [];
    this.#pagina = 0;
    this.#pintar();
    return this;
  }

  /** Vuelve a pintar sin cambiar de pagina (tras editar un dato de una fila). */
  repintar() {
    this.#pintar();
    return this;
  }

  /** Filtro extra de la pagina (p. ej. categoria del inventario). null lo quita. */
  filtro(fn) {
    this.#filtro = fn;
    this.#pagina = 0;
    this.#pintar();
    return this;
  }

  /** Busqueda desde fuera (cuando la pagina tiene su propio buscador). */
  buscar(texto) {
    this.#busqueda = texto || "";
    const input = this.#contenedor.querySelector(".tabla__buscador input");
    if (input && input.value !== this.#busqueda) input.value = this.#busqueda;
    this.#pagina = 0;
    this.#pintar();
    return this;
  }

  ordenar(clave, dir = "asc") {
    this.#orden = clave ? { clave, dir } : null;
    this.#pagina = 0;
    this.#pintar();
    return this;
  }

  cargando(texto = "Cargando…") {
    this.#estado(`<p class="estado-vacio"><i class="ri-loader-4-line tabla__girando" aria-hidden="true"></i>${escapeHtml(texto)}</p>`, true);
  }

  /** mensajeHtml: HTML ya escapado. */
  error(mensajeHtml) {
    this.#estado(`<p class="estado-error"><i class="ri-error-warning-line" aria-hidden="true"></i>${mensajeHtml}</p>`);
  }

  /** Va a la pagina de la fila con ese id y la resalta un momento. */
  resaltar(id) {
    const visibles = this.#visibles();
    const indice = visibles.findIndex((f) => String(this.#idDe(f)) === String(id));
    if (indice < 0) return;
    if (this.#porPagina) this.#pagina = Math.floor(indice / this.#porPagina);
    this.#pintar();
    const fila = this.#contenedor.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
    if (!fila) return;
    fila.classList.add("tabla__fila--resaltada");
    fila.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => fila.classList.remove("tabla__fila--resaltada"), 2600);
  }

  // ---------------------------------------------------------------- interno

  #montar() {
    const { buscador, etiqueta } = this.#op;
    const placeholder = typeof buscador === "object" && buscador.placeholder ? buscador.placeholder : "Buscar…";
    this.#contenedor.classList.add("tabla");
    this.#contenedor.innerHTML = `
      ${buscador ? `
        <div class="tabla__barra">
          <label class="tabla__buscador">
            <i class="ri-search-line" aria-hidden="true"></i>
            <span class="solo-lector">Buscar en ${escapeHtml(etiqueta || "la tabla")}</span>
            <input type="search" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(this.#busqueda)}" autocomplete="off">
          </label>
        </div>` : ""}
      <div class="tabla__marco">
        <table class="tabla__tabla"${etiqueta ? ` aria-label="${escapeHtml(etiqueta)}"` : ""}>
          <thead><tr>${this.#cabeceras()}</tr></thead>
          <tbody></tbody>
        </table>
        <div class="tabla__estado" hidden></div>
      </div>
      <div class="tabla__pie">
        <p class="tabla__contador" aria-live="polite"></p>
        <div class="tabla__paginacion">
          ${this.#porPagina ? `
            <label class="tabla__por-pagina">
              <span class="solo-lector">Filas por página</span>
              <select>${POR_PAGINA.map((n) => `<option value="${n}"${n === this.#porPagina ? " selected" : ""}>${n} por página</option>`).join("")}</select>
            </label>
            <button type="button" class="boton boton--icono boton--fantasma" data-pagina="-1" aria-label="Página anterior"><i class="ri-arrow-left-s-line" aria-hidden="true"></i></button>
            <span class="tabla__pagina"></span>
            <button type="button" class="boton boton--icono boton--fantasma" data-pagina="1" aria-label="Página siguiente"><i class="ri-arrow-right-s-line" aria-hidden="true"></i></button>
          ` : ""}
        </div>
      </div>`;

    this.#contenedor.querySelector(".tabla__buscador input")?.addEventListener("input", (e) => {
      this.#busqueda = e.target.value;
      this.#pagina = 0;
      this.#pintar();
    });
    this.#contenedor.querySelector("thead").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-ordenar]");
      if (!boton) return;
      const clave = boton.dataset.ordenar;
      const dir = this.#orden?.clave === clave && this.#orden.dir === "asc" ? "desc" : "asc";
      this.ordenar(clave, dir);
    });
    this.#contenedor.querySelector(".tabla__por-pagina select")?.addEventListener("change", (e) => {
      this.#porPagina = Number(e.target.value);
      this.#pagina = 0;
      this.#pintar();
    });
    this.#contenedor.querySelector(".tabla__paginacion").addEventListener("click", (e) => {
      const boton = e.target.closest("[data-pagina]");
      if (!boton) return;
      this.#pagina += Number(boton.dataset.pagina);
      this.#pintar();
    });
  }

  #cabeceras() {
    const ths = this.#op.columnas.map((c) => {
      const clases = ["tabla__th", c.tipo === "numero" || c.tipo === "dinero" ? "tabla__th--fin" : ""].filter(Boolean).join(" ");
      if (c.ordenable === false) return `<th scope="col" class="${clases}">${escapeHtml(c.titulo)}</th>`;
      return `<th scope="col" class="${clases}" data-clave="${escapeHtml(c.clave)}" aria-sort="none">
          <button type="button" class="tabla__orden" data-ordenar="${escapeHtml(c.clave)}">${escapeHtml(c.titulo)}<i class="ri-arrow-up-down-line" aria-hidden="true"></i></button>
        </th>`;
    });
    if (this.#op.acciones) ths.push(`<th scope="col" class="tabla__th tabla__th--fin">Acciones</th>`);
    return ths.join("");
  }

  #estado(html, ocupado = false) {
    const estado = this.#contenedor.querySelector(".tabla__estado");
    this.#contenedor.querySelector("tbody").innerHTML = "";
    this.#contenedor.querySelector(".tabla__tabla").hidden = true;
    this.#contenedor.querySelector(".tabla__pie").hidden = true;
    estado.innerHTML = html;
    estado.hidden = false;
    this.#contenedor.setAttribute("aria-busy", String(ocupado));
  }

  #idDe(fila) {
    return this.#op.idFila ? this.#op.idFila(fila) : fila.id;
  }

  /** Texto visible de una celda sin HTML (para buscar). */
  #texto(col, fila) {
    if (col.texto) return col.texto(fila);
    const v = fila[col.clave];
    if (col.tipo === "fecha") return formatFecha(v);
    if (col.tipo === "dinero") return v == null || v === "" ? "" : euros(v);
    return v ?? "";
  }

  #celda(col, fila) {
    if (col.celda) return col.celda(fila);
    const v = fila[col.clave];
    if (v == null || v === "") return '<span class="tabla__nada">—</span>';
    if (col.tipo === "fecha") return escapeHtml(formatFecha(v)) || '<span class="tabla__nada">—</span>';
    if (col.tipo === "dinero") return escapeHtml(euros(v));
    if (col.tipo === "numero") return escapeHtml(numero(v));
    return escapeHtml(v);
  }

  #visibles() {
    const termino = normalizar(this.#busqueda.trim());
    let lista = this.#filtro ? this.#filas.filter(this.#filtro) : [...this.#filas];
    if (termino) {
      lista = lista.filter((fila) => {
        const partes = this.#op.columnas.map((c) => this.#texto(c, fila));
        if (this.#op.textoBusqueda) partes.push(this.#op.textoBusqueda(fila));
        return normalizar(partes.join(" ")).includes(termino);
      });
    }
    const col = this.#orden && this.#op.columnas.find((c) => c.clave === this.#orden.clave);
    if (col) {
      const signo = this.#orden.dir === "desc" ? -1 : 1;
      const valor = (f) => (col.valor ? col.valor(f) : f[col.clave]);
      const numerica = col.tipo === "numero" || col.tipo === "dinero";
      lista.sort((a, b) => {
        const va = valor(a), vb = valor(b);
        const vacioA = va == null || va === "", vacioB = vb == null || vb === "";
        if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1; // vacios al final
        const r = numerica ? Number(va) - Number(vb) : colador.compare(String(va), String(vb));
        return r * signo;
      });
    }
    return lista;
  }

  #pintar() {
    const tabla = this.#contenedor.querySelector(".tabla__tabla");
    const estado = this.#contenedor.querySelector(".tabla__estado");
    const pie = this.#contenedor.querySelector(".tabla__pie");
    this.#contenedor.setAttribute("aria-busy", "false");

    // Cabeceras: indicar el orden actual.
    this.#contenedor.querySelectorAll("th[data-clave]").forEach((th) => {
      const activa = this.#orden?.clave === th.dataset.clave;
      th.setAttribute("aria-sort", activa ? (this.#orden.dir === "asc" ? "ascending" : "descending") : "none");
      th.querySelector("i").className = activa
        ? (this.#orden.dir === "asc" ? "ri-arrow-up-line" : "ri-arrow-down-line")
        : "ri-arrow-up-down-line";
    });

    const visibles = this.#visibles();
    const total = visibles.length;
    this.#op.alPintar?.(visibles);
    if (!total) {
      const hayFiltro = this.#busqueda.trim() || this.#filtro;
      // La barra de busqueda sigue visible para poder corregir el filtro.
      this.#estado(`<p class="estado-vacio"><i class="ri-inbox-line" aria-hidden="true"></i>${escapeHtml(
        hayFiltro && this.#filas.length ? "Ningún resultado con ese filtro" : this.#op.vacio)}</p>`);
      return;
    }

    const paginas = this.#porPagina ? Math.ceil(total / this.#porPagina) : 1;
    this.#pagina = Math.min(Math.max(this.#pagina, 0), paginas - 1);
    const desde = this.#porPagina ? this.#pagina * this.#porPagina : 0;
    const hasta = this.#porPagina ? Math.min(desde + this.#porPagina, total) : total;

    this.#contenedor.querySelector("tbody").innerHTML = visibles.slice(desde, hasta).map((f) => this.#fila(f)).join("");
    tabla.hidden = false;
    estado.hidden = true;
    pie.hidden = false;

    const [uno, varios] = this.#op.registro;
    const deTotal = this.#filas.length !== total ? ` (de ${numero(this.#filas.length)})` : "";
    this.#contenedor.querySelector(".tabla__contador").textContent = this.#porPagina && paginas > 1
      ? `${numero(desde + 1)}–${numero(hasta)} de ${numero(total)} ${total === 1 ? uno : varios}${deTotal}`
      : `${numero(total)} ${total === 1 ? uno : varios}${deTotal}`;

    if (this.#porPagina) {
      this.#contenedor.querySelector(".tabla__pagina").textContent = `${this.#pagina + 1} / ${paginas}`;
      this.#contenedor.querySelector('[data-pagina="-1"]').disabled = this.#pagina === 0;
      this.#contenedor.querySelector('[data-pagina="1"]').disabled = this.#pagina >= paginas - 1;
      this.#contenedor.querySelector(".tabla__paginacion").classList.toggle("tabla__paginacion--una", paginas === 1);
    }
  }

  #fila(f) {
    const clase = this.#op.claseFila?.(f);
    const celdas = this.#op.columnas.map((c) => {
      const clases = ["tabla__celda",
        c.rol ? `tabla__celda--${c.rol}` : "",
        c.tipo === "numero" || c.tipo === "dinero" ? "tabla__celda--fin" : "",
        c.tipo === "fecha" ? "tabla__celda--fecha" : ""].filter(Boolean).join(" ");
      return `<td class="${clases}" data-titulo="${escapeHtml(c.titulo)}">${this.#celda(c, f)}</td>`;
    });
    if (this.#op.acciones) {
      celdas.push(`<td class="tabla__celda tabla__celda--acciones"><div class="tabla__acciones">${this.#op.acciones(f)}</div></td>`);
    }
    return `<tr class="tabla__fila${clase ? " " + clase : ""}" data-id="${escapeHtml(this.#idDe(f))}">${celdas.join("")}</tr>`;
  }
}
