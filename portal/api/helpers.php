<?php
// portal/api/helpers.php
// Utilidades comunes de la API del portal: sesion, cabeceras, respuestas JSON,
// lectura del body, guard de login, y tokens. Incluir al principio de cada
// endpoint (arranca la sesion y fija las cabeceras).

require_once __DIR__ . '/session.php';
require_once __DIR__ . '/db_connect.php';

header('Content-Type: application/json; charset=utf-8');
// Datos de paciente: nunca cachear (ni proxies ni navegador).
header('Cache-Control: no-store, private');
// Endurecido basico (mismo origen, sin adivinar tipos, sin referrer a terceros).
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

/** Responde JSON y termina. */
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

/** Responde un error JSON y termina. */
function json_error($msg, $code = 400) {
    json_out(['error' => $msg], $code);
}

/** Lee el body de la peticion como array asociativo (JSON). */
function body_json() {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

/** Exige que solo se use uno de los metodos indicados; si no, 405. */
function only_methods(array $metodos) {
    $m = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($m === 'OPTIONS') { http_response_code(204); exit; }
    if (!in_array($m, $metodos, true)) {
        json_error('Metodo no permitido.', 405);
    }
    return $m;
}

/**
 * Exige sesion de paciente activa; devuelve el client_id (int).
 * TODA lectura/escritura de datos debe scopearse a ESTE id, nunca a un id que
 * venga del cliente (evita que un paciente vea datos de otro).
 */
function require_login() {
    if (empty($_SESSION['portal_client_id']) || empty($_SESSION['portal_sede'])) {
        json_error('No autenticado.', 401);
    }
    return (int) $_SESSION['portal_client_id'];
}

/** Normaliza un email para login/almacenamiento (trim + minusculas). */
function norm_email($email) {
    return strtolower(trim((string) $email));
}

/** Genera [token_en_claro, token_hash]. El claro solo viaja por email; se guarda el hash. */
function nuevo_token() {
    $token = bin2hex(random_bytes(32));
    return [$token, hash('sha256', $token)];
}

/** Hash de un token recibido, para comparar contra lo guardado en BD. */
function hash_token($token) {
    return hash('sha256', (string) $token);
}

/**
 * Busca una cuenta de portal por una columna CONTROLADA por el servidor
 * (email | invite_token_hash | reset_token_hash) en TODAS las sedes del entorno.
 * Devuelve ['conn'=>mysqli, 'sede'=>str, 'row'=>assoc] con la conexion ABIERTA a
 * esa sede (para poder actualizar la fila), o null si no aparece en ninguna.
 */
function portal_buscar($columna, $valor) {
    $permitidas = ['email', 'invite_token_hash', 'reset_token_hash'];
    if (!in_array($columna, $permitidas, true)) {
        json_error('Busqueda no permitida.', 500);
    }
    foreach (portalSedes() as $sede) {
        $conn = getConnectionByClinic($sede);
        if ($conn === null) continue;
        $stmt = $conn->prepare("SELECT * FROM portal_users WHERE $columna = ? LIMIT 1");
        $stmt->bind_param('s', $valor);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            return ['conn' => $conn, 'sede' => $sede, 'row' => $row];
        }
        $conn->close();
    }
    return null;
}
