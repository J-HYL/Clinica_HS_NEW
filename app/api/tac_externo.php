<?php
/**
 * tac_externo.php — Envío de estudios TAC desde centros de radiología externos.
 *
 * Lo usa la página pública pages/tac/enviar.html?k=<token>. Para enviar hace
 * falta el enlace (token aleatorio de 256 bits) Y la contraseña que la clínica le
 * da al centro (los dos se gestionan desde la sección TAC del panel). Quien entra
 * solo puede SUBIR: aquí no hay ninguna acción que devuelva datos de la clínica.
 *
 *   GET  ?accion=comprobar&k=T      ¿el enlace es válido? -> {valido}
 *   POST ?accion=entrar             {k, password} -> abre la sesión de envío -> {sedes}
 *   POST ?accion=iniciar            {sede, paciente_nombre, centro?, notas?, tamano, sha256, ...metadatos} -> {id, trozo}
 *   POST ?accion=trozo&id=S-N&offset=B
 *   POST ?accion=finalizar&id=S-N   -> correo al administrador + aviso en la campana del panel
 *   POST ?accion=borrar&id=S-N      cancela una subida a medias (solo las suyas y sin terminar)
 *
 * Los ids que ve el centro son "sede-id" (cada sede tiene su BD y sus ids).
 * El estudio se asigna solo al paciente si el nombre casa con UNO (buscarPaciente);
 * si no, queda "sin asignar" y la clínica lo asigna. Al centro no se le dice cuál
 * de los dos casos fue: eso revelaría quién es paciente de la clínica.
 *
 * Sesión PROPIA (cookie HSTACENVIO, limitada a este script, HttpOnly, SameSite
 * Strict): nada que ver con la del panel, no da acceso a DB.php. Dura 4 h y deja
 * de valer en cuanto la clínica regenera el enlace.
 */

const ENVIO_DURACION   = 4 * 3600;   // segundos de sesión de envío
const ENVIO_MAX_FALLOS = 8;          // contraseñas fallidas por IP...
const ENVIO_VENTANA    = 15 * 60;    // ...en esta ventana (s)
const ENVIO_MAX_ABIERTAS = 5;        // subidas sin terminar a la vez por sesión
const TAC_AVISO_DESTINO = 'hsdental00@gmail.com';   // si config.secret.php no trae avisos.tac

$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_name('HSTACENVIO');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/api/tac_externo.php',
    'secure' => $https,
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();
ob_start();

// Sin cabeceras CORS: solo la propia página (mismo origen) puede usar esto.
header('Cache-Control: no-store, private');
header('X-Robots-Tag: noindex, nofollow');

require_once __DIR__ . '/db_connect.php';
require_once __DIR__ . '/tac_comun.php';

// --- límite de intentos de contraseña ----------------------------------------

function rutaIntentos() {
    return dirname(rutaEnlace()) . '/tac_intentos.json';
}

function claveIp() {
    return hash('sha256', $_SERVER['REMOTE_ADDR'] ?? '');
}

/** Intentos fallidos recientes, ya sin los que han salido de la ventana. */
function leerIntentos() {
    $ruta = rutaIntentos();
    $todos = is_file($ruta) ? (json_decode(file_get_contents($ruta), true) ?: []) : [];
    return array_filter($todos, function ($i) { return $i['desde'] > time() - ENVIO_VENTANA; });
}

function guardarIntentos(array $intentos) {
    prepararCarpeta(dirname(rutaIntentos()) . '/');
    file_put_contents(rutaIntentos(), json_encode($intentos), LOCK_EX);
}

function registrarFallo() {
    $intentos = leerIntentos();
    $clave = claveIp();
    $intentos[$clave] = ['n' => ($intentos[$clave]['n'] ?? 0) + 1, 'desde' => $intentos[$clave]['desde'] ?? time()];
    guardarIntentos($intentos);
}

function olvidarFallos() {
    $intentos = leerIntentos();
    unset($intentos[claveIp()]);
    guardarIntentos($intentos);
}

// --- sesión de envío ----------------------------------------------------------

function enlaceValido($enlace, $token) {
    return $enlace && !empty($enlace['password_hash']) && is_string($token) && hash_equals($enlace['token'], $token);
}

/** Datos de la sesión de envío, o 401 si no hay, ha caducado o el enlace cambió. */
function sesionEnvio() {
    $sesion = $_SESSION['tac_envio'] ?? null;
    $enlace = leerEnlace();
    $vigente = $sesion && $sesion['hasta'] > time() && $enlace
        && hash_equals($sesion['token'], hash('sha256', $enlace['token']));
    if (!$vigente) salir(401, ['error' => 'La sesión de envío ha caducado. Vuelve a entrar con la contraseña.', 'caducada' => true]);
    return $sesion;
}

