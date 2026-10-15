<?php
/**
 * tac_comun.php — Lo que comparten los dos endpoints de estudios TAC:
 *   - tac.php          el panel (sesión de la clínica)
 *   - tac_externo.php  el envío desde centros de radiología (enlace + contraseña)
 *
 * Ficheros, subida por trozos, cierre de la subida, búsqueda de paciente por
 * nombre, enlace de envío y sedes. No abre sesión ni manda cabeceras: eso lo
 * hace cada endpoint según su forma de autenticar. Requiere db_connect.php.
 */

const TAC_TAMANO_MAXIMO = 2 * 1024 * 1024 * 1024;  // 2 GB: un CBCT completo ronda 100-600 MB
const TAC_TROZO_MAXIMO  = 8 * 1024 * 1024;         // trozo de subida (si el servidor admite tanto)
const TAC_BLOQUE_ENVIO  = 1024 * 1024;             // bloque de lectura al servir el zip

// Sedes, con la clave de su bloque en config.secret.php (la misma que db_connect.php).
const TAC_SEDES = [
    1 => ['clave' => 'alcorcon', 'nombre' => 'Alcorcón'],
    2 => ['clave' => 'mostoles', 'nombre' => 'Móstoles'],
];

// Para las carpetas que nunca se sirven directamente (estudios y configuración).
const TAC_HTACCESS_DENEGAR =
    "# Solo se accede a traves de la API (api/tac.php), nunca directamente.\n" .
    "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
    "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n";

// --- respuestas y entrada ---------------------------------------------------

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
    // Las acciones que cambian algo exigen una cabecera propia: otra web no puede
    // mandarla sin un preflight CORS que no se le concede (CSRF).
    if ($metodo === 'POST' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'XMLHttpRequest') {
        salir(403, ['error' => 'Petición no permitida']);
    }
}

