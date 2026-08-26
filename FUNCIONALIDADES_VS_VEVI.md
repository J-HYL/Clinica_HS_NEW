# HS Dental — Funcionalidades actuales frente a Vevi Clinic

Inventario de **lo que la aplicación ya hace hoy**, organizado por las mismas áreas que promociona Vevi Clinic. Solo se recoge lo que existe y funciona en el código actual; no incluye pendientes ni propuestas (para eso, ver secciones 9 y 10 de `CLAUDE.md`).

> Ámbito: app de gestión interna (`app/`) + web pública (`web/`). El portal de pacientes con login propio **no** está incluido porque aún no existe.

---

## Resumen por áreas

| Área de Vevi Clinic | Qué tiene HS Dental hoy |
|---|---|
| Gestión de citas | ✅ Calendario mensual, semanal y diario; estados; médico; servicio |
| Pacientes e historia clínica | ✅ Ficha de paciente, historia clínica, alergias, edad |
| Tratamientos | ✅ Tratamientos con diagnóstico, importes y estado; odontograma FDI |
| Presupuestos | ✅ Generación de presupuestos |
| Facturación | ✅ Facturas en PDF, numeración correlativa por clínica, panel de facturas |
| Cobros y saldos | ✅ Pagos por tratamiento, deuda y estado recalculados, comprobante |
| Almacén / inventario | ✅ Inventario con escáner de códigos, fotos, etiquetas QR, control de stock |
| Imágenes y documentos | ✅ Imágenes y PDF adjuntos por tratamiento |
| Informes / análisis | ✅ Panel con estadísticas y paneles resumen |
| Multi-clínica | ✅ Dos sedes aisladas (Alcorcón y Móstoles) |
| Acceso multidispositivo | ✅ Web responsive (funciona en móvil y tablet) |
| Comunicación | ✅ Formulario de contacto, soporte por email, agenda diaria por email |

---

## 1. Gestión de citas

- Calendario **mensual** propio con las citas del mes.
- Vista **semanal** y vista **diaria**.
- Listado / control de citas.
- Cada cita guarda **fecha y hora**, **estado** (Pendiente / Completada / Cancelada), **médico** (Gabinete 1 / Gabinete 2) y **servicio**.
- Las citas se pintan por **color según su estado** en el calendario.
- Envío diario automático (cron) de la **agenda del día** al correo de la clínica, con las citas de un gabinete y opción de añadirlas a Google Calendar o al calendario del móvil (archivo `.ics`).

## 2. Pacientes e historia clínica

- Alta y edición de pacientes (**ficha del cliente**): nombre, email, teléfono, edad, alergias, fecha de alta.
- Listado / control de pacientes.
- **Historia clínica** del paciente.
- Marca de **deuda** del paciente.

## 3. Tratamientos y odontograma

- Tratamientos por paciente con **diagnóstico**, **observaciones**, **importe total**, **abonado**, **deuda** y **estado** (pendiente / pagado / parcial).
- **Odontograma** con numeración FDI: cada pieza marca pendiente (rojo) o completada (verde); opción de aplicar a todas las piezas.
- En el detalle del tratamiento, los dientes son **clicables** para alternar pendiente ↔ completada.
- **Edición** del tratamiento (tipo, observaciones, precio y piezas), recalculando deuda y estado sobre lo ya abonado.

## 4. Presupuestos

- **Generación de presupuestos** para el paciente.

## 5. Facturación

- Generación de **facturas en PDF** (renderizadas en el servidor con dompdf).
- **Numeración correlativa** de factura por clínica, con **prefijo por sede** (A / M).
- **Panel de facturas** con su propio acceso (login / logout de administración de facturas).
- El **logo va incrustado** en el PDF, así que la factura sale igual en cualquier entorno.

## 6. Cobros y saldos

- Registro de **pagos por tratamiento**: importe, fecha, **método de pago** y notas.
- Al crear, editar o borrar un pago se **recalculan automáticamente** la deuda y el estado del tratamiento (pagado / parcial / pendiente).
- **Comprobante de pago**.
- Control de la **situación de deuda** de cada paciente.

## 7. Almacén / inventario

- Inventario de material e instrumental: **nombre, categoría, stock, stock mínimo, unidad, ubicación, proveedor, precio, caducidad, estado** (operativo / revisión / baja), **foto** y notas.
- **Escáner de códigos** con la cámara del móvil/tablet: detecta **códigos de barras y QR de forma automática** (sin pulsar nada), y también admite **pistola lectora USB** o tecleado manual.
- Generación de **códigos propios** (`HSD-XXXXXXXX`) y su **etiqueta QR imprimible** para el material que no trae código de fábrica.
- **Búsqueda por código escaneado**: si el código no está asignado, ofrece asignarlo a un elemento.
- **Captura de foto** del elemento con la cámara (o selector de archivo).
- **Control de stock** con modal de ajuste, accesible desde la tabla y desde el escaneo.
- Listado **adaptado al móvil** (tarjetas en el teléfono, tabla en pantalla grande), con búsqueda, filtro y orden.
- Fotos y datos **aislados por clínica**.

## 8. Imágenes y documentos

- Subida de **imágenes y PDF adjuntos** a cada tratamiento.
- Archivos **aislados por paciente y tratamiento**.

## 9. Informes / panel

- **Panel principal (dashboard)** con **estadísticas** y **paneles resumen** de la clínica.

## 10. Multi-clínica y acceso

- **Dos sedes** (Alcorcón y Móstoles) con **datos completamente aislados** (una base de datos por clínica).
- **Login por clínica** con sesión (usuario fijo por sede + contraseña).
- **Web responsive**: la app funciona en ordenador, tablet y móvil (el escáner de inventario es de uso en el móvil, en el almacén).

## 11. Comunicación

- **Formulario de contacto** en la web pública, que guarda el mensaje y envía correos (aviso a la clínica + confirmación al remitente).
- **Formulario de soporte** dentro de la app, con envío por email.
- **Agenda diaria** de citas enviada por correo a la clínica (ver sección 1).

---

## 12. Web pública

- **Landing** de la clínica (página de marketing) con información de las dos sedes.
- **Páginas legales**: política de cookies, política de privacidad, aviso legal y términos de uso.
