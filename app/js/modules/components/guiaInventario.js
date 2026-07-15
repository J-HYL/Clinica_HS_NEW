// modules/components/guiaInventario.js
// Contenido de la guia "¿Cómo funciona?" del inventario: los esquemas de cada
// pantalla y los pasos. El motor que los pinta es ComoFunciona.js.
//
// Los esquemas son dibujos esquematicos de la pantalla (bloques), no capturas:
// se entienden igual con el inventario vacio y no hay que rehacerlos cada vez
// que se mueve algo del HTML. Lo unico que hay que mantener a la par con la
// pantalla real es la POSICION RELATIVA de los bloques, para que se reconozca.
//
// Cada parte resaltable es un <g class="zona" data-zona="X">. Los <g> que no
// resalta ningun paso NO deben ser zonas (quedarian atenuados para siempre):
// para eso estan las clases 'bloque' (relleno de contexto) y 'lienzo' (fondo).
// Los colores salen del CSS (app/css/pages/inventario.css), no de aqui.

// Filas de la tabla del esquema: se generan para no repetir el mismo SVG 3 veces.
const filasTabla = [108, 146, 184].map((y, i) => `
    <rect class="bloque bloque--fila" x="42" y="${y}" width="350" height="34" rx="6"/>
    <rect class="bloque" x="50" y="${y + 9}" width="16" height="16" rx="4"/>
    <rect class="bloque bloque--texto" x="74" y="${y + 11}" width="70" height="5" rx="2"/>
    <rect class="bloque bloque--texto" x="74" y="${y + 21}" width="46" height="4" rx="2"/>
    <g class="zona" data-zona="stock">
        <rect class="${i === 0 ? "alerta" : ""}" x="190" y="${y + 12}" width="34" height="10" rx="3"/>
    </g>
    <rect class="bloque" x="240" y="${y + 12}" width="34" height="10" rx="3"/>
    <g class="zona" data-zona="acciones">
        <circle cx="330" cy="${y + 17}" r="7"/>
        <circle cx="352" cy="${y + 17}" r="7"/>
        <circle cx="374" cy="${y + 17}" r="7"/>
    </g>
`).join("");

const VISTA_CONTROL = `
<svg viewBox="0 0 400 250" class="guia__svg" role="img" aria-label="Esquema de la pantalla de inventario: barra lateral, título con los botones de escanear y crear, filtros y la tabla de elementos">
    <rect class="lienzo" x="0" y="0" width="400" height="250" rx="10"/>
    <rect class="bloque" x="8" y="8" width="26" height="234" rx="6"/>
    <rect class="bloque" x="42" y="8" width="350" height="20" rx="6"/>

    <rect class="bloque" x="42" y="40" width="80" height="10" rx="4"/>
    <circle class="bloque" cx="134" cy="45" r="7"/>

    <g class="zona" data-zona="escanear"><circle cx="356" cy="45" r="11"/></g>
    <g class="zona" data-zona="crear"><circle cx="384" cy="45" r="11"/></g>

    <g class="zona" data-zona="filtros">
        <rect x="42" y="64" width="110" height="14" rx="5"/>
        <rect x="160" y="66" width="10" height="10" rx="2"/>
        <rect x="176" y="69" width="44" height="4" rx="2"/>
    </g>

    <rect class="bloque" x="42" y="90" width="350" height="12" rx="4"/>
    ${filasTabla}
</svg>`;

const VISTA_MODAL_STOCK = `
<svg viewBox="0 0 400 250" class="guia__svg" role="img" aria-label="Esquema del modal de stock: foto y nombre del elemento, los botones menos y más con la cantidad, los atajos y el botón de guardar">
    <rect class="lienzo" x="0" y="0" width="400" height="250" rx="10"/>
    <rect class="velo" x="0" y="0" width="400" height="250" rx="10"/>
    <rect class="tarjeta" x="56" y="20" width="288" height="210" rx="12"/>

    <rect class="bloque" x="72" y="38" width="34" height="34" rx="6"/>
    <rect class="bloque bloque--texto" x="116" y="44" width="96" height="6" rx="3"/>
    <rect class="bloque bloque--texto" x="116" y="58" width="62" height="5" rx="2"/>

    <rect class="bloque bloque--texto" x="72" y="88" width="76" height="5" rx="2"/>

    <g class="zona" data-zona="stepper">
        <rect x="72" y="102" width="40" height="34" rx="8"/>
        <rect x="118" y="102" width="164" height="34" rx="8"/>
        <rect x="288" y="102" width="40" height="34" rx="8"/>
    </g>

    <g class="zona" data-zona="rapidos">
        <rect x="72" y="146" width="58" height="16" rx="5"/>
        <rect x="136" y="146" width="58" height="16" rx="5"/>
        <rect x="200" y="146" width="58" height="16" rx="5"/>
        <rect x="264" y="146" width="64" height="16" rx="5"/>
    </g>

    <rect class="bloque bloque--texto" x="150" y="174" width="100" height="6" rx="3"/>

    <g class="zona" data-zona="guardar"><rect x="72" y="192" width="122" height="22" rx="8"/></g>
    <rect class="bloque" x="206" y="192" width="122" height="22" rx="8"/>
</svg>`;

