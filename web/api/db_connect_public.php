<?php
/**
 * HSDental · db_connect_public.php
 * Conexión a bases de datos según clínica
 * Sin sesiones - Todo público
 *
 * Credenciales en config.secret.php (raiz, fuera de docroot, gitignored),
 * bajo db.prod.<clinica> — el mismo bloque que ya usa app/ en produccion,
 * porque `contactos` vive en la misma BD fisica por clinica que el resto
 * de tablas del panel (ver CLAUDE.md).
 *
 * NOTA: hoy usa siempre el bloque 'prod' independientemente del entorno
 * (pre.hsdental.es tambien escribe en la BD de produccion). Es el mismo
 * comportamiento que tenia antes con las credenciales hardcodeadas; no se
 * ha cambiado a currentEnv()-aware en esta limpieza porque PRE solo tiene
 * la clinica Alcorcon habilitada y falta confirmar que su BD tenga la
 * tabla `contactos` antes de enrutar el formulario publico alli.
 */

function getConnectionByClinic($clinic) {
    $secrets = require __DIR__ . '/../../config.secret.php';
    $clinics = $secrets['db']['prod'] ?? [];

    // Normalizar el nombre de la clínica (minúsculas + quitar tildes)
    $clinic = strtolower(trim($clinic));
    $clinic = str_replace(
        ['á','é','í','ó','ú','ü','ñ'],
        ['a','e','i','o','u','u','n'],
        $clinic
    );

    // Verificar si la clínica existe
    if (!isset($clinics[$clinic])) {
        return null;
    }

    $config = $clinics[$clinic];

    // Crear conexión
    $conn = new mysqli(
        $config['host'],
        $config['user'],
        $config['pass'],
        $config['db']
    );

    // Verificar conexión
    if ($conn->connect_error) {
        error_log("Error de conexión ({$clinic}): " . $conn->connect_error);
        return null;
    }

    // Establecer charset utf8mb4
    $conn->set_charset('utf8mb4');

    return $conn;
}