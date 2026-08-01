-- 009_notificaciones_payment_id.sql
ALTER TABLE `notificaciones`
  ADD COLUMN `payment_id` int DEFAULT NULL AFTER `solicitud_id`,
  ADD KEY `idx_notif_payment` (`payment_id`),
  ADD CONSTRAINT `fk_notif_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL;
