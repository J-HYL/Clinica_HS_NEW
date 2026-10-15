<?php
/**
 * tac.php — Estudios TAC/CBCT (DICOM) de los pacientes: la parte del PANEL
 * (sesión de la clínica). Los envíos desde centros externos van por
 * tac_externo.php; lo que comparten los dos está en tac_comun.php.
 *
 * El navegador hace todo el trabajo pesado (descomprimir, leer los DICOM, montar
 * el volumen y pintarlo). Aquí solo se guarda el zip y se controla quién lo ve:
 * el servidor NUNCA descomprime ni interpreta el zip.
 *
 *   GET  ?accion=listar               estudios listos (también los sin asignar)
 *   GET  ?accion=ver&id=N             datos de un estudio
 *   GET  ?accion=archivo&id=N         el zip, en streaming y con soporte de Range
 *   GET  ?accion=avisos               estudios llegados de fuera sin ver (campana)
 *   POST ?accion=iniciar              {client_id, tamano, sha256, ...metadatos} -> {id, trozo}
 *   POST ?accion=trozo&id=N&offset=B  cuerpo binario con un trozo del zip -> {recibido}
 *   POST ?accion=finalizar&id=N       comprueba tamaño + sha256 y deja el estudio 'listo'
 *   POST ?accion=borrar&id=N          borra fichero y registro (también cancela una subida)
 *   POST ?accion=asignar&id=N         {client_id}: pasa el estudio a la ficha de ese paciente
 *   POST ?accion=visto&id=N           quita el aviso de la campana
 *   GET  ?accion=enlace               enlace de envío para centros externos
 *   POST ?accion=enlace_guardar       {regenerar?, password?}: crea/regenera el enlace o cambia la contraseña
 *
 * Los ficheros viven en uploads/pacientes/clinica<id>/<client_id|sin_asignar>/tac/
 * con un .htaccess que deniega TODO acceso directo: la única vía de lectura es
 * ?accion=archivo, que exige sesión. Al borrar un paciente, DB.php borra su
 * carpeta entera (tac/ incluida) y la FK con ON DELETE CASCADE los registros.
 */

session_start();
ob_start();

$allowedOrigins = ['https://app.hsdental.es', 'https://pre.hsdental.es'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($reqOrigin, $allowedOrigins, true) ? $reqOrigin : 'https://app.hsdental.es'));
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range, X-Requested-With');
// Nunca cachear: todo lo que sale de aquí son datos de pacientes.
header('Cache-Control: no-store, private');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { ob_end_clean(); http_response_code(204); exit; }
if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id'])) {
    ob_end_clean(); http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'No autenticado o clínica no seleccionada']); exit;
}

$usuario = $_SESSION['user'] ?? null;
// Libera el lock del fichero de sesión (ver DB.php): la descarga y la subida de
// un estudio son varias peticiones largas y no deben bloquear el resto del panel.
session_write_close();

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/tac_comun.php';
$conn = getConnection();

// Segmento de clínica: aísla los ficheros por sede (los IDs de paciente se repiten
// entre clínicas, cada una con su propia BD). Mismo criterio que DB.php.
$clinicSeg = 'clinica' . (int)$_SESSION['clinic_id'];

function pacienteExiste(mysqli $conn, $clientId) {
    if ($clientId <= 0) return false;
    $stmt = $conn->prepare("SELECT id FROM clients WHERE id = ?");
    $stmt->bind_param('i', $clientId);
    $stmt->execute();
    $existe = (bool)$stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $existe;
}

/** Lo que ve el panel del enlace de envío (nunca la contraseña, solo si la hay). */
function datosEnlace() {
    $enlace = leerEnlace();
    return [
        'existe' => (bool)$enlace,
        'token' => $enlace['token'] ?? null,
        'tienePassword' => !empty($enlace['password_hash']),
        'actualizado' => $enlace['actualizado'] ?? null,
        'actualizado_por' => $enlace['actualizado_por'] ?? null,
    ];
}

