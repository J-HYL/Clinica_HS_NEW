//datatables.js
import { formatTitle } from "../funciones.js";
import UI from "../classes/UI.js";

export function createTableInstance(records) {
    let objectStore = "";
    // Obtenemos el nombre del archivo HTML actual de la URL
    const path = window.location.pathname;
    const fileName = path.substring(path.lastIndexOf('/') + 1); // Extrae 'clientes.html' o 'historia-clinica.html'

    if (fileName === "control.html") {
        path.includes("clientes") ? objectStore = "clients" : "";
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
      if (key === "estado") {
        col.render = (data, _, row) => `
          <button
            class="table__status table__status--${data.toLowerCase()}"
            data-id="${row.id}"
            aria-label="Abrir modal para editar estado"
          >${data}</button>`;
      }
      // este bloque para Médico:
      else if (key === "medico") {
        col.render = (data, _, row) => `
          <button
            class="table__medico"
            data-id="${row.id}"
            aria-label="Abrir modal para editar médico"
          >${data || '—'}</button>`;
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
                  <button class="table__btn table__btn--treatments" data-id="${row.id}" aria-label="Botón tratamientos"><i class="ri-eye-fill"></i></button>
                  <button class="table__btn table__btn--delete" data-id="${row.id}" aria-label="Eliminar Registro"><i class="ri-delete-bin-fill"></i></button>
                `;
            }

            if (objectStore === "payments") {
                buttons = `
                  <button class="table__btn table__btn--print" data-id="${row.id}" aria-label="Imprimir comprobante pago"><i class="ri-printer-fill"></i></button>
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

    //Datatable Instancia
    const table = new DataTable('#table', {
        destroy: true,
        data: records,
        columns,
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