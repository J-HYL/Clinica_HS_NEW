-- 011_tac_envios_externos.sql
-- Envio de TAC desde centros de radiologia externos (enlace + contrasena).
--
-- - client_id pasa a admitir NULL: un TAC que llega de fuera y cuyo nombre no
--   casa con un unico paciente queda "sin asignar" hasta que la clinica lo asigna.
-- - paciente_nombre: el nombre que escribe el centro al enviarlo.
-- - origen/centro/notas: de donde viene y lo que cuenten.
-- - visto: 0 = aviso pendiente en la campana del panel.
--
-- Requiere la 010. Sin sentencia USE a proposito: seleccionar la BD ANTES de
-- ejecutar (pre = dbs15816600; produccion = una BD por clinica, ejecutar en las dos).

ALTER TABLE `tac_estudios`
  MODIFY `client_id` int DEFAULT NULL,
  ADD COLUMN `paciente_nombre` varchar(150) DEFAULT NULL AFTER `client_id`,
  ADD COLUMN `origen` enum('panel','externo') NOT NULL DEFAULT 'panel' AFTER `paciente_nombre`,
  ADD COLUMN `centro` varchar(150) DEFAULT NULL AFTER `origen`,
  ADD COLUMN `notas` text AFTER `centro`,
  ADD COLUMN `visto` tinyint(1) NOT NULL DEFAULT 1 AFTER `estado`,
  ADD KEY `idx_tac_visto` (`visto`);
