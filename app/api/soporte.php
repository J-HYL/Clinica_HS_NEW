<?php
/**
 * soporte.php — Recibe reportes de soporte desde el widget flotante del panel.
 *
 * Entrada: POST multipart/form-data
 *   - mensaje       (texto, obligatorio)  descripción del problema
 *   - imagenes[]    (ficheros, opcional)  capturas de pantalla adjuntas
 *   - pagina        (texto, opcional)     URL de la pantalla desde donde se envía
 *
 * Envía un correo (con las imágenes adjuntas) al buzón de soporte usando
 * las credenciales SMTP de config.secret.php (mismo patrón que app/).
 * Requiere sesión iniciada (logged_in + clinic_id), igual que DB.php.
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

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean();
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

// Misma guardia de autenticación que el resto del panel.
if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id'])) {
    ob_end_clean();
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado o clínica no seleccionada']);
    exit;
}

require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

const SOPORTE_DESTINO = 'jhonrodrigohyl@gmail.com';
const MAX_FICHEROS     = 5;
const MAX_BYTES        = 5 * 1024 * 1024; // 5 MB por imagen
$TIPOS_PERMITIDOS      = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

$mensaje = trim($_POST['mensaje'] ?? '');
$pagina  = trim($_POST['pagina']  ?? '');

if ($mensaje === '') {
    ob_end_clean();
    http_response_code(400);
    echo json_encode(['error' => 'Describe el problema antes de enviar.']);
    exit;
}

// Recopila y valida las imágenes adjuntas (si las hay).
$adjuntos = [];
if (!empty($_FILES['imagenes']) && is_array($_FILES['imagenes']['name'])) {
    $n = count($_FILES['imagenes']['name']);
    if ($n > MAX_FICHEROS) {
        ob_end_clean();
        http_response_code(400);
        echo json_encode(['error' => 'Máximo ' . MAX_FICHEROS . ' imágenes por reporte.']);
        exit;
    }
    for ($i = 0; $i < $n; $i++) {
        if (($_FILES['imagenes']['error'][$i] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            continue;
        }
        $tmp  = $_FILES['imagenes']['tmp_name'][$i];
        $size = (int) $_FILES['imagenes']['size'][$i];
        $name = $_FILES['imagenes']['name'][$i];

        if ($size > MAX_BYTES) {
            ob_end_clean();
            http_response_code(400);
            echo json_encode(['error' => 'Cada imagen debe pesar menos de 5 MB.']);
            exit;
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime  = finfo_file($finfo, $tmp);
        finfo_close($finfo);
        if (!in_array($mime, $TIPOS_PERMITIDOS, true)) {
            ob_end_clean();
            http_response_code(400);
            echo json_encode(['error' => 'Solo se permiten imágenes (JPG, PNG, GIF o WEBP).']);
            exit;
        }
        $adjuntos[] = ['tmp' => $tmp, 'name' => basename($name), 'mime' => $mime];
    }
}

// Datos de contexto para saber quién reporta y desde dónde.
$cfg      = require __DIR__ . '/../../config.secret.php';
$smtp     = $cfg['smtp'] ?? [];
$usuario  = $_SESSION['user'] ?? 'desconocido';
$clinicId = (int) ($_SESSION['clinic_id'] ?? 0);
$clinica  = $clinicId === 1 ? 'Alcorcón' : ($clinicId === 2 ? 'Móstoles' : 'ID ' . $clinicId);
$host     = $_SERVER['SERVER_NAME'] ?? '';
$fecha    = date('d/m/Y H:i');

$hMensaje = nl2br(htmlspecialchars($mensaje));
$hPagina  = htmlspecialchars($pagina ?: '—');
$hUsuario = htmlspecialchars($usuario);
$hClinica = htmlspecialchars($clinica);
$hHost    = htmlspecialchars($host);
$nAdj     = count($adjuntos);

$body =
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Soporte HS Dental</title></head>' .
'<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .

'<tr><td style="background:#1e2a5e;border-radius:10px 10px 0 0;padding:18px 24px;">' .
'<span style="display:inline-block;background:#5671EB;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">SOPORTE · PANEL</span>' .
'<span style="color:rgba(255,255,255,0.55);font-size:11px;margin-left:12px;">' . $hClinica . ' &middot; ' . $fecha . '</span>' .
'</td></tr>' .

'<tr><td style="background:#ffffff;padding:28px;">' .
'<p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Problema reportado</p>' .
'<div style="background:#f8f9ff;border-left:3px solid #5671EB;padding:14px 16px;font-size:14px;color:#374151;line-height:1.6;border-radius:0 6px 6px 0;">' . $hMensaje . '</div>' .

'<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;width:110px;">Usuario</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hUsuario . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Clínica</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hClinica . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Pantalla</td><td style="padding:8px 12px;font-size:13px;color:#5671EB;border-bottom:1px solid #e5e7eb;word-break:break-all;">' . $hPagina . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Entorno</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hHost . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;">Adjuntos</td><td style="padding:8px 12px;font-size:13px;color:#111827;">' . $nAdj . ' imagen(es)</td></tr>' .
'</table>' .
'</td></tr>' .

'<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center;">' .
'<p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental &middot; Reporte automático desde el panel de gestión</p>' .
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
    $mail->CharSet    = 'UTF-8';

    $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental · Soporte');
    $mail->addAddress(SOPORTE_DESTINO);
    $mail->isHTML(true);
    $mail->Subject = 'Soporte panel · ' . $clinica . ' · ' . $usuario;
    $mail->Body    = $body;
    $mail->AltBody = strip_tags($mensaje) . "\n\nUsuario: $usuario\nClínica: $clinica\nPantalla: $pagina";

    foreach ($adjuntos as $a) {
        $mail->addAttachment($a['tmp'], $a['name'], PHPMailer::ENCODING_BASE64, $a['mime']);
    }

    $mail->send();
    ob_end_clean();
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['error' => 'No se pudo enviar el reporte.', 'detalle' => $mail->ErrorInfo]);
}
