<?php
// db_connect.php
// session_start();

/** Devuelve el entorno actual según el nombre de host: 'local' | 'pre' | 'prod'. */
function currentEnv() {
    $host = $_SERVER['SERVER_NAME'] ?? '';
    if (in_array($host, ['localhost', '127.0.0.1'], true)) {
        return 'local';
    }
    // pre.hsdental.es -> 'pre'   |   app.hsdental.es / hsdental.es -> 'prod'
    return strpos($host, 'pre.') === 0 ? 'pre' : 'prod';
}

function getConnection() {
    $cfg = require __DIR__ . '/../../config.secret.php';
    $env = currentEnv();

    if ($env === 'local') {
        $c = $cfg['db']['local'];
    } else {
        if (!isset($_SESSION['clinic_id'])) {
            die(json_encode(["error" => "Clínica no seleccionada."]));
        }
        $map = [1 => 'alcorcon', 2 => 'mostoles'];
        $clinicKey = $map[$_SESSION['clinic_id']] ?? null;

        // En 'pre' puede haber solo una clínica habilitada (la copia).
        if ($clinicKey === null || !isset($cfg['db'][$env][$clinicKey])) {
            die(json_encode(["error" => "Clínica no disponible en este entorno ({$env})."]));
        }
        $c = $cfg['db'][$env][$clinicKey];
    }

    $conn = new mysqli($c['host'], $c['user'], $c['pass'], $c['db']);
    if ($conn->connect_error) {
        die(json_encode(["error" => "Error de conexión: " . $conn->connect_error]));
    }
    return $conn;
}
