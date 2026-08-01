# Migraciones SQL

No hay un runner de migraciones (la app no tiene ORM ni framework). Estos
scripts son **manuales**: cuando se necesite un cambio de esquema, se añade
aquí un archivo numerado y se ejecuta a mano contra cada BD que corresponda
(phpMyAdmin, `mysql` CLI, etc.), en este orden:

1. `pre` (BD de Alcorcón en preproducción, `dbs15816600`)
2. `prod` — Alcorcón y Móstoles (dos BD físicas separadas, cada una necesita
   correr el mismo script)

Nunca ejecutar contra la BD equivocada. Si el script usa `USE nombre_bd;`,
confirmar el nombre antes de correrlo.

## Convención de nombres

`NNN_descripcion-corta.sql`, numeración secuencial de 3 dígitos.

## Aplicadas

| # | Archivo | Qué hace | Aplicado en pre | Aplicado en prod |
|---|---|---|---|---|
| 001 | `001_index_appointments_fecha.sql` | Índice en `appointments.fecha` (el calendario/dashboard hacían full table scan) | ☑ (2026-07-12) | ☑ (2026-07-12) — Alcorcón y Móstoles |
| 002 | `002_create_inventario.sql` | Crea la tabla `inventario` (elementos clínicos: stock, ubicación, foto...) para la sección nueva de Inventario | ☑ (2026-07-15) | ☑ (2026-07-15) — Alcorcón y Móstoles |
| 003 | `003_inventario_codigo.sql` | Añade `inventario.codigo` (UNIQUE): el código de barras o QR que se escanea para abrir el elemento | ☑ (2026-07-15) | ☑ (2026-07-15) — Alcorcón y Móstoles |
| 004 | `004_portal_users.sql` | Crea la tabla `portal_users` (cuentas del Portal de Pacientes: login por email, `password_hash`, tokens de invitación/reset, rate-limit) | ☐ pendiente | ☐ pendiente |
| 005 | `005_appointments_client_id.sql` | Añade `appointments.client_id` (FK nullable → `clients`) para enlazar cada cita con su paciente (necesario para "mis citas" del portal) | ☐ pendiente | ☐ pendiente |
| 006 | `006_solicitudes_cita.sql` | Crea `solicitudes_cita` (peticiones de cita del portal: solicitada/confirmada/rechazada/contraoferta/cancelada) — Fase 2 | ☐ pendiente | ☐ pendiente |
| 007 | `007_notificaciones.sql` | Crea `notificaciones` (avisos al paciente en el portal: cita confirmada/rechazada/otra hora) — Fase 2 | ☐ pendiente | ☐ pendiente |
| 008 | `008_solicitudes_factura.sql` | Crea `solicitudes_factura` (el paciente pide la factura de un pago desde el portal; la clínica la genera y avisa) — Facturas portal | ☐ pendiente | ☐ pendiente |
| 009 | `009_notificaciones_payment_id.sql` | Añade `notificaciones.payment_id` (FK nullable → `payments`) para el deep-link: la notificación de factura abre el detalle del pago en el portal | ☐ pendiente | ☐ pendiente |

**Migraciones 004–009: PENDIENTES de aplicar en pre y prod** (Portal de Pacientes).
Orden de dependencias al aplicarlas: **005 → 006 → 007** (la 006 tiene FK a
`appointments`, la 007 a `solicitudes_cita`); la **008** tiene FK a `payments` y a
`facturas` (que ya existen), así que puede ir después de la 004; la **009** tiene
FK a `payments` (independiente, va después de la 008); la 004 es independiente.
Primero `pre` (Alcorcón), luego `prod` en las DOS BD (Alcorcón y Móstoles). En
LOCAL ya están aplicadas la 004–007; aplica también la **008** y la **009** en
local antes de probar la feature de facturas/descarga. Marca la casilla y la fecha al
aplicarlas en pre/prod.

Las 001–003 (Inventario) ya funcionan en los tres entornos. La 002 y la 003 se
aplicaron en producción con el script combinado (las dos juntas en un solo
`CREATE TABLE` ya con la columna `codigo`), por eso comparten fecha. En local se
aplicaron el 2026-07-14 (002) y el 2026-07-15 (003), por separado.
