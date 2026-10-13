<?php
/**
 * tac.php — Estudios TAC/CBCT (DICOM) de los pacientes (sección "TAC" del panel).
 *
 * El navegador hace todo el trabajo pesado (descomprimir, leer los DICOM, montar
 * el volumen y pintarlo). Aquí solo se guarda el zip y se controla quién lo ve:
 * el servidor NUNCA descomprime ni interpreta el zip (ni zip bombs ni rutas
 * maliciosas dentro del zip llegan a tocar el disco).
 *
 *   GET  ?accion=listar               estudios listos, con el nombre del paciente
 *   GET  ?accion=ver&id=N             datos de un estudio
 *   GET  ?accion=archivo&id=N         el zip, en streaming y con soporte de Range
 *   POST ?accion=iniciar              {client_id, tamano, sha256, ...metadatos} -> {id, trozo}
 *   POST ?accion=trozo&id=N&offset=B  cuerpo binario con un trozo del zip -> {recibido}
 *   POST ?accion=finalizar&id=N       comprueba tamaño + sha256 y deja el estudio 'listo'
 *   POST ?accion=borrar&id=N          borra fichero y registro (también cancela una subida)
 *
 * Subida por trozos: un CBCT pesa cientos de MB y post_max_size cambia entre
 * local, pre y producción, así que el tamaño del trozo lo decide el servidor
 * (tamanoTrozo()) y se lo dice al navegador en 'iniciar'.
 *
 * Los ficheros viven en uploads/pacientes/clinica<id>/<client_id>/tac/ con un
 * .htaccess que deniega TODO acceso directo (lo escribe este script, uploads/ no
 * está en git): la única vía de lectura es ?accion=archivo, que exige sesión.
 * Al borrar un paciente, DB.php borra su carpeta entera (tac/ incluida) y la FK
 * con ON DELETE CASCADE se lleva los registros.
 */

session_start();
ob_start();

$allowedOrigins = ['https://app.hsdental.es', 'https://pre.hsdental.es'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($reqOrigin, $allowedOrigins, true) ? $reqOrigin : 'https://app.hsdental.es'));
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Range');
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
$conn = getConnection();

// Segmento de clínica: aísla los ficheros por sede (los IDs de paciente se repiten
// entre clínicas, cada una con su propia BD). Mismo criterio que DB.php.
$clinicSeg = 'clinica' . (int)$_SESSION['clinic_id'];

const TAC_TAMANO_MAXIMO = 2 * 1024 * 1024 * 1024;  // 2 GB: un CBCT completo ronda 100-600 MB
const TAC_TROZO_MAXIMO  = 8 * 1024 * 1024;         // trozo de subida (si el servidor admite tanto)
const TAC_BLOQUE_ENVIO  = 1024 * 1024;             // bloque de lectura al servir el zip

// --- utilidades -------------------------------------------------------------

function salir($code, $payload) {
    if (ob_get_level() > 0) ob_end_clean();
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function body() { return json_decode(file_get_contents('php://input'), true) ?: []; }

function exigirMetodo($metodo) {
    if ($_SERVER['REQUEST_METHOD'] !== $metodo) salir(405, ['error' => 'Método no permitido']);
}

/** "40M" (formato de php.ini) -> bytes. */
function bytesIni($valor) {
    $valor = trim((string)$valor);
    if ($valor === '') return 0;
    $numero = (float)$valor;
    switch (strtolower(substr($valor, -1))) {
        case 'g': $numero *= 1024; // sigue
        case 'm': $numero *= 1024; // sigue
        case 'k': $numero *= 1024;
    }
    return (int)$numero;
}

/** Trozo de subida que admite ESTE servidor, con margen para las cabeceras. */
function tamanoTrozo() {
    $limite = bytesIni(ini_get('post_max_size'));
    if ($limite <= 0) return TAC_TROZO_MAXIMO;   // 0 = sin límite
    return max(256 * 1024, min(TAC_TROZO_MAXIMO, $limite - 64 * 1024));
}

function textoOrNull($valor, $max) {
    if (!isset($valor)) return null;
    $valor = trim((string)$valor);
    return $valor === '' ? null : mb_substr($valor, 0, $max);
}

function enteroOrNull($valor) {
    return is_numeric($valor) && (int)$valor > 0 ? (int)$valor : null;
}

function decimalOrNull($valor) {
    return is_numeric($valor) && (float)$valor > 0 ? round((float)$valor, 4) : null;
}

/** 'YYYY-MM-DD' válida o null. */
function fechaOrNull($valor) {
    if (!is_string($valor) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $valor, $m)) return null;
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $valor : null;
}

