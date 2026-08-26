# 📦 Instalación de Flowbite en HS Dental

## ✅ ¿Qué se instaló?

Se han agregado **tres dependencias por CDN** al proyecto:

1. **Tailwind CSS** (v3) — Framework de CSS utilizado (carga desde `cdn.tailwindcss.com`)
2. **Flowbite CSS** (v2.5.2) — Estilos de componentes UI (carga desde jsdelivr)
3. **Flowbite JS** (v2.5.2) — JavaScript para interactividad (modales, dropdowns, etc.)

**Archivos modificados:**
- `app/index.html` — Agregados los 3 CDNs en `<head>` y antes de `</body>`
- `app/css/flowbite-config.css` — Archivo de referencia (vacío, para futuro uso)

---

## 📍 Dónde está instalado

```
app/index.html
  └─ <head>
      ├─ <script src="https://cdn.tailwindcss.com"></script>          (Tailwind)
      └─ <link href="...flowbite@2.5.2/dist/flowbite.min.css" ...>  (Flowbite CSS)
  
  └─ </body>
      └─ <script src="...flowbite@2.5.2/dist/flowbite.min.js"></script> (Flowbite JS)
```

---

## ⚡ ¿Se activa solo?

**NO.** Flowbite **NO se activa automáticamente con un prompt**. Funciona así:

1. **Cargas los CDNs** ✅ (ya hecho en `index.html`)
2. **Usas las clases HTML de Flowbite** en tu código (ej. `class="modal"`, `class="dropdown"`)
3. **El JavaScript de Flowbite detecta esas clases** y activa la interactividad

**Ejemplo:** Para un modal, escribes en HTML:
```html
<!-- Botón que abre el modal -->
<button data-modal-target="defaultModal" data-modal-toggle="defaultModal" 
        class="block text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5">
    Abrir Modal
</button>

<!-- El modal -->
<div id="defaultModal" tabindex="-1" class="hidden overflow-y-auto overflow-x-hidden fixed top-0 left-0 z-50 w-full md:inset-0 h-modal md:h-full bg-gray-900 bg-opacity-50">
    <div class="relative p-4 w-full max-w-2xl h-full md:h-auto">
        <div class="relative bg-white rounded-lg shadow">
            <h3 class="text-lg font-semibold">Título del Modal</h3>
            <p>Contenido aquí...</p>
        </div>
    </div>
</div>
```

El JavaScript de Flowbite ve el atributo `data-modal-toggle` y **automáticamente activa** la funcionalidad de abrir/cerrar.

---

## 🚀 Cómo usarlo

### **Opción 1: Copiar componentes de Flowbite**

