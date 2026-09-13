<?php
/**
 * solicitudes.php — Gestión de solicitudes de cita del portal (lado clínica).
 *
 * El paciente pide cita desde el portal -> aquí la clínica las ve y actúa:
 *   GET  ?accion=pendientes   lista solicitudes abiertas (solicitada/contraoferta)
 *   GET  ?accion=count        nº de solicitudes abiertas (para el badge)
 *   POST ?accion=aceptar      {solicitud_id, medico?}  -> crea la cita (con client_id) + email + notificación
 *   POST ?accion=rechazar     {solicitud_id, motivo?}  -> email + notificación
 *   POST ?accion=ofrecer      {solicitud_id, fecha_propuesta, nota?} -> contraoferta + email + notificación
 *
 * Mismo guard/CORS/PHPMailer que soporte.php / invitar_portal.php. Trabaja sobre
 * la BD de la clínica de la sesión (que tiene appointments, solicitudes_cita,
 * notificaciones y clients).
 */

session_start();
ob_start();
header('Content-Type: application/json');

$allowedOrigins = ['https://app.hsdental.es', 'https://pre.hsdental.es'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($reqOrigin, $allowedOrigins, true) ? $reqOrigin : 'https://app.hsdental.es'));
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, private');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { ob_end_clean(); http_response_code(204); exit; }
if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id'])) {
    ob_end_clean(); http_response_code(401);
    echo json_encode(['error' => 'No autenticado o clínica no seleccionada']); exit;
}

// Libera el lock del fichero de sesion. PHP lo mantiene EN EXCLUSIVA desde
// session_start() hasta el final del script, asi que sin esto las peticiones de
// una misma sesion no corren en paralelo: se encolan. El panel lanza ~9 a la vez
// (Stats.js + Notificaciones.js + clinica.js) y las ultimas agotaban los 60 s del
// proxy -> 504. De aqui en adelante no se escribe en $_SESSION; leerla (getConnection()
// necesita clinic_id) sigue funcionando igual.
session_write_close();

require_once __DIR__ . '/db_connect.php';

function salir($code, $payload) { ob_end_clean(); http_response_code($code); echo json_encode($payload); exit; }
function body() { return json_decode(file_get_contents('php://input'), true) ?: []; }

