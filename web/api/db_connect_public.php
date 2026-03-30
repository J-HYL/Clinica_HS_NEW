<?php
/**
 * HSDental · db_connect_public.php
 * Conexión a bases de datos según clínica
 * Sin sesiones - Todo público
 */

function getConnectionByClinic($clinic) {
    // Configuración de clínicas
    $clinics = [
        'mostoles' => [
            'host' => 'db5018426857.hosting-data.io',
            'user' => 'dbu1523504',
            'pass' => 'Jjbinks1999$',
            'db'   => 'dbs14654471'
        ],
        'alcorcon' => [
            'host' => 'db5017933701.hosting-data.io',
            'user' => 'dbu943630',
            'pass' => 'Jjbinks1999$',
            'db'   => 'dbs14273934'
        ]
    ];

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