<?php
/**
 * facturas_solicitudes.php — Solicitudes de factura del portal (lado clínica).
 *
 * El paciente pide la factura de un pago desde el portal -> aquí la clínica:
 *   GET  ?accion=count       nº de solicitudes de factura abiertas (badge campana)
 *   GET  ?accion=pendientes  lista de solicitudes abiertas (para la campana)
 *   POST ?accion=registrar   {payment_id, factura_numero, avisar}
 *                            marca la solicitud como 'generada' (o crea la fila si
 *                            la factura se generó sin solicitud previa) y, si
 *                            avisar=true, avisa al paciente por email + portal.
 *   POST ?accion=rechazar    {solicitud_id}  descarta una solicitud sin generar.
 *
 * Mismo guard/CORS/PHPMailer que solicitudes.php. Trabaja sobre la BD de la
 * clínica de la sesión (payments, facturas, solicitudes_factura, notificaciones,
 * clients).
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

require_once __DIR__ . '/db_connect.php';

function salir($code, $payload) { ob_end_clean(); http_response_code($code); echo json_encode($payload); exit; }
function body() { return json_decode(file_get_contents('php://input'), true) ?: []; }

/** Host del portal del paciente segun entorno (mismo mapeo que invitar_portal.php). */
function portalBase() {
    $env = currentEnv();
    return $env === 'prod' ? 'https://pacientes.hsdental.es'
         : ($env === 'pre' ? 'https://pre-pacientes.hsdental.es'
         : 'http://localhost:8082');
}

/**
 * Crea la notificación del paciente en el portal. `payment_id` (opcional) permite
 * el deep-link al detalle del pago (columna de la migracion 009); si la 009 aun no
 * esta aplicada, se inserta sin esa columna.
 */
function crear_notificacion($conn, $client_id, $tipo, $titulo, $mensaje, $payment_id = null) {
    $solicitud_id = null; // notificaciones.solicitud_id referencia solicitudes_cita; aquí no aplica.
    $tienePago = ($chk = $conn->query("SHOW COLUMNS FROM notificaciones LIKE 'payment_id'")) && $chk->num_rows > 0;
    if ($tienePago) {
        $stmt = $conn->prepare("INSERT INTO notificaciones (client_id, tipo, titulo, mensaje, solicitud_id, payment_id) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('isssii', $client_id, $tipo, $titulo, $mensaje, $solicitud_id, $payment_id);
    } else {
        $stmt = $conn->prepare("INSERT INTO notificaciones (client_id, tipo, titulo, mensaje, solicitud_id) VALUES (?, ?, ?, ?, ?)");
        $stmt->bind_param('isssi', $client_id, $tipo, $titulo, $mensaje, $solicitud_id);
    }
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
        $mail->CharSet = 'UTF-8';
        $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental');
        $mail->addAddress($email);
        $mail->isHTML(true);
        $mail->Subject = $asunto;
        $mail->Body = $html;
        $mail->AltBody = $titulo . "\n\n" . trim(strip_tags($parrafo));
        $mail->send();
    } catch (\Throwable $e) {
        error_log('[facturas_solicitudes] email: ' . $mail->ErrorInfo);
    }
}

$conn = getConnection();
$accion = $_GET['accion'] ?? '';

// ------------------------------------------------------------------ GET

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Antes de aplicar la migración 008 la tabla puede no existir; la campana
    // consulta este endpoint en todas las pantallas, así que degradamos a 0/vacío
    // en vez de romper.
    $chk = $conn->query("SHOW TABLES LIKE 'solicitudes_factura'");
    if (!$chk || $chk->num_rows === 0) {
        salir(200, $accion === 'count' ? ['count' => 0] : ['solicitudes' => []]);
    }
    if ($accion === 'count') {
        $r = $conn->query("SELECT COUNT(*) AS n FROM solicitudes_factura WHERE estado = 'solicitada'");
        salir(200, ['count' => (int) ($r->fetch_assoc()['n'] ?? 0)]);
    }
    // pendientes (por defecto): solicitudes abiertas con datos del pago y paciente.
    $res = $conn->query(
        "SELECT sf.id, sf.client_id, sf.payment_id, sf.created_at,
                p.monto, p.fecha_pago, p.metodo_pago, p.treatment_id,
                c.nombre
         FROM solicitudes_factura sf
         JOIN payments p ON sf.payment_id = p.id
         JOIN clients  c ON sf.client_id  = c.id
         WHERE sf.estado = 'solicitada'
         ORDER BY sf.created_at ASC"
    );
    $items = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $row['id']           = (int) $row['id'];
            $row['client_id']    = (int) $row['client_id'];
            $row['payment_id']   = (int) $row['payment_id'];
            $row['treatment_id'] = (int) $row['treatment_id'];
            $items[] = $row;
        }
    }
    salir(200, ['solicitudes' => $items]);
}