/** Conexión a la BD de una sede: getConnection() la elige por clinic_id de la sesión. */
function conectarSede($sede) {
    $_SESSION['clinic_id'] = $sede;
    $conn = getConnection();
    unset($_SESSION['clinic_id']);   // que no se quede guardado en la sesión de envío
    return $conn;
}

/**
 * Estudio de ESTA sesión (?id=sede-id) en el estado pedido.
 * @return array [$conn, $clinicSeg, $estudio, $clave]
 */
function estudioPropio(array $sesion, $estado) {
    $clave = (string)($_GET['id'] ?? '');
    if (!preg_match('/^(\d+)-(\d+)$/', $clave, $m) || !in_array($clave, $sesion['estudios'], true)) {
        salir(404, ['error' => 'Ese envío no existe.']);
    }
    $conn = conectarSede((int)$m[1]);
    $estudio = obtenerEstudio($conn, (int)$m[2]);
    if (!$estudio || $estudio['estado'] !== $estado) salir(409, ['error' => 'Ese envío ya no admite cambios.']);
    return [$conn, 'clinica' . (int)$m[1], $estudio, $clave];
}

function quitarDeSesion($clave) {
    $_SESSION['tac_envio']['estudios'] = array_values(array_diff($_SESSION['tac_envio']['estudios'], [$clave]));
}

// --- aviso al administrador ---------------------------------------------------

/** Correo a la clínica con lo que ha llegado (best-effort: si falla, se registra y ya). */
function avisarAdministrador(array $estudio, $sedeNombre) {
    $cfg = require __DIR__ . '/../../config.secret.php';
    $destino = $cfg['avisos']['tac'] ?? TAC_AVISO_DESTINO;
    $paciente = $estudio['paciente']
        ? $estudio['paciente'] . ' (asignado automáticamente: compruébalo)'
        : 'Sin asignar. Nombre indicado: ' . $estudio['paciente_nombre'];

    // En local no se escribe a la clínica de verdad.
    if (currentEnv() === 'local') {
        error_log("[tac_externo] (local, sin enviar) aviso a {$destino}: TAC {$estudio['id']} en {$sedeNombre}");
        return;
    }

    global $https;
    $puerto = (int)($_SERVER['SERVER_PORT'] ?? 443);
    $host = $_SERVER['SERVER_NAME'] . (in_array($puerto, [80, 443], true) ? '' : ":{$puerto}");
    $panel = ($https ? 'https' : 'http') . "://{$host}/pages/tac/control.html";

    $filas = [
        'Sede' => $sedeNombre,
        'Paciente' => $paciente,
        'Enviado por' => $estudio['centro'] ?: '—',
        'Fecha del estudio' => $estudio['fecha_estudio'] ? date('d/m/Y', strtotime($estudio['fecha_estudio'])) : '—',
        'Notas' => $estudio['notas'] ?: '—',
    ];
    $tabla = '';
    foreach ($filas as $etiqueta => $valor) {
        $tabla .= '<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;">' . htmlspecialchars($etiqueta) .
            '</td><td style="padding:6px 0;color:#111827;font-size:14px;">' . nl2br(htmlspecialchars($valor)) . '</td></tr>';
    }
    $html =
        '<div style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .
        '<tr><td style="background:#1e2a5e;border-radius:12px 12px 0 0;padding:20px 26px;"><span style="color:#fff;font-size:16px;font-weight:700;">HS Dental</span><span style="color:rgba(255,255,255,.6);font-size:12px;margin-left:10px;">Estudios TAC</span></td></tr>' .
        '<tr><td style="background:#ffffff;padding:28px 26px;"><p style="margin:0 0 14px;font-size:18px;font-weight:700;color:#111827;">Nuevo TAC recibido</p>' .
        '<table cellpadding="0" cellspacing="0">' . $tabla . '</table>' .
        '<p style="margin:22px 0 0;"><a href="' . htmlspecialchars($panel) . '" style="display:inline-block;background:#2b80f7;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Abrir la sección TAC</a></p></td></tr>' .
        '<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:14px 26px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental · Este es un correo automático.</p></td></tr>' .
        '</table></td></tr></table></div>';

    require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
    require_once __DIR__ . '/PHPMailer/src/SMTP.php';
    require_once __DIR__ . '/PHPMailer/src/Exception.php';
    $smtp = $cfg['smtp'] ?? [];
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $smtp['host'] ?? 'smtp.ionos.es';
        $mail->SMTPAuth = true;
        $mail->Username = $smtp['user'] ?? '';
        $mail->Password = $smtp['pass'] ?? '';
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = (int)($smtp['port'] ?? 587);
        $mail->Timeout = 10;                       // conexion SMTP (defecto PHPMailer: 300 s)
        $mail->getSMTPInstance()->Timelimit = 15;  // espera de respuesta del servidor (idem)
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental · TAC');
        $mail->addAddress($destino);
        $mail->isHTML(true);
        $mail->Subject = "Nuevo TAC recibido · {$sedeNombre}";
        $mail->Body = $html;
        $mail->AltBody = "Nuevo TAC recibido ({$sedeNombre}).\nPaciente: {$paciente}\nRevísalo en {$panel}";
        $mail->send();
    } catch (\Throwable $e) {
        error_log('[tac_externo] email: ' . $mail->ErrorInfo);
    }
}

