<?php
// portal/api/mailer.php
// Envio de correo del portal (reset de contrasena). Reusa la libreria PHPMailer
// ya vendorizada en el panel (app/api/PHPMailer): app/ y portal/ son carpetas
// HERMANAS en el mismo webspace, asi que la ruta relativa resuelve igual en
// local, pre y prod. Si algun dia se mueve PHPMailer, cambiar solo PHPMAILER_DIR.

require_once __DIR__ . '/db_connect.php';

const PHPMAILER_DIR = __DIR__ . '/../../app/api/PHPMailer/src';

/**
 * Envia un correo HTML. Devuelve true/false (no lanza; registra en error_log).
 */
function portal_enviar_email($destino, $asunto, $html, $altBody = '') {
    if (!is_file(PHPMAILER_DIR . '/PHPMailer.php')) {
        error_log('[portal] PHPMailer no encontrado en ' . PHPMAILER_DIR);
        return false;
    }
    require_once PHPMAILER_DIR . '/PHPMailer.php';
    require_once PHPMAILER_DIR . '/SMTP.php';
    require_once PHPMAILER_DIR . '/Exception.php';

    $smtp = portalConfig()['smtp'] ?? [];
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $smtp['host'] ?? 'smtp.ionos.es';
        $mail->SMTPAuth   = true;
        $mail->Username   = $smtp['user'] ?? '';
        $mail->Password   = $smtp['pass'] ?? '';
        $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int) ($smtp['port'] ?? 587);
        $mail->CharSet    = 'UTF-8';
        $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental');
        $mail->addAddress($destino);
        $mail->isHTML(true);
        $mail->Subject = $asunto;
        $mail->Body    = $html;
        $mail->AltBody = $altBody !== '' ? $altBody : trim(strip_tags($html));
        $mail->send();
        return true;
    } catch (\Throwable $e) {
        error_log('[portal] Error al enviar email: ' . $mail->ErrorInfo);
        return false;
    }
}
