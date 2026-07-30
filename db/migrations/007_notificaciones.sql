-- 007_notificaciones.sql
--
-- Notificaciones del paciente en el Portal (Fase 2). Cuando la clinica responde
-- a una solicitud de cita (confirma / rechaza / propone otra hora), se crea aqui
-- una notificacion que el paciente ve en el apartado "Notificaciones" del portal.
-- Si es una contraoferta, la notificacion enlaza con la solicitud (`solicitud_id`)
-- para que el paciente pueda aceptar/rechazar la nueva hora desde ahi.
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

CREATE TABLE IF NOT EXISTS `notificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `tipo` varchar(40) NOT NULL DEFAULT 'cita',          -- cita_confirmada | cita_rechazada | cita_contraoferta | ...
  `titulo` varchar(150) NOT NULL,
  `mensaje` text,
  `solicitud_id` int DEFAULT NULL,                     -- enlaza con la solicitud (para acciones)
  `leida` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notif_client` (`client_id`, `leida`),
  CONSTRAINT `fk_notif_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_solicitud` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_cita` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
