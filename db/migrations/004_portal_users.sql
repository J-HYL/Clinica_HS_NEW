-- 004_portal_users.sql
-- Cuentas del PORTAL DE PACIENTES (pacientes.hsdental.es).
--
-- Una fila por paciente con acceso al portal. NO son usuarios del panel: la
-- tabla `users` es SOLO personal de clinica (login por sede, SHA-256). El
-- portal es una app aparte, de cara al publico, con su propia autenticacion:
-- contrasenas con password_hash() (bcrypt), tokens hasheados y rate-limit.
--
-- Cada clinica tiene su propia BD, asi que (como en el resto del esquema) NO
-- hace falta columna de clinica para aislar: lo hace la conexion. Aun asi se
-- guarda `sede` de forma EXPLICITA porque en el portal el login busca el email
-- en las dos BD y necesita saber a que sede pertenece la cuenta encontrada;
-- ademas ayuda a depurar y deja la puerta abierta a una futura auth unificada.
--
-- `email` es el identificador de login: se captura y VERIFICA en la invitacion,
-- no se hereda de clients.email (que es nullable y trae textos como
-- 'No proporcionado' en datos reales).
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

CREATE TABLE IF NOT EXISTS `portal_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `sede` enum('alcorcon','mostoles') NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,          -- NULL hasta que el paciente activa la cuenta
  `estado` enum('invitado','activo','bloqueado') NOT NULL DEFAULT 'invitado',
  `invite_token_hash` char(64) DEFAULT NULL,          -- SHA-256 del token de invitacion (el token en claro solo viaja en el email)
  `invite_expira` datetime DEFAULT NULL,
  `reset_token_hash` char(64) DEFAULT NULL,           -- SHA-256 del token de reset de contrasena
  `reset_expira` datetime DEFAULT NULL,
  `intentos_fallidos` int NOT NULL DEFAULT '0',       -- rate-limit de login
  `bloqueado_hasta` datetime DEFAULT NULL,
  `ultimo_acceso` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_portal_users_client` (`client_id`),
  UNIQUE KEY `uq_portal_users_email` (`email`),
  CONSTRAINT `fk_portal_users_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
