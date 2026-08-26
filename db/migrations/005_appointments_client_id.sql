-- 005_appointments_client_id.sql
--
-- Enlaza cada cita con su paciente. Hasta ahora `appointments` NO tenia forma
-- fiable de saber de que paciente es una cita: `cliente` es texto libre (a
-- menudo un telefono o una nota) y el nombre del paciente suele ir en
-- `servicio`. Sin este enlace, el portal no puede mostrar "mis citas".
--
-- Se anade `client_id` NULLABLE con FK a clients:
--   - NULL para las citas antiguas (no se puede saber con seguridad de quien
--     son; un backfill por nombre/telefono seria fragil, se deja para despues).
--   - Las citas NUEVAS (creadas desde el panel y desde el portal) lo rellenan.
--   - ON DELETE SET NULL: borrar un paciente no debe borrar el hueco de agenda,
--     solo desvincularlo (a diferencia de treatments/payments que SI cascadean).
--
-- "Mis citas" en el portal = appointments WHERE client_id = <paciente en sesion>.
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

ALTER TABLE `appointments`
  ADD COLUMN `client_id` int DEFAULT NULL AFTER `id`,
  ADD KEY `idx_appointments_client` (`client_id`),
  ADD CONSTRAINT `fk_appointments_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE SET NULL;
