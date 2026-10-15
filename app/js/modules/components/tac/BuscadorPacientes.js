// modules/components/tac/BuscadorPacientes.js
// Buscar un paciente (por nombre o teléfono) y elegirlo. Lo usan el modal
// "Añadir TAC" y el de "Asignar paciente": mismo componente en los dos.
// La lista de pacientes se trae una vez por página y se filtra en memoria.

import DB from "../../classes/DB_API.js";
import { escapeHtml } from "../../html.js";
import { normalizar } from "./utilidades.js";

const MAXIMO_RESULTADOS = 8;
let pacientes = null;   // caché compartida por todos los buscadores de la página

/**
 * @param {HTMLElement} contenedor
 * @param {{ idEntrada: string, alElegir?: (paciente|null) => void }} opciones
 *   idEntrada: id del <input>, para que el <label> de fuera apunte a él.
 */
export function crearBuscadorPacientes(contenedor, { idEntrada, alElegir }) {
    contenedor.innerHTML = `
        <div class="tac-paciente" data-elegido hidden>
            <i class="ri-user-3-line"></i>
            <span class="tac-paciente__nombre"></span>
            <button type="button" class="tac-enlace" data-cambiar>Cambiar</button>
        </div>
        <div data-buscador>
            <input type="search" id="${escapeHtml(idEntrada)}" class="form__input" placeholder="Buscar por nombre o teléfono" autocomplete="off">
            <ul class="tac-buscador__resultados" data-resultados></ul>
            <p class="tac-error" data-error hidden></p>
        </div>`;

    const entrada = contenedor.querySelector("input");
    const resultados = contenedor.querySelector("[data-resultados]");
    let elegido = null;
    let bloqueado = false;

    function pintarResultados() {
        const texto = normalizar(entrada.value.trim());
        if (!pacientes || !texto) {
            resultados.innerHTML = "";
            return;
        }
        // Por palabras y en cualquier orden: "Pérez García, Juan" encuentra a "Juan Pérez García".
        const palabras = texto.split(/[^a-z0-9ñ]+/).filter(Boolean);
        const encontrados = pacientes
            .filter(p => {
                const nombre = normalizar(p.nombre);
                return palabras.every(palabra => nombre.includes(palabra)) || String(p.telefono ?? "").includes(texto);
            })
            .slice(0, MAXIMO_RESULTADOS);

        resultados.innerHTML = encontrados.length
            ? encontrados.map(p => `
                <li>
                    <button type="button" class="tac-buscador__opcion" data-id="${escapeHtml(p.id)}">
                        <span>${escapeHtml(p.nombre)}</span>
                        <small>${escapeHtml(p.telefono || "")}</small>
                    </button>
                </li>`).join("")
            : `<li class="tac-buscador__vacio">Ningún paciente coincide con la búsqueda.</li>`;
    }

    function elegir(paciente) {
        elegido = paciente ? { id: paciente.id, nombre: paciente.nombre } : null;
        contenedor.querySelector(".tac-paciente__nombre").textContent = paciente?.nombre ?? "";
        contenedor.querySelector("[data-elegido]").hidden = !paciente;
        contenedor.querySelector("[data-buscador]").hidden = !!paciente;
        alElegir?.(elegido);
    }

    entrada.addEventListener("input", pintarResultados);
    resultados.addEventListener("click", (e) => {
        const opcion = e.target.closest("[data-id]");
        if (opcion) elegir(pacientes.find(p => String(p.id) === opcion.dataset.id));
    });
    contenedor.querySelector("[data-cambiar]").addEventListener("click", () => {
        if (bloqueado) return;
        elegir(null);
        entrada.value = "";
        pintarResultados();
        entrada.focus();
    });

    if (!pacientes) {
        DB.getRecords("clients")
            .then(lista => { pacientes = lista; pintarResultados(); })
            .catch(error => {
                const aviso = contenedor.querySelector("[data-error]");
                aviso.textContent = `No se pudo cargar la lista de pacientes: ${error.message}`;
                aviso.hidden = false;
            });
    }

    return {
        get paciente() { return elegido; },
        reiniciar() {
            entrada.value = "";
            pintarResultados();
            elegir(null);
        },
        enfocar() { entrada.focus(); },
        bloquear(si) { bloqueado = si; },
        /** Deja escrita una búsqueda (p. ej. el nombre que indicó el centro). */
        buscar(texto) {
            entrada.value = texto ?? "";
            pintarResultados();
        },
    };
}