// --- ficheros ---------------------------------------------------------------

function carpetaTac($clinicSeg, $clientId) {
    return __DIR__ . "/../uploads/pacientes/{$clinicSeg}/" . (int)$clientId . '/tac/';
}

function rutaZip($clinicSeg, array $estudio) {
    return carpetaTac($clinicSeg, $estudio['client_id']) . (int)$estudio['id'] . '.zip';
}

function rutaParcial($clinicSeg, array $estudio) {
    return carpetaTac($clinicSeg, $estudio['client_id']) . (int)$estudio['id'] . '.part';
}

/** Crea la carpeta tac/ del paciente con el .htaccess que corta el acceso directo. */
function prepararCarpeta($dir) {
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        throw new Exception('No se pudo crear la carpeta del estudio en el servidor.');
    }
    $htaccess = $dir . '.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess,
            "# Los estudios TAC solo se sirven a traves de api/tac.php (exige sesion).\n" .
            "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n");
    }
}

function borrarFicheros($clinicSeg, array $estudio) {
    foreach ([rutaZip($clinicSeg, $estudio), rutaParcial($clinicSeg, $estudio)] as $ruta) {
        if (is_file($ruta)) unlink($ruta);
    }
}

/**
 * Sirve un fichero en bloques, con soporte de "Range: bytes=a-b". El visor lo
 * descarga por tramos: cada petición es corta (no se acerca al timeout del
 * proxy de IONOS) y un tramo fallido se reintenta sin empezar de cero.
 */
function enviarFichero($ruta, $nombre) {
    $tamano = filesize($ruta);
    $inicio = 0;
    $fin = $tamano - 1;
    $rango = trim($_SERVER['HTTP_RANGE'] ?? '');

    if ($rango !== '') {
        if (!preg_match('/^bytes=(\d*)-(\d*)$/', $rango, $m) || ($m[1] === '' && $m[2] === '')) {
            salirRangoInvalido($tamano);
        }
        if ($m[1] === '') {                 // "bytes=-N": los últimos N bytes
            $inicio = max(0, $tamano - (int)$m[2]);
        } else {
            $inicio = (int)$m[1];
            if ($m[2] !== '') $fin = min((int)$m[2], $tamano - 1);
        }
        if ($inicio > $fin || $inicio >= $tamano) salirRangoInvalido($tamano);
    }

    // Nada de buffers ni compresión: son cientos de MB y la longitud debe cuadrar.
    while (ob_get_level() > 0) ob_end_clean();
    @ini_set('zlib.output_compression', 'Off');
    @set_time_limit(0);

    $longitud = $fin - $inicio + 1;
    http_response_code($rango !== '' ? 206 : 200);
    header('Content-Type: application/octet-stream');
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: attachment; filename="' . $nombre . '"');
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . $longitud);
    if ($rango !== '') header("Content-Range: bytes {$inicio}-{$fin}/{$tamano}");

    $f = fopen($ruta, 'rb');
    fseek($f, $inicio);
    $pendiente = $longitud;
    while ($pendiente > 0 && !feof($f) && !connection_aborted()) {
        $bloque = fread($f, min(TAC_BLOQUE_ENVIO, $pendiente));
        if ($bloque === false || $bloque === '') break;
        echo $bloque;
        flush();
        $pendiente -= strlen($bloque);
    }
    fclose($f);
    exit;
}

function salirRangoInvalido($tamano) {
    while (ob_get_level() > 0) ob_end_clean();
    http_response_code(416);
    header("Content-Range: bytes */{$tamano}");
    exit;
}

// --- BD ---------------------------------------------------------------------

const TAC_COLUMNAS = "t.id, t.client_id, c.nombre AS paciente, t.descripcion, t.fecha_estudio, t.equipo,
    t.cortes, t.ancho, t.alto, t.voxel_x, t.voxel_y, t.voxel_z, t.tamano, t.estado, t.subido_por, t.fecha_subida";