/** Fallo de BD como JSON legible. Lo típico: una migración sin aplicar en ese entorno. */
function salirErrorBd(mysqli_sql_exception $e, $origen) {
    error_log("{$origen}: " . $e->getMessage());
    $faltaMigracion = in_array($e->getCode(), [1146, 1054], true);   // tabla / columna inexistente
    salir(500, ['error' => $faltaMigracion
        ? 'La sección TAC no está instalada del todo en esta base de datos (faltan las migraciones 010/011).'
        : 'Error de base de datos al procesar el estudio.']);
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

// --- sedes ------------------------------------------------------------------

/**
 * Sedes con BD en ESTE entorno: en pre solo hay copia de Alcorcón. En local hay
 * una única BD para todo, así que valen las dos.
 * @return array [id => nombre]
 */
function sedesDisponibles() {
    $cfg = require __DIR__ . '/../../config.secret.php';
    $env = currentEnv();
    $sedes = [];
    foreach (TAC_SEDES as $id => $sede) {
        if ($env === 'local' || isset($cfg['db'][$env][$sede['clave']])) $sedes[$id] = $sede['nombre'];
    }
    return $sedes;
}

// --- ficheros ---------------------------------------------------------------

/**
 * Carpeta de los estudios de un paciente. Los que llegan de fuera sin paciente
 * claro esperan en sin_asignar/ hasta que la clínica los asigna (y se mueven).
 */
function carpetaTac($clinicSeg, $clientId) {
    $paciente = $clientId ? (int)$clientId : 'sin_asignar';
    return __DIR__ . "/../uploads/pacientes/{$clinicSeg}/{$paciente}/tac/";
}

function rutaZip($clinicSeg, array $estudio) {
    return carpetaTac($clinicSeg, $estudio['client_id']) . (int)$estudio['id'] . '.zip';
}

function rutaParcial($clinicSeg, array $estudio) {
    return carpetaTac($clinicSeg, $estudio['client_id']) . (int)$estudio['id'] . '.part';
}

/** Crea una carpeta con el .htaccess que corta el acceso directo (uploads/ no está en git). */
function prepararCarpeta($dir) {
    if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
        throw new Exception('No se pudo crear la carpeta en el servidor.');
    }
    $htaccess = $dir . '.htaccess';
    if (!file_exists($htaccess)) file_put_contents($htaccess, TAC_HTACCESS_DENEGAR);
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

// --- estudios en BD ---------------------------------------------------------

// LEFT JOIN: los que llegan de fuera pueden no tener paciente todavía.
const TAC_COLUMNAS = "t.id, t.client_id, c.nombre AS paciente, t.paciente_nombre, t.origen, t.centro, t.notas,
    t.descripcion, t.fecha_estudio, t.equipo, t.cortes, t.ancho, t.alto, t.voxel_x, t.voxel_y, t.voxel_z,
    t.tamano, t.estado, t.visto, t.subido_por, t.fecha_subida";

function obtenerEstudio(mysqli $conn, $id) {
    $stmt = $conn->prepare("SELECT " . TAC_COLUMNAS . ", t.sha256 FROM tac_estudios t
        LEFT JOIN clients c ON c.id = t.client_id WHERE t.id = ?");
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

// --- subida por trozos ------------------------------------------------------

/**
 * Registra un estudio en estado 'subiendo' y prepara su fichero parcial.
 * $d: lo que manda el navegador (tamano, sha256 y metadatos que sacó del DICOM).
 * $registro: client_id (o null), paciente_nombre, origen, centro, notas, visto, subido_por.
 * @return array ['id' => ..., 'trozo' => ...]
 */
function crearSubida(mysqli $conn, $clinicSeg, array $d, array $registro) {
    $tamano = (int)($d['tamano'] ?? 0);
    $sha256 = strtolower(trim((string)($d['sha256'] ?? '')));
    if ($tamano <= 0 || $tamano > TAC_TAMANO_MAXIMO) salir(400, ['error' => 'El tamaño del estudio no es válido (máximo 2 GB).']);
    if (!preg_match('/^[a-f0-9]{64}$/', $sha256)) salir(400, ['error' => 'Falta la huella (sha256) del estudio.']);

    // Si el hosting deja consultarlo, mejor avisar ahora que a mitad de subida.
    $libre = @disk_free_space(__DIR__ . '/..');
    if ($libre !== false && $libre < $tamano * 1.1) {
        salir(507, ['error' => 'No hay espacio suficiente en el servidor para este estudio.']);
    }

    $valores = [
        $registro['client_id'] ?? null,
        textoOrNull($registro['paciente_nombre'] ?? null, 150),
        $registro['origen'] ?? 'panel',
        textoOrNull($registro['centro'] ?? null, 150),
        textoOrNull($registro['notas'] ?? null, 2000),
        textoOrNull($d['descripcion'] ?? null, 255),
        fechaOrNull($d['fecha_estudio'] ?? null),
        textoOrNull($d['equipo'] ?? null, 150),
        enteroOrNull($d['cortes'] ?? null),
        enteroOrNull($d['ancho'] ?? null),
        enteroOrNull($d['alto'] ?? null),
        decimalOrNull($d['voxel_x'] ?? null),
        decimalOrNull($d['voxel_y'] ?? null),
        decimalOrNull($d['voxel_z'] ?? null),
        $tamano,
        $sha256,
        (int)($registro['visto'] ?? 1),
        textoOrNull($registro['subido_por'] ?? null, 50),
    ];
    $stmt = $conn->prepare("INSERT INTO tac_estudios
        (client_id, paciente_nombre, origen, centro, notas, descripcion, fecha_estudio, equipo,
         cortes, ancho, alto, voxel_x, voxel_y, voxel_z, tamano, sha256, visto, subido_por)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isssssssiiidddisis', ...$valores);
    $stmt->execute();
    $estudio = ['id' => $conn->insert_id, 'client_id' => $valores[0]];
    $stmt->close();

    try {
        prepararCarpeta(carpetaTac($clinicSeg, $estudio['client_id']));
        if (file_put_contents(rutaParcial($clinicSeg, $estudio), '') === false) {
            throw new Exception('No se pudo crear el fichero del estudio en el servidor.');
        }
    } catch (Exception $e) {
        borrarEstudio($conn, $clinicSeg, $estudio);
        salir(500, ['error' => $e->getMessage()]);
    }
    return ['id' => (int)$estudio['id'], 'trozo' => tamanoTrozo()];
}

/**
 * Añade al parcial el trozo que viene en el cuerpo de la petición (?offset=B).
 * Responde y termina: {recibido} con lo que tiene ya el servidor.
 */
function recibirTrozo($clinicSeg, array $estudio) {
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
}

/**
 * Comprueba que ha llegado entero (tamaño, firma de zip y la misma huella que
 * calculó el navegador) y lo deja 'listo'. Si no cuadra, lo borra y responde error.
 */
function completarSubida(mysqli $conn, $clinicSeg, array $estudio) {
    $parcial = rutaParcial($clinicSeg, $estudio);
    clearstatcache(true, $parcial);
    $recibido = is_file($parcial) ? filesize($parcial) : 0;

    if ($recibido !== (int)$estudio['tamano']) {
        salir(409, ['error' => 'El estudio no ha llegado completo.', 'recibido' => $recibido]);
    }
    $valido = file_get_contents($parcial, false, null, 0, 4) === "PK\x03\x04"
        && hash_equals($estudio['sha256'], hash_file('sha256', $parcial));
    if (!$valido) {
        borrarEstudio($conn, $clinicSeg, $estudio);
        salir(400, ['error' => 'La copia recibida no coincide con el original. Vuelve a enviar el estudio.']);
    }
    if (!rename($parcial, rutaZip($clinicSeg, $estudio))) {
        salir(500, ['error' => 'No se pudo guardar el estudio en el servidor.']);
    }

    $stmt = $conn->prepare("UPDATE tac_estudios SET estado = 'listo' WHERE id = ?");
    $stmt->bind_param('i', $estudio['id']);
    $stmt->execute();
    $stmt->close();
}

// --- paciente por nombre ----------------------------------------------------

/** Palabras de un nombre, sin tildes, mayúsculas ni partículas. Mismo criterio que tac/utilidades.js. */
function palabrasNombre($nombre) {
    $texto = strtr(mb_strtolower((string)$nombre, 'UTF-8'), [
        'á' => 'a', 'é' => 'e', 'í' => 'i', 'ó' => 'o', 'ú' => 'u', 'ü' => 'u', 'ñ' => 'n',
        'à' => 'a', 'è' => 'e', 'ì' => 'i', 'ò' => 'o', 'ù' => 'u', 'ç' => 'c',
    ]);
    $palabras = preg_split('/[^a-z]+/', $texto, -1, PREG_SPLIT_NO_EMPTY);
    return array_values(array_filter($palabras, function ($p) {
        return strlen($p) > 1 && !in_array($p, ['de', 'del', 'la', 'las', 'los', 'y'], true);
    }));
}

/**
 * Paciente al que corresponde un nombre escrito a mano: todas las palabras del
 * nombre más corto tienen que estar en el otro, y al menos dos. Solo se da por
 * bueno si hay UNO: con ninguno o con varios, null (el estudio queda sin
 * asignar y lo decide la clínica). Asignar mal un TAC es peor que no asignarlo.
 */
function buscarPaciente(mysqli $conn, $nombre) {
    $buscado = palabrasNombre($nombre);
    if (count($buscado) < 2) return null;

    $encontrado = null;
    $res = $conn->query("SELECT id, nombre FROM clients");
    while ($cliente = $res->fetch_assoc()) {
        $palabras = palabrasNombre($cliente['nombre']);
        [$corto, $largo] = count($buscado) <= count($palabras) ? [$buscado, $palabras] : [$palabras, $buscado];
        if (count($corto) < 2 || array_diff($corto, $largo)) continue;
        if ($encontrado) return null;
        $encontrado = $cliente;
    }
    return $encontrado;
}

// --- enlace de envío para centros externos ----------------------------------

function rutaEnlace() {
    return __DIR__ . '/../uploads/privado/tac_enlace.json';
}

/**
 * Configuración del enlace: {token, password_hash, actualizado, actualizado_por}
 * o null si aún no se ha creado. Vive en uploads/privado/ (por entorno, fuera de
 * git y sin acceso directo): el enlace es uno para las dos sedes, así que no
 * puede ir en la BD de una clínica concreta.
 */
function leerEnlace() {
    $ruta = rutaEnlace();
    if (!is_file($ruta)) return null;
    $enlace = json_decode(file_get_contents($ruta), true);
    return is_array($enlace) && !empty($enlace['token']) ? $enlace : null;
}

function guardarEnlace(array $enlace) {
    prepararCarpeta(dirname(rutaEnlace()) . '/');
    if (file_put_contents(rutaEnlace(), json_encode($enlace), LOCK_EX) === false) {
        throw new Exception('No se pudo guardar la configuración del enlace.');
    }
}
