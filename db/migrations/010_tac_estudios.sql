-- 010_tac_estudios.sql
-- Estudios TAC/CBCT (DICOM) de cada paciente, para la seccion "TAC" del panel.
--
-- El estudio se guarda como UN zip (la serie DICOM que exporta Romexis, ya
-- validada y depurada en el navegador) en
--   uploads/pacientes/clinica<id>/<client_id>/tac/<id>.zip
-- La ruta NO se guarda: la calcula tac.php a partir de la clinica de la sesion,
-- el paciente y el id, asi no hay ninguna ruta en la BD que manipular.
--
-- Cada clinica tiene su propia BD, asi que NO hay columna de clinica.
-- Sin sentencia USE a proposito: seleccionar la BD ANTES de ejecutar
-- (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

CREATE TABLE IF NOT EXISTS `tac_estudios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `client_id` int NOT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `fecha_estudio` date DEFAULT NULL,
  `equipo` varchar(150) DEFAULT NULL,
  `cortes` int DEFAULT NULL,
  `ancho` int DEFAULT NULL,
  `alto` int DEFAULT NULL,
  `voxel_x` decimal(8,4) DEFAULT NULL,
  `voxel_y` decimal(8,4) DEFAULT NULL,
  `voxel_z` decimal(8,4) DEFAULT NULL,
  `tamano` bigint NOT NULL DEFAULT '0',
  `sha256` char(64) DEFAULT NULL,
  `estado` enum('subiendo','listo') NOT NULL DEFAULT 'subiendo',
  `subido_por` varchar(50) DEFAULT NULL,
  `fecha_subida` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tac_client` (`client_id`),
  KEY `idx_tac_estado` (`estado`),
  CONSTRAINT `fk_tac_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