const VISTA_FORMULARIO = `
<svg viewBox="0 0 400 250" class="guia__svg" role="img" aria-label="Esquema de la ficha de un elemento: foto, código con sus botones, vista previa del QR, campos de stock y botón de guardar">
    <rect class="lienzo" x="0" y="0" width="400" height="250" rx="10"/>
    <rect class="bloque" x="8" y="8" width="26" height="234" rx="6"/>
    <rect class="bloque" x="42" y="8" width="350" height="20" rx="6"/>
    <rect class="bloque" x="42" y="40" width="80" height="10" rx="4"/>
    <circle class="bloque" cx="134" cy="45" r="7"/>

    <g class="zona" data-zona="foto">
        <rect x="42" y="58" width="48" height="48" rx="8"/>
        <rect x="98" y="62" width="56" height="16" rx="5"/>
        <rect x="98" y="84" width="56" height="16" rx="5"/>
    </g>

    <rect class="bloque" x="42" y="116" width="150" height="16" rx="5"/>

    <g class="zona" data-zona="codigo">
        <rect x="42" y="140" width="150" height="16" rx="5"/>
        <rect x="200" y="140" width="52" height="16" rx="5"/>
        <rect x="258" y="140" width="76" height="16" rx="5"/>
        <rect x="340" y="140" width="52" height="16" rx="5"/>
    </g>

    <g class="zona" data-zona="qr"><rect x="42" y="164" width="46" height="46" rx="4"/></g>

    <g class="zona" data-zona="stock">
        <rect x="98" y="164" width="58" height="16" rx="5"/>
        <rect x="162" y="164" width="58" height="16" rx="5"/>
        <rect x="226" y="164" width="42" height="16" rx="5"/>
    </g>

    <g class="zona" data-zona="guardar"><rect x="42" y="220" width="94" height="20" rx="8"/></g>
    <rect class="bloque" x="144" y="220" width="64" height="20" rx="8"/>
</svg>`;

export const GUIA_CONTROL = {
    titulo: "Cómo funciona el inventario",
    vistas: { control: VISTA_CONTROL, modalStock: VISTA_MODAL_STOCK },
    pasos: [
        {
            vista: "control",
            zona: "escanear",
            titulo: "Escanea el elemento",
            texto: "Pulsa Escanear (en el móvil, el botón redondo de abajo a la derecha) y apunta la cámara al código de barras o al QR del producto. Si usas una pistola lectora, basta con dispararle: no hace falta tocar la pantalla. También puedes escribir el código a mano."
        },
        {
            vista: "modalStock",
            zona: "stepper",
            titulo: "Sube o baja la cantidad",
            texto: "Al leer el código se abre el elemento con su foto y su stock. Usa − y + para ir de una en una, o escribe el número directamente. Ojo: el número es cómo queda el stock, no lo que sumas."
        },
        {
            vista: "modalStock",
            zona: "rapidos",
            titulo: "Atajos para muchas unidades",
            texto: "Si has gastado o repuesto varias de golpe, los botones de ±5 van más rápido que pulsar + cinco veces."
        },
        {
            vista: "modalStock",
            zona: "guardar",
            titulo: "Guarda y listo",
            texto: "Antes de guardar verás el cambio resumido (por ejemplo 8 → 15) y un aviso si el elemento queda bajo mínimo. Si no has cambiado nada, el botón no se activa."
        },
        {
            vista: "control",
            zona: "acciones",
            titulo: "Sin escáner también",
            texto: "Cada fila tiene los mismos botones a mano: el + abre esa misma pantalla de cantidad, el lápiz abre la ficha completa y la papelera borra el elemento."
        },
        {
            vista: "control",
            zona: "stock",
            titulo: "Lo que se está acabando",
            texto: "El stock se marca en rojo cuando llega al mínimo que le pusiste al elemento. Es el aviso de que toca pedir más."
        },
        {
            vista: "control",
            zona: "filtros",
            titulo: "Encuentra lo que buscas",
            texto: "Filtra por categoría, o marca «Solo bajo mínimo» para ver de un vistazo todo lo que hay que reponer. El buscador de la tabla busca por nombre o ubicación."
        },
        {
            vista: "control",
            zona: "crear",
            titulo: "Dar de alta un elemento",
            texto: "Con este botón creas un elemento nuevo: su foto, su código, dónde está y cuántas unidades tienes."
        }
    ]
};

export const GUIA_FORMULARIO = {
    titulo: "Cómo rellenar la ficha",
    vistas: { formulario: VISTA_FORMULARIO },
    pasos: [
        {
            vista: "formulario",
            zona: "foto",
            titulo: "Hazle una foto",
            texto: "Con «Hacer foto» usas la cámara del móvil o del ordenador; con «Subir imagen» eliges un archivo. Se ve en la lista, y es la forma más rápida de reconocer el elemento."
        },
        {
            vista: "formulario",
            zona: "codigo",
            titulo: "Dale un código",
            texto: "Si el producto trae código de barras, pulsa Escanear y léelo: a partir de ahí ese código abre este elemento. Un código solo puede estar en un elemento."
        },
        {
            vista: "formulario",
            zona: "qr",
            titulo: "¿No trae código?",
            texto: "Pulsa «Generar QR propio» y se inventa uno para este elemento. Con «Imprimir etiqueta» sacas el QR con su nombre para recortarlo y pegarlo en el bote, el cajón o el aparato."
        },
        {
            vista: "formulario",
            zona: "stock",
            titulo: "Stock y mínimo",
            texto: "El stock es lo que tienes ahora. El mínimo es el punto en el que quieres que te avise: cuando el stock lo alcance, saldrá en rojo en la lista."
        },
        {
            vista: "formulario",
            zona: "guardar",
            titulo: "Guardar",
            texto: "Solo el nombre y las cantidades son obligatorios: lo demás (marca, proveedor, caducidad, notas) puedes rellenarlo cuando lo necesites."
        }
    ]
};
