-- 001_index_appointments_fecha.sql
--
-- appointments no tiene ningun indice mas alla de la PK. El calendario
-- mensual (app/api/DB.php, WHERE fecha BETWEEN ? AND ? ORDER BY fecha) y el
-- dashboard (SELECT * FROM appointments ORDER BY fecha) hacen full table
-- scan + filesort en cada carga, y la tabla crece sin purgarse.
--
-- Ejecutar manualmente en CADA base de datos (pre-Alcorcon, prod-Alcorcon,
-- prod-Mostoles). Idempotente: falla sin romper nada si el indice ya existe.

CREATE INDEX idx_appointments_fecha ON appointments (fecha);

-- Opcional: si control.html/citas filtran mucho por estado y medico juntos,
-- valorar tambien:
-- CREATE INDEX idx_appointments_estado_medico ON appointments (estado, medico);