Visita [flowbite.com/docs](https://flowbite.com/docs/) y copia el HTML de cualquier componente. Por ejemplo:

**Navbar:**
```html
<nav class="bg-white border-gray-200 px-4 lg:px-6 py-2.5">
    <div class="flex flex-wrap justify-between items-center">
        <a href="#" class="flex items-center">
            <span class="self-center text-2xl font-semibold whitespace-nowrap">Logo</span>
        </a>
    </div>
</nav>
```

**Botón:**
```html
<button class="bg-blue-700 text-white px-4 py-2 rounded-lg hover:bg-blue-800">
    Click aquí
</button>
```

### **Opción 2: Usar Tailwind CSS directamente**

Los estilos también vienen del framework Tailwind que se cargó. Puedes escribir:

```html
<div class="bg-blue-500 text-white p-4 rounded-lg shadow-lg">
    Contenido con estilos Tailwind
</div>
```

### **Opción 3: Componentes interactivos**

Para cosas como modales, dropdowns, tabs, carruseles, etc., **copia el HTML exacto de Flowbite** porque el JavaScript necesita atributos específicos como `data-modal-toggle`, `data-dropdown-toggle`, etc.

---

## 📋 Componentes disponibles en Flowbite

Algunos de los más útiles:

| Componente | Uso |
|-----------|-----|
| **Modal** | Diálogos, confirmaciones |
| **Dropdown** | Menús desplegables |
| **Navbar** | Barra de navegación |
| **Card** | Tarjetas de contenido |
| **Alert** | Alertas y notificaciones |
| **Accordion** | Contenido colapsable |
| **Tabs** | Pestañas |
| **Carousel** | Carrusel de imágenes |
| **Tooltip** | Información al pasar el ratón |
| **Toast** | Notificaciones flotantes |
| **Button** | Botones estilizados |
| **Input** | Campos de formulario |
| **Badge** | Etiquetas pequeñas |
| **Table** | Tablas estilizadas |

Todos están en [flowbite.com/docs/components](https://flowbite.com/docs/components/)

---

## ⚠️ Cuidados importantes

### **1. No rompe los estilos actuales**
- Los estilos CSS de HS Dental siguen funcionando igual
- Flowbite se suma, no reemplaza
- Si hay conflicto de clases, **Tailwind tiene prioridad** (cargado después)

### **2. Tailwind por CDN es menos eficiente**
- No purga CSS no usado (el archivo es ~100KB)
- Si en el futuro necesitas optimizar, migrar a **build Tailwind** (npm + bundler)
- Por ahora está bien para desarrollo

### **3. Compatible con tus librerías actuales**
✅ RemixIcon — sigue funcionando  
✅ SweetAlert2 — sigue funcionando  
✅ DataTables — sigue funcionando  
✅ Tu JavaScript vanilla — sigue funcionando  

### **4. Cuidado con las clases CSS**
- Si usas una clase como `hidden`, `block`, `flex` en tu CSS custom, Tailwind también las tiene
- Revisa los conflictos en inspector (F12) si algo se ve raro

---

## 🔧 Cómo agregar a otras páginas

Si quieres usar Flowbite en otras páginas HTML (ej. `control.html`, `tratamientos.html`, etc.):

1. Abre la página HTML
2. Agrega en el `<head>`:
```html
<!-- Tailwind CSS CDN -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Flowbite CSS CDN -->
<link href="https://cdn.jsdelivr.net/npm/flowbite@2.5.2/dist/flowbite.min.css" rel="stylesheet" />
```

3. Agrega antes de `</body>`:
```html
<!-- Flowbite JS CDN -->
<script src="https://cdn.jsdelivr.net/npm/flowbite@2.5.2/dist/flowbite.min.js"></script>
```

---

## 🎯 Ejemplo práctico: Modal en HS Dental

Si quieres reemplazar los `<dialog>` actuales de HS Dental por modales de Flowbite:

**Actual (HTML nativo):**
```html
<dialog id="myDialog">...</dialog>
<button onclick="document.getElementById('myDialog').showModal()">Abrir</button>
```

**Con Flowbite:**
```html
<!-- Botón -->
<button data-modal-target="myFlowbiteModal" data-modal-toggle="myFlowbiteModal" 
        class="block text-white bg-blue-700 hover:bg-blue-800 px-5 py-2.5 rounded-lg">
    Abrir
</button>

<!-- Modal -->
<div id="myFlowbiteModal" tabindex="-1" class="hidden overflow-y-auto overflow-x-hidden fixed top-0 left-0 z-50 w-full md:inset-0 h-modal md:h-full bg-gray-900 bg-opacity-50">
    <div class="relative p-4 w-full max-w-2xl h-full md:h-auto mx-auto">
        <div class="relative bg-white rounded-lg shadow">
            <!-- Modal header -->
            <div class="flex justify-between items-start p-4 rounded-t border-b">
                <h3 class="text-xl font-semibold">Título</h3>
                <button type="button" class="text-gray-400 bg-transparent hover:bg-gray-200 hover:text-gray-900 rounded-lg text-sm p-1.5 ml-auto" 
                        data-modal-toggle="myFlowbiteModal">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/></svg>
                </button>
            </div>
            <!-- Modal body -->
            <div class="p-6 space-y-6">
                <p>Contenido del modal...</p>
            </div>
            <!-- Modal footer -->
            <div class="flex items-center p-6 space-x-2 rounded-b border-t border-gray-200">
                <button data-modal-toggle="myFlowbiteModal" class="text-gray-500 bg-white hover:bg-gray-100 focus:ring-4 focus:outline-none focus:ring-blue-300 rounded-lg border border-gray-200 px-5 py-2.5 hover:text-gray-900">
                    Cerrar
                </button>
                <button class="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center">
                    Guardar
                </button>
            </div>
        </div>
    </div>
</div>
```

**NO necesitas JavaScript extra.** Flowbite ve `data-modal-toggle` y activa automáticamente.

---

## 📚 Documentación y recursos

- **Flowbite Docs:** https://flowbite.com/docs/
- **Tailwind Docs:** https://tailwindcss.com/docs
- **Flowbite Icons:** https://flowbite.com/icons/ (complementa RemixIcon)

---

## ✨ Resumen rápido

| Pregunta | Respuesta |
|----------|-----------|
| ¿Se instaló algo? | Sí, 3 CDNs (Tailwind + Flowbite CSS/JS) |
| ¿Se activó automáticamente? | No, necesitas usar las clases de Flowbite en HTML |
| ¿Rompe lo actual? | No, es aditivo |
| ¿Dónde se instaló? | En `app/index.html` (y donde tú agregues) |
| ¿Cómo lo uso? | Copia HTML de [flowbite.com/docs](https://flowbite.com/docs) |
| ¿Necesito escribir JavaScript? | No, Flowbite maneja la interactividad automáticamente |

---

**Listo para usar. Copia y pega componentes de Flowbite donde los necesites.** 🚀
