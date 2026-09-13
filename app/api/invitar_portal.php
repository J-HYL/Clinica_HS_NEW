<?php
/**
 * invitar_portal.php — Invita a un paciente al Portal de Pacientes.
 *
 * Lo dispara el personal desde la ficha del panel (boton "Invitar al portal").
 * Crea/actualiza la cuenta del paciente en `portal_users` (estado 'invitado' +
 * token de un solo uso, 72 h) en la BD de la clinica de la sesion, y le envia un
 * email con el enlace de activacion (pacientes.hsdental.es/activar.html?token=).
 *
 * Mismo guard de autenticacion, CORS y patron PHPMailer que DB.php / soporte.php.
 */

session_start();
ob_start();
header('Content-Type: application/json');

$allowedOrigins = ['https://app.hsdental.es', 'https://pre.hsdental.es'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($reqOrigin, $allowedOrigins, true) ? $reqOrigin : 'https://app.hsdental.es'));
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { ob_end_clean(); http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { ob_end_clean(); http_response_code(405); echo json_encode(['error' => 'Método no permitido']); exit; }

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
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/** Responde JSON y termina, limpiando el buffer (para no ensuciar el JSON). */
function salir($code, $payload) { ob_end_clean(); http_response_code($code); echo json_encode($payload); exit; }

$body = json_decode(file_get_contents('php://input'), true);
$clientId = (int) ($body['client_id'] ?? 0);
if ($clientId <= 0) salir(400, ['error' => 'Falta el paciente.']);

$clinicId = (int) $_SESSION['clinic_id'];
$sede = $clinicId === 1 ? 'alcorcon' : ($clinicId === 2 ? 'mostoles' : null);
if ($sede === null) salir(400, ['error' => 'Clínica no válida.']);

$conn = getConnection();

// Paciente + su email.
$stmt = $conn->prepare("SELECT id, nombre, email FROM clients WHERE id = ? LIMIT 1");
$stmt->bind_param('i', $clientId);
$stmt->execute();
$cliente = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$cliente) salir(404, ['error' => 'Paciente no encontrado.']);

$email = strtolower(trim((string) $cliente['email']));
if ($email === '' || $email === 'no proporcionado' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    salir(400, ['error' => 'Este paciente no tiene un email válido. Añádelo en su ficha antes de invitarlo.']);
}

// El email es UNIQUE en portal_users: ¿lo usa ya OTRO paciente?
$stmt = $conn->prepare("SELECT client_id FROM portal_users WHERE email = ? AND client_id <> ? LIMIT 1");
$stmt->bind_param('si', $email, $clientId);
$stmt->execute();
$conflicto = $stmt->get_result()->fetch_assoc();
$stmt->close();
if ($conflicto) salir(409, ['error' => 'Ese email ya está asignado a otro paciente del portal.']);

// ¿Ya existe cuenta para este paciente?
$stmt = $conn->prepare("SELECT id, estado FROM portal_users WHERE client_id = ? LIMIT 1");
$stmt->bind_param('i', $clientId);
$stmt->execute();
$existente = $stmt->get_result()->fetch_assoc();
$stmt->close();

if ($existente && $existente['estado'] === 'activo') {
    salir(200, ['success' => true, 'message' => 'Este paciente ya tiene el portal activado. Si no puede entrar, que use "He olvidado mi contraseña".']);
}

// Token de invitacion (72 h). Se guarda el HASH; el token en claro solo va por email.
$token     = bin2hex(random_bytes(32));
$tokenHash = hash('sha256', $token);
$expira    = date('Y-m-d H:i:s', time() + 72 * 3600);

