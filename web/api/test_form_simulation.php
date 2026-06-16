<?php
// test_form_simulation.php - Simula exactamente lo que hace el formulario
require_once __DIR__ . '/db_connect_public.php';
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

// Configuración de depuración
error_reporting(E_ALL);
ini_set('display_errors', 1);
ini_set('log_errors', 1);

echo "<!DOCTYPE html>
<html lang='es'>
<head>
    <meta charset='UTF-8'>
    <title>Simulación de envío de formulario</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .debug { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; font-family: monospace; font-size: 14px; }
        h1, h2 { color: #2c3e50; }
    </style>
</head>
<body>
    <div class='container'>
        <h1>Simulación de envío de formulario de contacto</h1>
";

// Simular datos de formulario
$formData = [
    'name'    => 'Juan Pérez',
    'email'   => 'jhonrodrigohyl@gmail.com', // Cambia esto a un email real para probar
    'phone'   => '600 123 456',
    'clinic'  => 'mostoles',
    'service' => 'Implantes dentales',
    'message' => 'Quisiera solicitar información sobre precios y disponibilidad para implantes dentales.'
];

echo "<h2>Datos simulados del formulario:</h2>";
echo "<pre>";
print_r($formData);
echo "</pre>";

// Función de envío de email (copiada de contacto.php)
function sendEmail($to, $subject, $body) {
    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = 'smtp.ionos.es';
        $mail->SMTPAuth   = true;
        $mail->Username   = 'avisos@hsdental.es';
        $mail->Password   = 'Jjbinks1999$';
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587;
        $mail->CharSet    = 'UTF-8';
        $mail->setFrom('avisos@hsdental.es', 'HSDental');
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $body;
        $mail->AltBody = strip_tags($body);
        // Enable SMTP debug output for logging
        $mail->SMTPDebug = 4; // Nivel máximo de depuración
        $mail->Debugoutput = function($str, $level) {
            echo "<script>document.getElementById('debug-output').innerHTML += 'SMTP DEBUG: ' + '$str' + '<br>';</script>";
            flush();
            ob_flush();
            error_log("SMTP DEBUG: $str");
        };
        $mail->send();
        error_log("Email sent successfully to $to");
        return true;
    } catch (Exception $e) {
        error_log("Email sending failed to $to: " . $e->getMessage());
        return $e->getMessage();
    }
}

// Procesar como lo hace el formulario
$name    = trim($formData['name']    ?? '');
$email   = trim($formData['email']   ?? '');
$phone   = trim($formData['phone']   ?? '');
$clinic  = trim($formData['clinic']  ?? '');
$service = trim($formData['service'] ?? '');
$message = trim($formData['message'] ?? '');

echo "<h2>Validación de datos:</h2>";
if (!$name || !$email || !$clinic) {
    echo "<p class='error'>Error: Faltan campos requeridos</p>";
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    echo "<p class='error'>Error: Email inválido: $email</p>";
    exit;
}

echo "<p>Datos válidos. Continuando...</p>";

// Simular guardado en base de datos (solo para completar el flujo)
echo "<p>Simulando guardado en base de datos...</p>";
// En realidad no guardamos para no llenar la BD de prueba

// Preparar datos para los emails
$clinicNombre = (stripos($clinic, 'most') !== false) ? 'Móstoles' : 'Alcorcón';
$clinicTel    = (stripos($clinic, 'most') !== false) ? '+34 678 48 45 39' : '+34 916 18 24 24';
$hn = htmlspecialchars($name);
$he = htmlspecialchars($email);
$hp = htmlspecialchars($phone);
$hc = htmlspecialchars($clinicNombre);
$hs = htmlspecialchars($service);
$hm = nl2br(htmlspecialchars($message));
$fecha = date('d/m/Y H:i');

// EMAIL PARA EL ADMIN
echo "<h2>Preparando email para administrador...</h2>";
$adminBody =
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Nuevo contacto</title></head>' .
'<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">' .

'<tr><td style="background:#1e2a5e;border-radius:10px 10px 0 0;padding:16px 24px;">' .
'<span style="display:inline-block;background:#5671EB;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:0.5px;">NUEVO CONTACTO</span>' .
'<span style="color:rgba(255,255,255,0.5);font-size:11px;margin-left:12px;">' . $hc . ' &middot; ' . $fecha . '</span>' .
'</td></tr>' .

'<tr><td style="background:#ffffff;padding:28px;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;width:90px;">Nombre</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hn . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Email</td><td style="padding:8px 12px;font-size:13px;color:#5671EB;border-bottom:1px solid #e5e7eb;">' . $he . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Telefono</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hp . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;border-bottom:1px solid #e5e7eb;">Clinica</td><td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;">' . $hc . '</td></tr>' .
'<tr><td style="padding:8px 12px;background:#f9fafb;color:#6b7280;font-size:13px;">Servicio</td><td style="padding:8px 12px;font-size:13px;color:#111827;">' . $hs . '</td></tr>' .
'</table>' .
($message ? '<div style="margin-top:18px;"><p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Mensaje</p><div style="background:#f8f9ff;border-left:3px solid #5671EB;padding:14px 16px;font-size:13px;color:#374151;line-height:1.6;">' . $hm . '</div></div>' : '') .
'<div style="text-align:center;margin-top:20px;"><a href="mailto:' . $he . '" style="display:inline-block;background:#5671EB;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:11px 28px;border-radius:8px;">Responder a ' . $hn . '</a></div>' .
'</td></tr>' .

