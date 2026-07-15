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
| 002 | `002_create_inventario.sql` | Crea la tabla `inventario` (elementos clínicos: stock, ubicación, foto...) para la sección nueva de Inventario | ☑ (2026-07-15) | ☐ |
| 003 | `003_inventario_codigo.sql` | Añade `inventario.codigo` (UNIQUE): el código de barras o QR que se escanea para abrir el elemento | ☐ | ☐ |

> **Pendiente: 002 en producción, y 003 en pre y en producción.** La sección de
> Inventario no funciona en un entorno hasta que se ejecute allí la 002 (la API
> responderá error de tabla inexistente), y el escaneo de códigos necesita
> además la 003. La 003 va después de la 002: añade una columna a esa tabla.
> Recordatorio: en producción son **dos** BD (Alcorcón y Móstoles) y hay que
> correr los scripts en las dos. Aplicadas en local el 2026-07-14 (002) y el
> 2026-07-15 (003).
