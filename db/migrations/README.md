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
| 001 | `001_index_appointments_fecha.sql` | Índice en `appointments.fecha` (el calendario/dashboard hacían full table scan) | ☐ | ☐ |