/** Fecha legible en español para emails y notificaciones. */
function fecha_legible($dt) {
    $ts = strtotime($dt);
    $dias  = ['Sunday' => 'domingo', 'Monday' => 'lunes', 'Tuesday' => 'martes', 'Wednesday' => 'miércoles', 'Thursday' => 'jueves', 'Friday' => 'viernes', 'Saturday' => 'sábado'];
    $meses = [1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return $dias[date('l', $ts)] . ' ' . date('j', $ts) . ' de ' . $meses[(int) date('n', $ts)] . ' a las ' . date('H:i', $ts);
}

/** Crea la notificación del paciente en el portal. */
function crear_notificacion($conn, $client_id, $tipo, $titulo, $mensaje, $solicitud_id) {
    $stmt = $conn->prepare("INSERT INTO notificaciones (client_id, tipo, titulo, mensaje, solicitud_id) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('isssi', $client_id, $tipo, $titulo, $mensaje, $solicitud_id);
    $stmt->execute();
    $stmt->close();
}

/** Envía un email al paciente (best-effort; no rompe el flujo si falla). */
function email_paciente($email, $asunto, $titulo, $parrafo) {
    if (!$email || !filter_var($email, FILTER_VALIDATE_EMAIL) || strtolower($email) === 'no proporcionado') return;
    require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
    require_once __DIR__ . '/PHPMailer/src/SMTP.php';
    require_once __DIR__ . '/PHPMailer/src/Exception.php';
    $cfg  = require __DIR__ . '/../../config.secret.php';
    $smtp = $cfg['smtp'] ?? [];
    $html =
        '<div style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .
        '<tr><td style="background:#1e2a5e;border-radius:12px 12px 0 0;padding:20px 26px;"><span style="color:#fff;font-size:16px;font-weight:700;">HS Dental</span><span style="color:rgba(255,255,255,.6);font-size:12px;margin-left:10px;">Portal del paciente</span></td></tr>' .
        '<tr><td style="background:#ffffff;padding:28px 26px;"><p style="margin:0 0 10px;font-size:18px;font-weight:700;color:#111827;">' . htmlspecialchars($titulo) . '</p><p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">' . $parrafo . '</p></td></tr>' .
        '<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:14px 26px;text-align:center;"><p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental · Este es un correo automático.</p></td></tr>' .
        '</table></td></tr></table></div>';
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host = $smtp['host'] ?? 'smtp.ionos.es';
        $mail->SMTPAuth = true;
        $mail->Username = $smtp['user'] ?? '';
        $mail->Password = $smtp['pass'] ?? '';
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port = (int) ($smtp['port'] ?? 587);
        $mail->Timeout = 10;                       // conexion SMTP (defecto PHPMailer: 300 s)
        $mail->getSMTPInstance()->Timelimit = 15;  // espera de respuesta del servidor (idem)
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental');
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = $asunto;
        $mail->Body = $html;
        $mail->AltBody = $titulo . "\n\n" . trim(strip_tags($parrafo));
        $mail->send();
    } catch (\Throwable $e) {
        error_log('[solicitudes] email: ' . $mail->ErrorInfo);
    }
}

/** Carga una solicitud abierta con los datos del paciente. */
function cargar_solicitud($conn, $sid) {
    $stmt = $conn->prepare(
        "SELECT s.id, s.client_id, s.fecha_preferida, s.motivo, s.estado, c.nombre, c.email
         FROM solicitudes_cita s JOIN clients c ON s.client_id = c.id
         WHERE s.id = ? AND s.estado IN ('solicitada','contraoferta') LIMIT 1"
    );
    $stmt->bind_param('i', $sid);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row;
}

$conn = getConnection();
$accion = $_GET['accion'] ?? '';

// ------------------------------------------------------------------ GET

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if ($accion === 'count') {
        $r = $conn->query("SELECT COUNT(*) AS n FROM solicitudes_cita WHERE estado IN ('solicitada','contraoferta')");
        salir(200, ['count' => (int) ($r->fetch_assoc()['n'] ?? 0)]);
    }
    if ($accion === 'cliente') {
        // Historial de solicitudes de UN paciente (para su ficha).
        $cid = (int) ($_GET['client_id'] ?? 0);
        if ($cid <= 0) salir(400, ['error' => 'Falta el paciente.']);
        $stmt = $conn->prepare(
            "SELECT id, fecha_preferida, motivo, notas, estado, fecha_propuesta, respuesta_clinica, created_at
             FROM solicitudes_cita WHERE client_id = ? ORDER BY created_at DESC"
        );
        $stmt->bind_param('i', $cid);
        $stmt->execute();
        $res = $stmt->get_result();
        $items = [];
        while ($row = $res->fetch_assoc()) { $row['id'] = (int) $row['id']; $items[] = $row; }
        $stmt->close();
        salir(200, ['solicitudes' => $items]);
    }
    if ($accion === 'horarios') {
        // Rejilla de horas de la clinica de la sesion (para el selector de cita).
        $sede = ((int) ($_SESSION['clinic_id'] ?? 1)) === 2 ? 'mostoles' : 'alcorcon';
        $tardeFin = ($sede === 'mostoles') ? '19:30' : '20:00';
        $slots = [];
        foreach ([['09:30', '13:00'], ['16:30', $tardeFin]] as $h) {
            for ($t = strtotime($h[0]), $f = strtotime($h[1]); $t < $f; $t += 1800) $slots[] = date('H:i', $t);
        }
        salir(200, ['slots' => $slots]);
    }
    // pendientes (por defecto)
    $res = $conn->query(
        "SELECT s.id, s.client_id, s.fecha_preferida, s.motivo, s.notas, s.estado, s.fecha_propuesta, s.created_at,
                c.nombre, c.email, c.telefono
         FROM solicitudes_cita s JOIN clients c ON s.client_id = c.id
         WHERE s.estado IN ('solicitada','contraoferta')
         ORDER BY s.created_at ASC"
    );
    $items = [];
    while ($row = $res->fetch_assoc()) {
        $row['id'] = (int) $row['id'];
        $row['client_id'] = (int) $row['client_id'];
        $items[] = $row;
    }
    salir(200, ['solicitudes' => $items]);
}

// ----------------------------------------------------------------- POST

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { salir(405, ['error' => 'Método no permitido']); }

$d = body();

