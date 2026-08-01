-- 009_notificaciones_payment_id.sql
--
-- Enlaza una notificacion del portal con un PAGO concreto. Lo usa el aviso
-- 'factura_emitida': cuando la clinica emite la factura de un pago, la
-- notificacion guarda ese payment_id para que, al pulsarla en el portal, se abra
-- el detalle del tratamiento con el desplegable de ESE pago (y su boton de
-- descargar factura) ya abierto.
--
-- Nullable: las notificaciones de cita (confirmada/rechazada/contraoferta) no lo
-- usan. ON DELETE SET NULL: borrar un pago no borra el aviso, solo lo desvincula.
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

ALTER TABLE `notificaciones`
  ADD COLUMN `payment_id` int DEFAULT NULL AFTER `solicitud_id`,
  ADD KEY `idx_notif_payment` (`payment_id`),
  ADD CONSTRAINT `fk_notif_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL;