// --- acciones -----------------------------------------------------------------

$accion = $_GET['accion'] ?? '';

try {
    switch ($accion) {

        case 'comprobar':
            exigirMetodo('GET');
            salir(200, ['valido' => enlaceValido(leerEnlace(), $_GET['k'] ?? null)]);

        case 'entrar':
            exigirMetodo('POST');
            if (($intentos = leerIntentos()[claveIp()] ?? null) && $intentos['n'] >= ENVIO_MAX_FALLOS) {
                salir(429, ['error' => 'Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.']);
            }
            $d = body();
            $enlace = leerEnlace();
            if (!enlaceValido($enlace, $d['k'] ?? null) || !password_verify((string)($d['password'] ?? ''), $enlace['password_hash'])) {
                registrarFallo();
                salir(401, ['error' => 'La contraseña no es correcta.']);
            }
            olvidarFallos();
            session_regenerate_id(true);
            $_SESSION = ['tac_envio' => [
                'token' => hash('sha256', $enlace['token']),
                'hasta' => time() + ENVIO_DURACION,
                'estudios' => [],
            ]];
            $sedes = [];
            foreach (sedesDisponibles() as $id => $nombre) $sedes[] = ['id' => $id, 'nombre' => $nombre];
            salir(200, ['sedes' => $sedes]);

        case 'iniciar':
            exigirMetodo('POST');
            $sesion = sesionEnvio();
            if (count($sesion['estudios']) >= ENVIO_MAX_ABIERTAS) {
                salir(429, ['error' => 'Hay demasiados envíos sin terminar. Recarga la página y vuelve a empezar.']);
            }
            $d = body();
            $sede = (int)($d['sede'] ?? 0);
            if (!isset(sedesDisponibles()[$sede])) salir(400, ['error' => 'Elige la clínica a la que va el estudio.']);
            $nombre = textoOrNull($d['paciente_nombre'] ?? null, 150);
            if (!$nombre || mb_strlen($nombre) < 3) salir(400, ['error' => 'Escribe el nombre y apellidos del paciente.']);

            $conn = conectarSede($sede);
            $paciente = buscarPaciente($conn, $nombre);
            $subida = crearSubida($conn, 'clinica' . $sede, $d, [
                'client_id' => $paciente['id'] ?? null,
                'paciente_nombre' => $nombre,
                'origen' => 'externo',
                'centro' => $d['centro'] ?? null,
                'notas' => $d['notas'] ?? null,
                'visto' => 0,
                'subido_por' => 'Envío externo',
            ]);
            $clave = "{$sede}-{$subida['id']}";
            $_SESSION['tac_envio']['estudios'][] = $clave;
            salir(200, ['success' => true, 'id' => $clave, 'trozo' => $subida['trozo']]);

        case 'trozo':
            exigirMetodo('POST');
            $sesion = sesionEnvio();
            session_write_close();   // los trozos son peticiones largas: sin bloquear la sesión
            [, $clinicSeg, $estudio] = estudioPropio($sesion, 'subiendo');
            recibirTrozo($clinicSeg, $estudio);

        case 'finalizar':
            exigirMetodo('POST');
            [$conn, $clinicSeg, $estudio, $clave] = estudioPropio(sesionEnvio(), 'subiendo');
            completarSubida($conn, $clinicSeg, $estudio);
            quitarDeSesion($clave);
            $sede = (int)explode('-', $clave)[0];
            avisarAdministrador(obtenerEstudio($conn, (int)$estudio['id']), TAC_SEDES[$sede]['nombre']);
            salir(200, ['success' => true]);

        case 'borrar':
            exigirMetodo('POST');
            [$conn, $clinicSeg, $estudio, $clave] = estudioPropio(sesionEnvio(), 'subiendo');
            borrarEstudio($conn, $clinicSeg, $estudio);
            quitarDeSesion($clave);
            salir(200, ['success' => true]);

        default:
            salir(400, ['error' => 'Acción no válida']);
    }
} catch (mysqli_sql_exception $e) {
    salirErrorBd($e, "tac_externo.php ({$accion})");
}
