-- 003_inventario_codigo.sql
--
-- Anade el codigo escaneable a los elementos del inventario. Una sola columna
-- para las dos cosas: el EAN/codigo de barras que ya trae el producto de
-- fabrica, o un codigo propio (HSD-XXXXXXXX) generado desde la app para pegar
-- un QR en los elementos que no traen codigo. Lo que se escanea es texto, asi
-- que no hace falta distinguir el formato en la BD.
--
-- UNIQUE para que un mismo codigo no apunte a dos elementos (al escanear tiene
-- que haber una sola respuesta). MySQL permite varios NULL en un indice UNIQUE,
-- asi que los elementos sin codigo conviven sin problema.
--
-- Ejecutar manualmente en CADA base de datos (pre-Alcorcon, prod-Alcorcon,
-- prod-Mostoles). Requiere haber aplicado antes la 002.

ALTER TABLE `inventario`
  ADD COLUMN `codigo` varchar(64) DEFAULT NULL AFTER `nombre`,
  ADD UNIQUE KEY `uq_inventario_codigo` (`codigo`);
