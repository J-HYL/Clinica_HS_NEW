//datatables.js
import { formatTitle, formatFecha } from "../funciones.js";
import UI from "../classes/UI.js";

// Columnas cuyo valor es una fecha (se muestran como DD/MM/YYYY, pero se
// ordenan/filtran por el valor ISO crudo para mantener el orden cronológico).
const isDateColumn = key => key === "Alta" || key === "fecha" || key.startsWith("fecha_");

export function createTableInstance(records, opts = {}) {
    // objectStore/tableSelector explícitos permiten DOS tablas en una misma página
    // (p.ej. el panel de Admin: facturas + pagos). Si no se pasan, se infiere por el
    // nombre del archivo (retrocompatible con los llamadores existentes).
    const tableSelector = opts.tableSelector || "#table";
    let objectStore = opts.objectStore || "";
    const path = window.location.pathname;
    if (!objectStore) {
        const fileName = path.substring(path.lastIndexOf('/') + 1);
        if (fileName === "control.html") {
            if (path.includes("clientes")) objectStore = "clients";
        } else if (fileName === "historia-clinica.html") {
            objectStore = "treatments";
        } else if (fileName === "tratamientos.html") {
            objectStore = "payments";
        } else if (fileName === "panel_facturas.php") {
            objectStore = "facturas";
        }
    }

    if (records.length === 0) {
        UI.showRecordsNotFoundDiv()
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const searchQuery = urlParams.get('search') || '';

    // factura_ruta viaja en los datos (para el botón de descarga) pero NO es una columna.
    const columns = Object.keys(records[0]).filter((key) => key !== "factura_ruta").map(key => {
      const col = {
        title: formatTitle(key),
        data:  key
      };

      // render actual para estado:
      if (key === "estado") {
        col.render = (data, _, row) => `
          <button
            class="table__status table__status--${data.toLowerCase()}"
            data-id="${row.id}"
            aria-label="Abrir modal para editar estado"
          >${data}</button>`;
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
      // estado de factura del pago: Emitida / Solicitada / — (solo en tabla de pagos)
      else if (key === "factura_estado") {
        col.title = "Factura";
        col.render = (data, type) => {
          if (type !== "display") return data ?? "";
          if (data === "generada")   return '<span class="fact-badge fact-badge--done">Emitida</span>';
          if (data === "solicitada") return '<span class="fact-badge fact-badge--wait">Solicitada</span>';
          return '<span class="fact-badge fact-badge--none">—</span>';
        };
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
                buttons += `<button class="table__btn table__btn--invite" data-id="${row.id}" aria-label="Invitar al portal del paciente"><i class="ri-mail-send-line"></i></button>`;
            }

            if (objectStore === "treatments") {
                buttons = `
                  <button class="table__btn table__btn--treatments" data-id="${row.id}" aria-label="Ver tratamiento"><i class="ri-eye-fill"></i></button>
                  <button class="table__btn table__btn--edit-treatment" data-id="${row.id}" aria-label="Editar tratamiento"><i class="ri-edit-box-fill"></i></button>
                  <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
                `;
            }

            if (objectStore === "payments") {
                // Si la factura de ese pago YA está emitida -> botón de descarga; si no -> generar.
                const facturaBtn = (row.factura_estado === "generada" && row.factura_ruta)
                  ? `<a class="table__btn table__btn--descargar" href="${row.factura_ruta}" target="_blank" rel="noopener" aria-label="Descargar factura"><i class="ri-download-2-line"></i></a>`
                  : `<button class="table__btn table__btn--factura" data-id="${row.id}" aria-label="Generar factura"><i class="ri-file-text-fill"></i></button>`;
                buttons = `
                  <button class="table__btn table__btn--print" data-id="${row.id}" aria-label="Imprimir comprobante pago"><i class="ri-printer-fill"></i></button>
                  ${facturaBtn}
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
    const table = new DataTable(tableSelector, {
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
        // Resalta las filas de pagos con una solicitud de factura pendiente.
        createdRow: (rowEl, data) => {
          if (data && data.factura_estado === "solicitada") rowEl.classList.add("row--factura");
        },
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