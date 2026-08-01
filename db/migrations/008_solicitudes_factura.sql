-- 008_solicitudes_factura.sql

CREATE TABLE IF NOT EXISTS `solicitudes_factura` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `payment_id` int NOT NULL,                 -- el pago concreto (payments.id)
  `estado` enum('solicitada','generada','rechazada','cancelada') NOT NULL DEFAULT 'solicitada',
  `factura_id` int DEFAULT NULL,             -- facturas.id (resuelto por numero al generar)
  `factura_numero` int DEFAULT NULL,
  `avisado` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_solf_estado` (`estado`),
  KEY `idx_solf_client` (`client_id`),
  KEY `idx_solf_payment` (`payment_id`),
  CONSTRAINT `fk_solf_client`  FOREIGN KEY (`client_id`)  REFERENCES `clients`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_solf_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_solf_factura` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
