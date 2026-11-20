// presupuesto.js — Generar un presupuesto, como el editor de presupuestos de
// jhon2/gestion: datos (paciente, profesional, fecha, validez), lineas de
// tratamiento (LineasDocumento: catalogo con precio, pieza, cantidad,
// descuento por linea), notas y totales; despues la hoja A4 para imprimir o
// guardar en PDF desde el navegador.
//
// No se guarda en la BD (no hay tabla de presupuestos): se genera e imprime.
// Desde la ficha del paciente se llega con ?paciente=<id> y viene ya elegido.

import DB from "../../modules/classes/DB_API.js";
import { escapeHtml } from "../../modules/html.js";
import { euros, fechaISO, formatFecha, sumarDias } from "../../modules/formato.js";
import { obtenerSede } from "../../modules/components/AppShell.js";
import LineasDocumento from "../../modules/components/LineasDocumento.js";

const DIAS_VALIDEZ = 30;
const $ = (id) => document.getElementById(id);

const editor = $("editor");
const vista = $("vista");
const aviso = $("aviso");
const titulo = document.querySelector(".page-title");
const campoPaciente = $("paciente");

let pacientes = []; // de la BD, para el desplegable y el telefono de la hoja

const lineas = new LineasDocumento($("lineas"), { alCambiar: pintarTotales });

function pintarTotales({ subtotal, descuentos, total, valido }) {
  const poner = (clave, texto) => { document.querySelector(`[data-total="${clave}"]`).textContent = texto; };
  poner("subtotal", valido ? euros(subtotal) : "—");
  poner("descuentos", `−${euros(descuentos)}`);
  poner("total", valido ? euros(total) : "—");
  document.querySelector('[data-fila="descuentos"]').hidden = !(valido && descuentos > 0);
}

function reiniciar() {
  const hoy = fechaISO();
  $("fecha").value = hoy;
  $("valido").value = sumarDias(hoy, DIAS_VALIDEZ);
  $("notas").value = "";
  campoPaciente.value = "";
  campoPaciente.classList.remove("error");
  aviso.textContent = "";
  lineas.vaciar();
}

async function cargarDatos() {
  const [servicios, clientes] = await Promise.all([
    DB.getRecords("services").catch(() => []),
    DB.getRecords("clients").catch(() => []),
  ]);
  lineas.cargarCatalogo(servicios.map((s) => ({ id: s.id, nombre: s.nombre, precio: Number(s.precio) || 0 })));
  pacientes = clientes;
  $("lista-pacientes").innerHTML = clientes
    .map((c) => `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.telefono || "")}</option>`)
    .join("");

  const id = new URLSearchParams(location.search).get("paciente");
  const elegido = id && clientes.find((c) => String(c.id) === id);
  if (elegido) campoPaciente.value = elegido.nombre;
}

/** Paciente escrito: si coincide con uno de la BD, con su telefono. */
function pacienteActual() {
  const nombre = campoPaciente.value.trim();
  const dePaciente = pacientes.find((p) => p.nombre.trim().toLowerCase() === nombre.toLowerCase());
  return { nombre, telefono: dePaciente?.telefono || "" };
}

function validar() {
  const errores = [];
  const sinPaciente = !campoPaciente.value.trim();
  campoPaciente.classList.toggle("error", sinPaciente);
  if (sinPaciente) errores.push("Escribe el nombre del paciente.");
  errores.push(...lineas.errores());
  if ($("valido").value && $("valido").value < $("fecha").value) errores.push("«Válido hasta» no puede ser anterior a la fecha.");
  aviso.textContent = errores.join(" ");
  return !errores.length;
}

// ---------------------------------------------------------------- hoja A4