if ($existente) {
    $id = (int) $existente['id'];
    $stmt = $conn->prepare("UPDATE portal_users SET email = ?, sede = ?, estado = 'invitado', invite_token_hash = ?, invite_expira = ? WHERE id = ?");
    $stmt->bind_param('ssssi', $email, $sede, $tokenHash, $expira, $id);
} else {
    $stmt = $conn->prepare("INSERT INTO portal_users (client_id, sede, email, estado, invite_token_hash, invite_expira) VALUES (?, ?, ?, 'invitado', ?, ?)");
    $stmt->bind_param('issss', $clientId, $sede, $email, $tokenHash, $expira);
}
if (!$stmt->execute()) { $stmt->close(); $conn->close(); salir(500, ['error' => 'No se pudo registrar la invitación.']); }
$stmt->close();
$conn->close();

// URL publica del portal por entorno (mismo criterio que portal/api/db_connect.php).
$env = currentEnv();
$portalBase = $env === 'prod' ? 'https://pacientes.hsdental.es'
            : ($env === 'pre' ? 'https://pre-pacientes.hsdental.es'
            : 'http://localhost:8082');
$enlace = $portalBase . '/activar.html?token=' . rawurlencode($token);

// --- Email de invitacion ---
$cfg    = require __DIR__ . '/../../config.secret.php';
$smtp   = $cfg['smtp'] ?? [];
$nombre = htmlspecialchars($cliente['nombre'] ?? '');
$hEnlace = htmlspecialchars($enlace);

$bodyHtml =
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Tu acceso al portal · HS Dental</title></head>' .
'<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .
'<tr><td style="background:#1e2a5e;border-radius:12px 12px 0 0;padding:20px 26px;">' .
'<span style="color:#fff;font-size:16px;font-weight:700;">HS Dental</span>' .
'<span style="color:rgba(255,255,255,.6);font-size:12px;margin-left:10px;">Portal del paciente</span>' .
'</td></tr>' .
'<tr><td style="background:#ffffff;padding:28px 26px;">' .
'<p style="margin:0 0 12px;font-size:16px;color:#111827;">Hola ' . $nombre . ' 👋</p>' .
'<p style="margin:0 0 18px;font-size:14px;color:#374151;line-height:1.6;">Tu clínica te ha creado un acceso al <strong>portal del paciente</strong>, donde podrás ver tus tratamientos, tus pagos y tus citas, y pedir cita desde el móvil. Pulsa el botón para elegir tu contraseña y activar tu acceso:</p>' .
'<div style="text-align:center;margin:6px 0 4px;"><a href="' . $hEnlace . '" style="display:inline-block;background:#5671EB;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:10px;">Activar mi acceso</a></div>' .
'<p style="margin:18px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">Este enlace caduca en 72 horas. Si no esperabas este correo, puedes ignorarlo.</p>' .
'</td></tr>' .
'<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:14px 26px;text-align:center;">' .
'<p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental · Este es un correo automático.</p>' .
'</td></tr>' .
'</table></td></tr></table></body></html>';

$mail = new PHPMailer(true);
try {
    $mail->isSMTP();
    $mail->Host       = $smtp['host'] ?? 'smtp.ionos.es';
    $mail->SMTPAuth   = true;
    $mail->Username   = $smtp['user'] ?? '';
    $mail->Password   = $smtp['pass'] ?? '';
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = (int) ($smtp['port'] ?? 587);
    $mail->Timeout = 10;                       // conexion SMTP (defecto PHPMailer: 300 s)
    $mail->getSMTPInstance()->Timelimit = 15;  // espera de respuesta del servidor (idem)
    $mail->CharSet    = 'UTF-8';
    $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental');
    $mail->addAddress($email);
    $mail->isHTML(true);
    $mail->Subject = 'Tu acceso al portal de HS Dental';
    $mail->Body    = $bodyHtml;
    $mail->AltBody = "Hola $nombre, tu clinica te ha creado un acceso al portal del paciente. Activalo aqui (caduca en 72 h): $enlace";
    $mail->send();
    salir(200, ['success' => true, 'message' => 'Invitación enviada a ' . $email . '.']);
} catch (Exception $e) {
    // La cuenta quedo guardada pero el email fallo: se puede reintentar el envio.
    salir(500, ['error' => 'La invitación se guardó pero no se pudo enviar el email. Vuelve a intentarlo.', 'detalle' => $mail->ErrorInfo]);
}
