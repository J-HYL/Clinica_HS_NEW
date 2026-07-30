-- 006_solicitudes_cita.sql
--
-- Solicitudes de cita del Portal de Pacientes (Fase 2). El paciente pide una
-- cita desde el portal -> se crea aqui una SOLICITUD (no una cita real). La
-- clinica la ve en el panel y la ACEPTA (crea la cita en `appointments` y enlaza
-- `appointment_id`), la RECHAZA, o PROPONE OTRA HORA (`fecha_propuesta`). El
-- paciente recibe email + notificacion (ver 007) y, si es contraoferta, puede
-- aceptarla desde el portal.
--
-- Tabla aparte para NO ensuciar `appointments` hasta que la clinica confirma.
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

CREATE TABLE IF NOT EXISTS `solicitudes_cita` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `fecha_preferida` datetime NOT NULL,                 -- fecha+hora que pide el paciente
  `motivo` varchar(255) DEFAULT NULL,                  -- servicio/motivo de la visita
  `notas` text,                                        -- comentario del paciente
  `estado` enum('solicitada','confirmada','rechazada','contraoferta','cancelada') NOT NULL DEFAULT 'solicitada',
  `fecha_propuesta` datetime DEFAULT NULL,             -- nueva hora que ofrece la clinica (si contraoferta)
  `respuesta_clinica` varchar(255) DEFAULT NULL,       -- nota de la clinica al rechazar/ofrecer
  `appointment_id` int DEFAULT NULL,                   -- la cita creada al confirmar
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_solicitudes_estado` (`estado`),
  KEY `idx_solicitudes_client` (`client_id`),
  CONSTRAINT `fk_solicitudes_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_solicitudes_appointment` FOREIGN KEY (`appointment_id`) REFERENCES `appointments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
