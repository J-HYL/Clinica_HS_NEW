//datatables.js
import { formatTitle, formatFecha } from "../funciones.js";
import { escapeHtml } from "../html.js";
import { etiquetaEstado } from "./inventario.js";
import UI from "../classes/UI.js";

// Columnas cuyo valor es una fecha (se muestran como DD/MM/YYYY, pero se
// ordenan/filtran por el valor ISO crudo para mantener el orden cronológico).
const isDateColumn = key => key === "Alta" || key === "fecha" || key === "caducidad" || key.startsWith("fecha_");

export function createTableInstance(records) {
    let objectStore = "";
    // Obtenemos el nombre del archivo HTML actual de la URL
    const path = window.location.pathname;
    const fileName = path.substring(path.lastIndexOf('/') + 1); // Extrae 'clientes.html' o 'historia-clinica.html'

    if (fileName === "control.html") {
        if (path.includes("clientes")) objectStore = "clients";
        else if (path.includes("inventario")) objectStore = "inventario";
    } else if (fileName === "historia-clinica.html") {
        objectStore = "treatments";
    } else if (fileName === "tratamientos.html") {
        objectStore = "payments";

    }else if(fileName === "panel_facturas.php"){
        objectStore = "facturas";

    }

    if (records.length === 0) {
        UI.showRecordsNotFoundDiv()
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search') || '';

    const columns = Object.keys(records[0]).map(key => {
      const col = {
        title: formatTitle(key),
        data:  key
      };

      // render actual para estado:
      // (en inventario el estado no abre modal: es solo una etiqueta de situación)
      if (key === "estado" && objectStore === "inventario") {
        col.render = data => `
          <span class="table__tag table__tag--${escapeHtml(data)}">${escapeHtml(etiquetaEstado(data))}</span>`;
      }
      else if (key === "estado") {
        col.render = (data, _, row) => `
          <button
            class="table__status table__status--${data.toLowerCase()}"
            data-id="${row.id}"
            aria-label="Abrir modal para editar estado"
          >${data}</button>`;
      }
      // foto: miniatura del elemento (no se ordena ni se busca por ella)
      else if (key === "foto") {
        col.title = "Foto";
        col.orderable = false;
        col.searchable = false;
        col.render = (data, _, row) => data
          ? `<img src="/${escapeHtml(data)}" alt="Foto de ${escapeHtml(row.nombre)}" class="table__foto">`
          : `<span class="table__foto table__foto--vacia" aria-label="Sin foto"><i class="ri-camera-off-line"></i></span>`;
      }
      // stock: avisa cuando está en o por debajo del mínimo configurado
      else if (key === "stock") {
        col.render = (data, type, row) => {
          if (type !== "display") return data ?? 0;
          const cantidad = Number(data ?? 0);
          const bajo = cantidad <= Number(row.stock_minimo ?? 0);
          return `<span class="table__stock${bajo ? " table__stock--bajo" : ""}">${escapeHtml(cantidad)} ${escapeHtml(row.unidad || "ud")}${bajo ? ' <i class="ri-alert-fill" title="Stock bajo mínimo"></i>' : ""}</span>`;
        };
      }
      // columnas auxiliares: viajan en la fila para poder pintar el stock, pero no se muestran
      else if (key === "stock_minimo" || key === "unidad") {
        col.visible = false;
        col.searchable = false;
      }
      // este bloque para el Gabinete (se guarda como med1/med2, se muestra "Gabinete 1/2"):
      else if (key === "medico") {
        col.title = "Gabinete";
        const gabinetes = { med1: "Gabinete 1", med2: "Gabinete 2" };
        col.render = (data, _, row) => `
          <button
            class="table__medico"
            data-id="${row.id}"
            aria-label="Abrir modal para editar gabinete"
          >${gabinetes[data] || data || '—'}</button>`;
      }
      // columnas de fecha: mostrar DD/MM/YYYY, ordenar/filtrar por el ISO crudo
      else if (isDateColumn(key)) {
        col.render = (data, type) =>
          (type === "display" || type === "filter") ? formatFecha(data) : (data ?? "");
      }

      return col;
    });


    //Pushing the "Actions" column
    columns.push({
        title: 'Acciones',
        data: null,
        render: function(row) {
            let buttons = `
                <button class="table__btn table__btn--edit" data-id="${row.id}" aria-label="Editar Registro"><i class="ri-edit-box-fill"></i></button>
                <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
            `;
            
            if (objectStore === "clients") {
                buttons += `<button class="table__btn table__btn--extra" data-id="${row.id}" aria-label="Botón extra"><i class="ri-survey-fill"></i></i></button>`;
            }

            if (objectStore === "treatments") {
                buttons = `
                  <button class="table__btn table__btn--treatments" data-id="${row.id}" aria-label="Ver tratamiento"><i class="ri-eye-fill"></i></button>
                  <button class="table__btn table__btn--edit-treatment" data-id="${row.id}" aria-label="Editar tratamiento"><i class="ri-edit-box-fill"></i></button>
                  <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
                `;
            }

            if (objectStore === "payments") {
                buttons = `
                  <button class="table__btn table__btn--print" data-id="${row.id}" aria-label="Imprimir comprobante pago"><i class="ri-printer-fill"></i></button>
                  <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
                `;
              
            }

            if (objectStore === "inventario") {
                buttons = `
                  <button class="table__btn table__btn--stock" data-id="${row.id}" aria-label="Ajustar stock"><i class="ri-add-box-fill"></i></button>
                  <button class="table__btn table__btn--edit" data-id="${row.id}" aria-label="Editar Registro"><i class="ri-edit-box-fill"></i></button>
                  <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
                `;
            }

            if(objectStore === "facturas"){
              buttons= `
                  <a href="${row.ruta}" target="_blank" class="table__btn table__btn--print" aria-label="Descargar factura"> <i class="ri-download-2-line"></i></a>
              `;
            }

            return buttons;
        }
    });

    // Orden por defecto: si hay columna de fecha, ordenar por ella ascendente
    // (las más próximas primero). Si no, DataTables usa su orden por defecto.
    const dateColIndex = Object.keys(records[0]).findIndex(isDateColumn);
    const defaultOrder = dateColIndex >= 0 ? [[dateColIndex, "asc"]] : [];

    //Datatable Instancia
    const table = new DataTable('#table', {
        destroy: true,
        data: records,
        columns,
        order: defaultOrder,
        search: {
            search: searchQuery
        },
        pageLength: 10,
        lengthMenu: [5, 10, 20],
        responsive: true,
        columnDefs: [
          {
            targets: 0,    // id de la columna
            visible: false,
            searchable: false // ya no se busca por id
          }
        ],
        language: {
            "url": "/js/lib/datatables-spanish.json"
        },
    });

}