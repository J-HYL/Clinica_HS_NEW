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

**No hay migraciones pendientes.** La sección de Inventario y el escaneo de
códigos funcionan en los tres entornos. La 002 y la 003 se aplicaron en
producción con el script combinado (las dos juntas en un solo `CREATE TABLE` ya
con la columna `codigo`), por eso comparten fecha. En local se aplicaron el
2026-07-14 (002) y el 2026-07-15 (003), por separado.