// ----------------------------------------------------------------- POST

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { salir(405, ['error' => 'Método no permitido']); }

$d = body();

if ($accion === 'rechazar') {
    $sid = (int) ($d['solicitud_id'] ?? 0);
    if ($sid <= 0) salir(400, ['error' => 'Falta la solicitud.']);
    $stmt = $conn->prepare("UPDATE solicitudes_factura SET estado = 'rechazada' WHERE id = ? AND estado = 'solicitada'");
    $stmt->bind_param('i', $sid);
    $stmt->execute();
    $stmt->close();
    salir(200, ['success' => true, 'message' => 'Solicitud descartada.']);
}

if ($accion === 'registrar') {
    $paymentId = (int) ($d['payment_id'] ?? 0);
    $numero    = (int) ($d['factura_numero'] ?? 0);
    $avisar    = !empty($d['avisar']);
    if ($paymentId <= 0) salir(400, ['error' => 'Falta el pago.']);

    // Paciente + importe del pago (de la BD de la clínica de la sesión).
    $stmt = $conn->prepare(
        "SELECT p.client_id, p.monto, c.nombre, c.email
         FROM payments p JOIN clients c ON p.client_id = c.id
         WHERE p.id = ? LIMIT 1"
    );
    $stmt->bind_param('i', $paymentId);
    $stmt->execute();
    $pago = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$pago) salir(404, ['error' => 'Pago no encontrado.']);
    $clientId = (int) $pago['client_id'];

    // Resolver la factura recién creada por su número correlativo.
    $facturaId = null;
    if ($numero > 0) {
        $stmt = $conn->prepare("SELECT id FROM facturas WHERE numero_factura = ? LIMIT 1");
        $stmt->bind_param('i', $numero);
        $stmt->execute();
        $f = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($f) $facturaId = (int) $f['id'];
    }

    $avisadoFlag = $avisar ? 1 : 0;

    // ¿Había una solicitud abierta para este pago? -> marcarla generada.
    // Si no, registrar una fila 'generada' (generación proactiva) para que el
    // portal pueda mostrar "factura emitida" en ese pago.
    $stmt = $conn->prepare("SELECT id FROM solicitudes_factura WHERE payment_id = ? AND estado = 'solicitada' ORDER BY id DESC LIMIT 1");
    $stmt->bind_param('i', $paymentId);
    $stmt->execute();
    $sol = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($sol) {
        $sid = (int) $sol['id'];
        $stmt = $conn->prepare("UPDATE solicitudes_factura SET estado = 'generada', factura_id = ?, factura_numero = ?, avisado = ? WHERE id = ?");
        $stmt->bind_param('iiii', $facturaId, $numero, $avisadoFlag, $sid);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare("INSERT INTO solicitudes_factura (client_id, payment_id, estado, factura_id, factura_numero, avisado) VALUES (?, ?, 'generada', ?, ?, ?)");
        $stmt->bind_param('iiiii', $clientId, $paymentId, $facturaId, $numero, $avisadoFlag);
        $stmt->execute();
        $stmt->close();
    }

    if ($avisar) {
        $inicial = ((int) ($_SESSION['clinic_id'] ?? 1)) === 2 ? 'M' : 'A';
        $ref = $numero > 0 ? ' (nº HSD-' . $inicial . '-' . $numero . ')' : '';
        $importe = number_format((float) $pago['monto'], 2, ',', '.') . ' €';
        $titulo  = 'Factura disponible';
        $mensaje = 'La clínica ha emitido tu factura' . $ref . ' por tu pago de ' . $importe . '. Ya puedes descargarla desde tu portal.';
        crear_notificacion($conn, $clientId, 'factura_emitida', $titulo, $mensaje, $paymentId);
        $portal = portalBase();
        $parrafo = 'La clínica ha emitido tu factura' . htmlspecialchars($ref) . ' por tu pago de <strong>' . htmlspecialchars($importe) . '</strong>. Ya puedes <strong>descargarla desde tu portal</strong>.'
                 . '<div style="text-align:center;margin:22px 0 4px;"><a href="' . htmlspecialchars($portal) . '" style="display:inline-block;background:#5671EB;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:10px;">Ir a mi portal</a></div>';
        email_paciente($pago['email'], 'Tu factura está disponible · HS Dental', 'Factura disponible', $parrafo);
        salir(200, ['success' => true, 'message' => 'Factura registrada y paciente avisado.']);
    }

    salir(200, ['success' => true, 'message' => 'Factura registrada.']);
}

salir(400, ['error' => 'Acción desconocida.']);