'<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center;">' .
'<p style="margin:0;font-size:12px;color:#9ca3af;">HSDental &middot; Aviso interno automatico</p>' .
'</td></tr>' .

'</table></td></tr></table></body></html>';

// EMAIL PARA EL USUARIO
echo "<h2>Preparando email para usuario...</h2>";
$userBody =
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>HSDental - Confirmacion</title></head>' .
'<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;"><tr><td align="center">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .

'<tr><td style="background:#3a56d4;border-radius:12px 12px 0 0;padding:36px 40px;text-align:center;">' .
'<img src="https://hsdental.es/assets/LOGO_HS.png" alt="HSDental" width="68" height="68" style="border-radius:50%;background:#ffffff;padding:8px;display:block;margin:0 auto 16px;">' .
'<h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Mensaje recibido</h1>' .
'<p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Nos pondremos en contacto muy pronto</p>' .
'</td></tr>' .

'<tr><td style="background:#ffffff;padding:36px 40px;">' .
'<p style="margin:0 0 20px;font-size:15px;color:#374151;">Hola <strong style="color:#111827;">' . $hn . '</strong>,</p>' .
'<p style="margin:0 0 28px;font-size:15px;color:#374151;line-height:1.6;">Hemos recibido tu consulta en nuestra clínica de <strong>' . $hc . '</strong>. Nuestro equipo la revisará y te contactará en menos de 24 horas.</p>' .

'<div style="background:#f8f9ff;border:1px solid #e0e4ff;border-radius:8px;padding:20px 24px;margin-bottom:28px;">' .
'<p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#5671EB;text-transform:uppercase;letter-spacing:0.8px;">Resumen de tu consulta</p>' .
'<table width="100%" cellpadding="0" cellspacing="0">' .
'<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:100px;">Clinica</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;">' . $hc . '</td></tr>' .
($service ? '<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Servicio</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;">' . $hs . '</td></tr>' : '') .
'</table>' .
($message ? '<div style="margin-top:14px;background:#ffffff;border-left:3px solid #5671EB;padding:12px 16px;border-radius:0 6px 6px 0;font-size:14px;color:#374151;line-height:1.6;">' . $hm . '</div>' : '') .
'</div>' .

'<div style="text-align:center;margin-bottom:24px;"><a href="https://hsdental.es" style="display:inline-block;background:#5671EB;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:13px 32px;border-radius:8px;">Visitar nuestra web</a></div>' .
'<p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">¿Prefieres llamarnos? <a href="tel:' . $clinicTel . '" style="color:#5671EB;text-decoration:none;font-weight:600;">' . $clinicTel . '</a></p>' .
'</td></tr>' .

'<tr><td style="background:#1e2a5e;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">' .
'<p style="margin:0 0 6px;color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">HSDental</p>' .
'<p style="margin:0;color:rgba(255,255,255,0.45);font-size:12px;">Correo automático, por favor no respondas a este email.</p>' .
'</td></tr>' .

'</table></td></tr></table></body></html>';

// Enviar emails
echo "<h2>Enviando emails...</h2>";
echo "<div class='debug' id='debug-output'>
        <strong>Iniciando envío de emails...</strong><br>
      </div>";

$r1 = sendEmail('hsdental00@gmail.com', 'Nuevo contacto - ' . $hc, $adminBody);
$r2 = sendEmail($email, 'HSDental - Hemos recibido tu consulta', $userBody);

$errors = [];
if ($r1 !== true) $errors['admin']   = $r1;
if ($r2 !== true) $errors['usuario'] = $r2;

echo "<h2>Resultados:</h2>";
if (empty($errors)) {
    echo "<p class='success'>¡Ambos emails enviados correctamente!</p>";
} else {
    echo "<p class='error'>Errores en el envío:</p>";
    echo "<ul>";
    foreach ($errors as $key => $value) {
        echo "<li><strong>$key:</strong> $value</li>";
    }
    echo "</ul>";
}

// Mostrar lo que se guardaría en BD
echo "<h2>Datos que se guardarían en base de datos:</h2>";
echo "<pre>";
print_r([
    'nombre' => $name,
    'email' => $email,
    'telefono' => $phone,
    'clinic' => $clinic,
    'mensaje' => $message
]);
echo "</pre>";

echo "
        <hr>
        <h2>Instrucciones:</h2>
        <ol>
            <li>Revisa arriba los mensajes de depuración SMTP para ver si hubo errores</li>
            <li>Revisa si recibiste los emails en las cuentas configuradas</li>
            <li>Si no los recibiste, revisa la carpeta de spam</li>
        </ol>

        <p><em>Nota: Cambia la dirección de email en \$formData['email'] por una real que puedas revisar.</em></p>
    </div>
</body>
</html>";
?>