async function hojaHtml() {
  const sede = (await obtenerSede()) || {};
  const paciente = pacienteActual();
  const filas = lineas.lineas;
  const { subtotal, descuentos, total } = lineas.totales;
  const fecha = $("fecha").value;
  const valido = $("valido").value;
  const notas = $("notas").value.trim();
  const conDescuento = filas.some((l) => l.descuento > 0);

  // Piezas del plan resaltadas en el odontograma (componente unico window.Odontograma).
  const piezas = new Set(filas.flatMap((l) => l.pieza.split(/[\s,;]+/).filter(Boolean)));
  const odontograma = piezas.size && window.Odontograma
    ? `<div class="papel__odontograma">${window.Odontograma.svg(piezas)}<p class="papel__etiqueta">Odontograma · piezas del plan resaltadas</p></div>`
    : "";

  const dato = (etiqueta, valor) => `<div><p class="papel__etiqueta">${etiqueta}</p><p class="papel__dato">${escapeHtml(valor)}</p></div>`;
  const piezasDe = (texto) => texto.split(/[\s,;]+/).filter(Boolean).map((p) => `<span class="papel__pieza">${escapeHtml(p)}</span>`).join(" ");

  return `
    <header class="papel__membrete">
      <div class="papel__marca">
        <img class="papel__logo" src="/assets/images/logoCompleto.svg" alt="HS Dental">
        <p class="papel__clinica">
          <strong>${escapeHtml(sede.nombre || "HS Dental")}</strong>
          ${sede.nif ? `NIF ${escapeHtml(sede.nif)}<br>` : ""}
          ${escapeHtml(sede.direccion || "")}<br>
          ${sede.telefono ? `Tel. ${escapeHtml(sede.telefono)}` : ""}${sede.email ? ` · ${escapeHtml(sede.email)}` : ""}
        </p>
      </div>
      <div>
        <h2 class="papel__titulo">Presupuesto</h2>
        <p class="papel__subtitulo">${escapeHtml(formatFecha(fecha))}</p>
      </div>
    </header>

    <section class="papel__panel">
      <div>
        <p class="papel__etiqueta">Paciente</p>
        <p class="papel__nombre">${escapeHtml(paciente.nombre)}</p>
        ${paciente.telefono ? `<p class="papel__suave">Tel. ${escapeHtml(paciente.telefono)}</p>` : ""}
      </div>
      <div class="papel__datos">
        ${dato("Fecha", formatFecha(fecha))}
        ${dato("Válido hasta", valido ? formatFecha(valido) : "—")}
        ${dato("Profesional", $("profesional").value)}
      </div>
    </section>

    ${odontograma}

    <h3 class="papel__seccion">Plan de tratamiento</h3>
    <table class="papel__tabla">
      <thead>
        <tr>
          <th>Tratamiento</th>
          <th>Pieza</th>
          <th class="papel__num">Cant.</th>
          <th class="papel__num">Precio</th>
          ${conDescuento ? '<th class="papel__num">Dto.</th>' : ""}
          <th class="papel__num">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${filas.map((l) => `
          <tr>
            <td>${escapeHtml(l.descripcion)}</td>
            <td>${piezasDe(l.pieza)}</td>
            <td class="papel__num">${escapeHtml(String(l.cantidad).replace(".", ","))}</td>
            <td class="papel__num">${euros(l.precio)}</td>
            ${conDescuento ? `<td class="papel__num">${l.descuento ? `${escapeHtml(String(l.descuento).replace(".", ","))} %` : ""}</td>` : ""}
            <td class="papel__num"><strong>${euros(l.importe)}</strong></td>
          </tr>`).join("")}
      </tbody>
    </table>

    <section class="papel__totales">
      <div>
        ${notas ? `<p class="papel__etiqueta">Observaciones</p><p class="papel__notas">${escapeHtml(notas)}</p>` : ""}
      </div>
      <div>
        <dl class="papel__desglose">
          <dt>Subtotal</dt><dd>${euros(subtotal)}</dd>
          ${descuentos > 0 ? `<dt>Descuentos</dt><dd>−${euros(descuentos)}</dd>` : ""}
          <dt>IVA</dt><dd>Exento</dd>
        </dl>
        <p class="papel__total"><span>Total del tratamiento</span><span>${euros(total)}</span></p>
      </div>
    </section>

    <section class="papel__legal">
      <p>Asistencia sanitaria exenta de IVA según el artículo 20.Uno.3.º de la Ley 37/1992.</p>
      <p>Presupuesto orientativo, válido hasta la fecha indicada. El plan puede cambiar si durante el tratamiento
        aparecen hallazgos que no se podían prever en el diagnóstico; cualquier cambio se le explicará y
        presupuestará antes de hacerlo.</p>
    </section>

    <section class="papel__firma">
      <p class="papel__firma-titulo">Conformidad del paciente</p>
      <p class="papel__firma-texto">Acepto el presupuesto y el plan de tratamiento descritos.</p>
      <div class="papel__lineas-firma">
        <p>Firma del paciente o tutor</p>
        <p>Fecha</p>
      </div>
    </section>

    <footer class="papel__pie">
      <p>${sede.telefono ? `Si tiene cualquier duda sobre el presupuesto, llámenos al ${escapeHtml(sede.telefono)}.` : ""}</p>
      <p>hsdental.es</p>
    </footer>`;
}

function verEditor() {
  vista.hidden = true;
  editor.hidden = false;
  titulo.textContent = "Nuevo presupuesto";
}

// ---------------------------------------------------------------- eventos

editor.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!validar()) return;
  $("papel").innerHTML = await hojaHtml();
  editor.hidden = true;
  vista.hidden = false;
  titulo.textContent = "Presupuesto";
  window.scrollTo({ top: 0 });
});

campoPaciente.addEventListener("input", () => campoPaciente.classList.remove("error"));
$("limpiar").addEventListener("click", reiniciar);
$("editar").addEventListener("click", verEditor);
$("imprimir").addEventListener("click", () => {
  // El titulo de la pagina es el nombre que propone el navegador al guardar en PDF.
  const anterior = document.title;
  document.title = `Presupuesto ${pacienteActual().nombre} ${formatFecha($("fecha").value).replaceAll("/", "-")}`;
  window.print();
  document.title = anterior;
});

reiniciar();
cargarDatos();
