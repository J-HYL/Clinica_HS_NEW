<?php
// portal/api/db_connect.php
// Conexion a BD del Portal de Pacientes. Reusa config.secret.php (los MISMOS
// bloques de BD por clinica que el panel) y la deteccion de entorno por host.
// El portal NO comparte sesion ni codigo de auth con app/ (frontera de seguridad).

/**
 * Entorno actual segun el host: 'local' | 'pre' | 'prod'.
 * Misma logica que app/api/db_connect.php, y funciona tal cual para los hosts
 * del portal:  pacientes.hsdental.es -> prod ; pre-pacientes.hsdental.es -> pre
 * (empieza por 'pre.') ; localhost/127.0.0.1 -> local.
 */
function currentEnv() {
    $host = $_SERVER['SERVER_NAME'] ?? '';
    if (in_array($host, ['localhost', '127.0.0.1'], true)) {
        return 'local';
    }
    // Pre del portal: pre-pacientes.hsdental.es (con GUION). Aceptamos ambos
    // prefijos: 'pre-' (portal) y 'pre.' (por si acaso). El resto -> prod.
    if (strpos($host, 'pre-') === 0 || strpos($host, 'pre.') === 0) {
        return 'pre';
    }
    return 'prod';
}

/** Carga (una vez) la config secreta de la raiz del webspace, fuera de docroots. */
function portalConfig() {
    static $cfg = null;
    if ($cfg === null) {
        $cfg = require __DIR__ . '/../../config.secret.php';
    }
    return $cfg;
}

/**
 * URL publica base del portal para el entorno actual (para enlaces de email:
 * activacion y reset). Derivada del entorno, NO del header Host, para no ser
 * vulnerable a Host header poisoning en los enlaces que se envian por correo.
 */
function portalBaseUrl() {
    switch (currentEnv()) {
        case 'prod': return 'https://pacientes.hsdental.es';
        case 'pre':  return 'https://pre-pacientes.hsdental.es';
        default:     return 'http://localhost:8082'; // vhost local del portal (ver setup-local)
    }
}

/**
 * Credenciales de BD de una sede en el entorno actual. Soporta el bloque 'local'
 * en DOS formatos, para no romper el entorno local ya existente del panel:
 *   - PLANO:  db['local'] = ['host'=>..., 'user'=>..., 'db'=>...]      (una sola BD)
 *   - SPLIT:  db['local'] = ['alcorcon'=>[...], 'mostoles'=>[...]]     (multisede)
 * En 'pre'/'prod' siempre es por sede. Devuelve null si la sede no existe aqui
 * (p. ej. en 'pre' solo esta Alcorcon).
 */
function portalDbCreds($sede) {
    $cfg = portalConfig();
    $env = currentEnv();
    $db  = $cfg['db'][$env] ?? null;
    if ($db === null) return null;

    // Local plano: una unica BD sirve para cualquier sede (dev con un solo dump).
    if ($env === 'local' && isset($db['host'])) {
        return $db;
    }
    return $db[$sede] ?? null;
}

/** Sedes con BD disponible en el entorno actual (el login busca el email en todas). */
function portalSedes() {
    $cfg = portalConfig();
    $env = currentEnv();
    $db  = $cfg['db'][$env] ?? [];
    // Local plano: hay una sola BD; por convencion la tratamos como 'alcorcon'
    // (evita buscar dos veces en la misma BD durante el login).
    if ($env === 'local' && isset($db['host'])) {
        return ['alcorcon'];
    }
    return array_keys($db);
}

/** Abre conexion mysqli a la BD de una sede. Devuelve null si no se puede. */
function getConnectionByClinic($sede) {
    $c = portalDbCreds($sede);
    if ($c === null) return null;
    $conn = @new mysqli($c['host'], $c['user'], $c['pass'], $c['db']);
    if ($conn->connect_error) {
        error_log('[portal] Conexion fallida (' . $sede . '): ' . $conn->connect_error);
        return null;
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

/**
 * Conexion a la BD de la sede del paciente que hay EN SESION.
 * Requiere $_SESSION['portal_sede'] (fijado en el login). Corta con JSON si falta.
 */
function getConnection() {
    $sede = $_SESSION['portal_sede'] ?? null;
    if ($sede === null) {
        http_response_code(401);
        die(json_encode(['error' => 'Sesion no iniciada.']));
    }
    $conn = getConnectionByClinic($sede);
    if ($conn === null) {
        http_response_code(500);
        die(json_encode(['error' => 'No se pudo conectar con la clinica.']));
    }
    return $conn;
}
