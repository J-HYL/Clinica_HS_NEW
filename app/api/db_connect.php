<?php
//db_connect.php
//session_start();

function getConnection() {
    $isLocal = in_array($_SERVER['SERVER_NAME'], ['localhost','127.0.0.1']);

    if ($isLocal) {
        $servername = "localhost";
        $username   = "root";
        $password   = "";
        $dbname     = "clinicahs";
    } else {
        if (!isset($_SESSION['clinic_id'])) {
            die(json_encode(["error" => "Clínica no seleccionada."]));
        }
        switch ($_SESSION['clinic_id']) {
            case 1: // Alcorcón
                $servername = "db5017933701.hosting-data.io";
                $username   = "dbu943630";
                $password   = "Jjbinks1999$";
                $dbname     = "dbs14273934";
                break;
            case 2: // Móstoles
                $servername = "db5018426857.hosting-data.io";
                $username   = "dbu1523504";
                $password   = "Jjbinks1999$";
                $dbname     = "dbs14654471";
                break;
            default:
                die(json_encode(["error" => "ID de clínica inválido."]));
        }
    }

    $conn = new mysqli($servername, $username, $password, $dbname);
    if ($conn->connect_error) {
        die(json_encode(["error" => "Error de conexión: " . $conn->connect_error]));
    }
    return $conn;
}