function marcarVisto(mysqli $conn, $id) {
    $stmt = $conn->prepare("UPDATE tac_estudios SET visto = 1 WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
}

$accion = $_GET['accion'] ?? '';

// mysqli lanza excepciones (PHP 8.1+): sin esto un fallo de BD saldría como un
// 500 vacío. El caso típico es una migración sin aplicar en ese entorno.
try {
    switch ($accion) {

        case 'listar':
            exigirMetodo('GET');
            limpiarSubidasAbandonadas($conn, $clinicSeg);
            // Los sin asignar primero: son los que piden que alguien haga algo.
            $res = $conn->query("SELECT " . TAC_COLUMNAS . " FROM tac_estudios t
                LEFT JOIN clients c ON c.id = t.client_id
                WHERE t.estado = 'listo'
                ORDER BY (t.client_id IS NULL) DESC, t.fecha_subida DESC");
            salir(200, $res->fetch_all(MYSQLI_ASSOC));

        case 'ver':
            exigirMetodo('GET');
            $estudio = estudioDeLaPeticion($conn, 'listo');
            unset($estudio['sha256']);
            salir(200, $estudio);

        case 'archivo':
            exigirMetodo('GET');
            $estudio = estudioDeLaPeticion($conn, 'listo');
            $ruta = rutaZip($clinicSeg, $estudio);
            if (!is_file($ruta)) salir(404, ['error' => 'El fichero del estudio no está en el servidor.']);
            $conn->close();
            enviarFichero($ruta, 'tac-' . (int)$estudio['id'] . '.zip');

        case 'avisos':
            exigirMetodo('GET');
            // La campana lo pide en TODAS las pantallas del panel: si la sección TAC
            // aún no está instalada en esta BD, simplemente no hay avisos.
            try {
                $res = $conn->query("SELECT t.id, t.client_id, c.nombre AS paciente, t.paciente_nombre, t.centro, t.fecha_subida
                    FROM tac_estudios t LEFT JOIN clients c ON c.id = t.client_id
                    WHERE t.visto = 0 AND t.estado = 'listo'
                    ORDER BY t.fecha_subida DESC LIMIT 20");
                $estudios = $res->fetch_all(MYSQLI_ASSOC);
                $total = (int)$conn->query("SELECT COUNT(*) AS n FROM tac_estudios WHERE visto = 0 AND estado = 'listo'")->fetch_assoc()['n'];
            } catch (mysqli_sql_exception $e) {
                $estudios = [];
                $total = 0;
            }
            salir(200, ['count' => $total, 'estudios' => $estudios]);

        case 'iniciar':
            exigirMetodo('POST');
            $d = body();
            $clientId = (int)($d['client_id'] ?? 0);
            if (!pacienteExiste($conn, $clientId)) salir(404, ['error' => 'El paciente no existe.']);
            salir(200, ['success' => true] + crearSubida($conn, $clinicSeg, $d, [
                'client_id' => $clientId,
                'origen' => 'panel',
                'visto' => 1,
                'subido_por' => $usuario,
            ]));

        case 'trozo':
            exigirMetodo('POST');
            recibirTrozo($clinicSeg, estudioDeLaPeticion($conn, 'subiendo'));

        case 'finalizar':
            exigirMetodo('POST');
            $estudio = estudioDeLaPeticion($conn, 'subiendo');
            completarSubida($conn, $clinicSeg, $estudio);
            salir(200, ['success' => true, 'id' => (int)$estudio['id']]);

        case 'borrar':
            exigirMetodo('POST');
            $estudio = estudioDeLaPeticion($conn);
            $filas = borrarEstudio($conn, $clinicSeg, $estudio);
            salir(200, ['success' => true, 'rows_affected' => $filas]);

        case 'asignar':
            exigirMetodo('POST');
            $estudio = estudioDeLaPeticion($conn, 'listo');
            $clientId = (int)(body()['client_id'] ?? 0);
            if (!pacienteExiste($conn, $clientId)) salir(404, ['error' => 'El paciente no existe.']);

            // El fichero va en la carpeta del paciente (así se borra con él): se mueve.
            if ((int)$estudio['client_id'] !== $clientId) {
                $origen = rutaZip($clinicSeg, $estudio);
                $destino = rutaZip($clinicSeg, ['id' => $estudio['id'], 'client_id' => $clientId]);
                try {
                    prepararCarpeta(dirname($destino) . '/');
                } catch (Exception $e) {
                    salir(500, ['error' => $e->getMessage()]);
                }
                if (!is_file($origen) || !rename($origen, $destino)) {
                    salir(500, ['error' => 'No se pudo mover el estudio a la ficha del paciente.']);
                }
                try {
                    $stmt = $conn->prepare("UPDATE tac_estudios SET client_id = ? WHERE id = ?");
                    $stmt->bind_param('ii', $clientId, $estudio['id']);
                    $stmt->execute();
                    $stmt->close();
                } catch (mysqli_sql_exception $e) {
                    rename($destino, $origen);   // que fichero y BD no se desemparejen
                    throw $e;
                }
            }
            marcarVisto($conn, (int)$estudio['id']);
            salir(200, ['success' => true]);

        case 'visto':
            exigirMetodo('POST');
            $estudio = estudioDeLaPeticion($conn);
            marcarVisto($conn, (int)$estudio['id']);
            salir(200, ['success' => true]);

        case 'enlace':
            exigirMetodo('GET');
            salir(200, datosEnlace());

        case 'enlace_guardar':
            exigirMetodo('POST');
            $d = body();
            $enlace = leerEnlace() ?: [];

            // Regenerar = enlace nuevo; el anterior deja de funcionar al momento.
            if (!empty($d['regenerar']) || empty($enlace['token'])) {
                $enlace['token'] = bin2hex(random_bytes(32));
            }
            $password = (string)($d['password'] ?? '');
            if ($password !== '') {
                if (mb_strlen($password) < 8) salir(400, ['error' => 'La contraseña tiene que tener al menos 8 caracteres.']);
                $enlace['password_hash'] = password_hash($password, PASSWORD_DEFAULT);
            }
            if (empty($enlace['password_hash'])) salir(400, ['error' => 'Pon una contraseña para el enlace.']);

            $enlace['actualizado'] = date('Y-m-d H:i:s');
            $enlace['actualizado_por'] = $usuario;
            try {
                guardarEnlace($enlace);
            } catch (Exception $e) {
                salir(500, ['error' => $e->getMessage()]);
            }
            salir(200, datosEnlace());

        default:
            salir(400, ['error' => 'Acción no válida']);
    }
} catch (mysqli_sql_exception $e) {
    salirErrorBd($e, "tac.php ({$accion})");
}