// "Dar cita" desde la ficha del paciente (sin solicitud previa): crea la cita
// directamente enlazada al paciente + notificación + email. No necesita solicitud_id.
if ($accion === 'dar-cita') {
    $clientId = (int) ($d['client_id'] ?? 0);
    if ($clientId <= 0) salir(400, ['error' => 'Falta el paciente.']);
    $ts = strtotime(str_replace('T', ' ', trim((string) ($d['fecha'] ?? ''))));
    if (!$ts || $ts <= time()) salir(400, ['error' => 'Elige una fecha y hora futuras.']);
    $fecha  = date('Y-m-d H:i:s', $ts);
    $medico = in_array(($d['medico'] ?? ''), ['med1', 'med2'], true) ? $d['medico'] : 'med1';
    $motivo = trim((string) ($d['motivo'] ?? ''));

    $stmt = $conn->prepare("SELECT nombre, email FROM clients WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $clientId);
    $stmt->execute();
    $cli = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$cli) salir(404, ['error' => 'Paciente no encontrado.']);

    $estado = 'Pendiente';
    $stmt = $conn->prepare("INSERT INTO appointments (client_id, cliente, servicio, fecha, medico, estado) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isssss', $clientId, $motivo, $cli['nombre'], $fecha, $medico, $estado);
    $stmt->execute();
    $stmt->close();

    $cuando = fecha_legible($fecha);
    crear_notificacion($conn, $clientId, 'cita_confirmada', 'Nueva cita programada',
        'La clínica te ha programado una cita para el ' . $cuando . '. La tienes en "Mis citas".', null);
    email_paciente($cli['email'], 'Tienes una nueva cita · HS Dental', 'Nueva cita programada',
        'La clínica te ha programado una cita para el <strong>' . htmlspecialchars($cuando) . '</strong>. Puedes verla en tu portal.');

    salir(200, ['success' => true, 'message' => 'Cita creada y avisado el paciente.']);
}

$sid = (int) ($d['solicitud_id'] ?? 0);
if ($sid <= 0) salir(400, ['error' => 'Falta la solicitud.']);

$sol = cargar_solicitud($conn, $sid);
if (!$sol) salir(404, ['error' => 'La solicitud ya no está disponible.']);
$clientId = (int) $sol['client_id'];

if ($accion === 'aceptar') {
    $medico = in_array(($d['medico'] ?? ''), ['med1', 'med2'], true) ? $d['medico'] : 'med1';
    $fecha  = $sol['fecha_preferida'];
    $obs    = (string) ($sol['motivo'] ?? '');
    $nombre = $sol['nombre'];
    $estado = 'Pendiente';

    // Crea la cita real ENLAZADA al paciente (client_id). Convención del panel:
    // servicio = nombre del paciente, cliente = observaciones/motivo.
    $stmt = $conn->prepare("INSERT INTO appointments (client_id, cliente, servicio, fecha, medico, estado) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isssss', $clientId, $obs, $nombre, $fecha, $medico, $estado);
    $stmt->execute();
    $apptId = $conn->insert_id;
    $stmt->close();

    $stmt = $conn->prepare("UPDATE solicitudes_cita SET estado = 'confirmada', appointment_id = ? WHERE id = ?");
    $stmt->bind_param('ii', $apptId, $sid);
    $stmt->execute();
    $stmt->close();

    $cuando = fecha_legible($fecha);
    crear_notificacion($conn, $clientId, 'cita_confirmada', 'Cita confirmada',
        'Tu cita ha quedado confirmada para el ' . $cuando . '. ¡Te esperamos!', $sid);
    email_paciente($sol['email'], 'Tu cita está confirmada · HS Dental', '¡Cita confirmada!',
        'Tu cita ha quedado confirmada para el <strong>' . htmlspecialchars($cuando) . '</strong>. Si no puedes acudir, avisa a la clínica con antelación.');

    salir(200, ['success' => true, 'message' => 'Cita confirmada y avisado el paciente.']);
}

if ($accion === 'rechazar') {
    $motivo = trim((string) ($d['motivo'] ?? ''));
    $stmt = $conn->prepare("UPDATE solicitudes_cita SET estado = 'rechazada', respuesta_clinica = ? WHERE id = ?");
    $mot = $motivo === '' ? null : $motivo;
    $stmt->bind_param('si', $mot, $sid);
    $stmt->execute();
    $stmt->close();

    $cuando = fecha_legible($sol['fecha_preferida']);
    $extra = $motivo !== '' ? ' Motivo: ' . $motivo . '.' : '';
    crear_notificacion($conn, $clientId, 'cita_rechazada', 'Solicitud no confirmada',
        'No hemos podido confirmar tu cita del ' . $cuando . '.' . $extra . ' Puedes pedir otra cuando quieras.', $sid);
    email_paciente($sol['email'], 'Tu solicitud de cita · HS Dental', 'No hemos podido confirmar tu cita',
        'No hemos podido confirmar tu cita del <strong>' . htmlspecialchars($cuando) . '</strong>.' . htmlspecialchars($extra) . ' Puedes solicitar otra desde el portal cuando quieras.');

    salir(200, ['success' => true, 'message' => 'Solicitud rechazada y avisado el paciente.']);
}

if ($accion === 'ofrecer') {
    $raw = trim((string) ($d['fecha_propuesta'] ?? ''));
    $ts  = strtotime(str_replace('T', ' ', $raw));
    if (!$ts || $ts <= time()) salir(400, ['error' => 'Propón una fecha y hora futuras.']);
    $fechaProp = date('Y-m-d H:i:s', $ts);
    $nota = trim((string) ($d['nota'] ?? ''));

    $stmt = $conn->prepare("UPDATE solicitudes_cita SET estado = 'contraoferta', fecha_propuesta = ?, respuesta_clinica = ? WHERE id = ?");
    $n = $nota === '' ? null : $nota;
    $stmt->bind_param('ssi', $fechaProp, $n, $sid);
    $stmt->execute();
    $stmt->close();

    $cuando = fecha_legible($fechaProp);
    $extra = $nota !== '' ? ' ' . $nota : '';
    crear_notificacion($conn, $clientId, 'cita_contraoferta', 'Nueva hora propuesta',
        'La clínica te propone el ' . $cuando . ' para tu cita.' . $extra . ' Ábrela para aceptar o rechazar.', $sid);
    email_paciente($sol['email'], 'Te proponemos otra hora · HS Dental', 'Te proponemos otra hora',
        'Para tu cita te proponemos el <strong>' . htmlspecialchars($cuando) . '</strong>.' . htmlspecialchars($extra) . ' Entra en el portal para aceptarla o rechazarla.');

    salir(200, ['success' => true, 'message' => 'Propuesta enviada al paciente.']);
}

salir(400, ['error' => 'Acción desconocida.']);