function obtenerEstudio(mysqli $conn, $id) {
    $stmt = $conn->prepare("SELECT " . TAC_COLUMNAS . ", t.sha256 FROM tac_estudios t
        JOIN clients c ON c.id = t.client_id WHERE t.id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $estudio = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $estudio ?: null;
}

/** Estudio por ?id=, o 404. $estado (opcional) exige ese estado. */
function estudioDeLaPeticion(mysqli $conn, $estado = null) {
    $id = (int)($_GET['id'] ?? 0);
    $estudio = $id > 0 ? obtenerEstudio($conn, $id) : null;
    if (!$estudio) salir(404, ['error' => 'El estudio no existe.']);
    if ($estado && $estudio['estado'] !== $estado) {
        salir(409, ['error' => $estado === 'listo' ? 'El estudio aún no ha terminado de subirse.' : 'Este estudio ya no admite más datos.']);
    }
    return $estudio;
}

/** Subidas que se quedaron a medias (se cerró el navegador, se cortó la red...). */
function limpiarSubidasAbandonadas(mysqli $conn, $clinicSeg) {
    $res = $conn->query("SELECT id, client_id FROM tac_estudios
        WHERE estado = 'subiendo' AND fecha_subida < (NOW() - INTERVAL 1 DAY)");
    foreach ($res->fetch_all(MYSQLI_ASSOC) as $estudio) {
        borrarFicheros($clinicSeg, $estudio);
        $conn->query("DELETE FROM tac_estudios WHERE id = " . (int)$estudio['id']);
    }
}

function borrarEstudio(mysqli $conn, $clinicSeg, array $estudio) {
    borrarFicheros($clinicSeg, $estudio);
    $stmt = $conn->prepare("DELETE FROM tac_estudios WHERE id = ?");
    $stmt->bind_param('i', $estudio['id']);
    $stmt->execute();
    $filas = $stmt->affected_rows;
    $stmt->close();
    return $filas;
}

// --- acciones ---------------------------------------------------------------

$accion = $_GET['accion'] ?? '';

switch ($accion) {

    case 'listar':
        exigirMetodo('GET');
        limpiarSubidasAbandonadas($conn, $clinicSeg);
        $res = $conn->query("SELECT " . TAC_COLUMNAS . " FROM tac_estudios t
            JOIN clients c ON c.id = t.client_id
            WHERE t.estado = 'listo' ORDER BY t.fecha_subida DESC");
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

    case 'iniciar':
        exigirMetodo('POST');
        $d = body();
        $clientId = (int)($d['client_id'] ?? 0);
        $tamano   = (int)($d['tamano'] ?? 0);
        $sha256   = strtolower(trim((string)($d['sha256'] ?? '')));

        if ($clientId <= 0) salir(400, ['error' => 'Falta el paciente.']);
        if ($tamano <= 0 || $tamano > TAC_TAMANO_MAXIMO) salir(400, ['error' => 'El tamaño del estudio no es válido (máximo 2 GB).']);
        if (!preg_match('/^[a-f0-9]{64}$/', $sha256)) salir(400, ['error' => 'Falta la huella (sha256) del estudio.']);

        $stmt = $conn->prepare("SELECT id FROM clients WHERE id = ?");
        $stmt->bind_param('i', $clientId);
        $stmt->execute();
        $existe = (bool)$stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$existe) salir(404, ['error' => 'El paciente no existe.']);

        // Si el hosting deja consultarlo, mejor avisar ahora que a mitad de subida.
        $libre = @disk_free_space(__DIR__ . '/..');
        if ($libre !== false && $libre < $tamano * 1.1) {
            salir(507, ['error' => 'No hay espacio suficiente en el servidor para este estudio.']);
        }

        $descripcion = textoOrNull($d['descripcion'] ?? null, 255);
        $fecha       = fechaOrNull($d['fecha_estudio'] ?? null);
        $equipo      = textoOrNull($d['equipo'] ?? null, 150);
        $cortes      = enteroOrNull($d['cortes'] ?? null);
        $ancho       = enteroOrNull($d['ancho'] ?? null);
        $alto        = enteroOrNull($d['alto'] ?? null);
        $voxelX      = decimalOrNull($d['voxel_x'] ?? null);
        $voxelY      = decimalOrNull($d['voxel_y'] ?? null);
        $voxelZ      = decimalOrNull($d['voxel_z'] ?? null);

        $stmt = $conn->prepare("INSERT INTO tac_estudios
            (client_id, descripcion, fecha_estudio, equipo, cortes, ancho, alto, voxel_x, voxel_y, voxel_z, tamano, sha256, subido_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('isssiiidddiss', $clientId, $descripcion, $fecha, $equipo, $cortes, $ancho, $alto,
            $voxelX, $voxelY, $voxelZ, $tamano, $sha256, $usuario);
        if (!$stmt->execute()) salir(500, ['error' => 'No se pudo registrar el estudio: ' . $stmt->error]);
        $estudio = ['id' => $conn->insert_id, 'client_id' => $clientId];
        $stmt->close();

        try {
            prepararCarpeta(carpetaTac($clinicSeg, $clientId));
            if (file_put_contents(rutaParcial($clinicSeg, $estudio), '') === false) {
                throw new Exception('No se pudo crear el fichero del estudio en el servidor.');
            }
        } catch (Exception $e) {
            borrarEstudio($conn, $clinicSeg, $estudio);
            salir(500, ['error' => $e->getMessage()]);
        }

        salir(200, ['success' => true, 'id' => $estudio['id'], 'trozo' => tamanoTrozo()]);

    case 'trozo':
        exigirMetodo('POST');
        $estudio = estudioDeLaPeticion($conn, 'subiendo');
        $parcial = rutaParcial($clinicSeg, $estudio);
        if (!is_file($parcial)) salir(409, ['error' => 'La subida de este estudio no está iniciada.']);

        $offset = (int)($_GET['offset'] ?? -1);
        $f = fopen($parcial, 'c+b');
        flock($f, LOCK_EX);
        $actual = fstat($f)['size'];

        // El navegador dice desde dónde manda. Si no cuadra (un reintento de un
        // trozo que sí llegó, p. ej.), se le contesta cuánto hay y sigue desde ahí.
        if ($offset !== $actual) {
            flock($f, LOCK_UN); fclose($f);
            salir(409, ['error' => 'El trozo no corresponde a la posición actual.', 'recibido' => $actual]);
        }

        fseek($f, $actual);
        $entrada = fopen('php://input', 'rb');
        $copiados = stream_copy_to_stream($entrada, $f);
        fclose($entrada);
        fflush($f);

        $esperado = (int)($_SERVER['CONTENT_LENGTH'] ?? -1);
        $incompleto = $copiados === false || ($esperado >= 0 && $copiados !== $esperado);
        $excede = !$incompleto && $actual + $copiados > (int)$estudio['tamano'];
        if ($incompleto || $excede) {
            ftruncate($f, $actual);   // el reintento empieza limpio desde $actual
            flock($f, LOCK_UN); fclose($f);
            salir(400, [
                'error' => $excede ? 'El estudio supera el tamaño declarado.' : 'El trozo no llegó completo.',
                'recibido' => $actual,
            ]);
        }

        flock($f, LOCK_UN);
        fclose($f);
        salir(200, ['success' => true, 'recibido' => $actual + $copiados]);

    case 'finalizar':
        exigirMetodo('POST');
        $estudio = estudioDeLaPeticion($conn, 'subiendo');
        $parcial = rutaParcial($clinicSeg, $estudio);
        clearstatcache(true, $parcial);
        $recibido = is_file($parcial) ? filesize($parcial) : 0;

        if ($recibido !== (int)$estudio['tamano']) {
            salir(409, ['error' => 'El estudio no ha llegado completo.', 'recibido' => $recibido]);
        }
        // Un zip empieza por la firma "PK\x03\x04", y la huella tiene que ser la
        // misma que calculó el navegador sobre el original.
        $valido = file_get_contents($parcial, false, null, 0, 4) === "PK\x03\x04"
            && hash_equals($estudio['sha256'], hash_file('sha256', $parcial));
        if (!$valido) {
            borrarEstudio($conn, $clinicSeg, $estudio);
            salir(400, ['error' => 'La copia recibida no coincide con el original. Vuelve a subir el estudio.']);
        }
        if (!rename($parcial, rutaZip($clinicSeg, $estudio))) {
            salir(500, ['error' => 'No se pudo guardar el estudio en el servidor.']);
        }

        $stmt = $conn->prepare("UPDATE tac_estudios SET estado = 'listo' WHERE id = ?");
        $stmt->bind_param('i', $estudio['id']);
        $stmt->execute();
        $stmt->close();
        salir(200, ['success' => true, 'id' => (int)$estudio['id']]);

    case 'borrar':
        exigirMetodo('POST');
        $estudio = estudioDeLaPeticion($conn);
        $filas = borrarEstudio($conn, $clinicSeg, $estudio);
        salir(200, ['success' => true, 'rows_affected' => $filas]);

    default:
        salir(400, ['error' => 'Acción no válida']);
}
