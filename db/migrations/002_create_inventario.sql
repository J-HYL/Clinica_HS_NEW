-- 002_create_inventario.sql
-- Inventario de elementos clinicos (instrumental, consumibles, aparatologia).
--
-- Cada clinica tiene su propia BD, asi que NO hay columna de clinica: el
-- aislamiento lo da la conexion que elige db_connect.php con la sesion.
--
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

CREATE TABLE IF NOT EXISTS `inventario` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(150) NOT NULL,
  `categoria` varchar(50) NOT NULL DEFAULT 'otros',
  `descripcion` text,
  `marca` varchar(100) DEFAULT NULL,
  `modelo` varchar(100) DEFAULT NULL,
  `numero_serie` varchar(100) DEFAULT NULL,
  `ubicacion` varchar(100) DEFAULT NULL,
  `proveedor` varchar(150) DEFAULT NULL,
  `stock` int NOT NULL DEFAULT '0',
  `stock_minimo` int NOT NULL DEFAULT '0',
  `unidad` varchar(20) NOT NULL DEFAULT 'ud',
  `precio` decimal(10,2) DEFAULT NULL,
  `caducidad` date DEFAULT NULL,
  `estado` enum('operativo','revision','baja') NOT NULL DEFAULT 'operativo',
  `foto` varchar(255) DEFAULT NULL,
  `notas` text,
  `fecha_alta` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `fecha_actualizacion` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inventario_categoria` (`categoria`),
  KEY `idx_inventario_nombre` (`nombre`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
