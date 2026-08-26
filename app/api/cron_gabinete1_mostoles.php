<?php
/**
 * cron_gabinete1_mostoles.php
 *
 * Envío diario (pensado para las 06:00 Europe/Madrid) a hsdental00@gmail.com con
 * las citas de GABINETE 1 (medico = 'med1') de la clínica de MÓSTOLES en
 * PRODUCCIÓN, para el día en curso, EXCLUYENDO las canceladas.
 *
 * El correo saluda al doctor, lista las citas de hoy y ofrece añadirlas:
 *   - a Google Calendar: un enlace por cita, y un botón para suscribirse a TODA
 *     la agenda de Gabinete 1 de una vez (feed .ics).
 *   - al calendario predeterminado (iPhone/Apple, Outlook…): archivo .ics adjunto
 *     con las citas de hoy.
 *
 * Formas de ejecutarlo (usa la que te permita el panel de IONOS):
 *   - CLI:  php8.x /ruta/al/webspace/app/api/cron_gabinete1_mostoles.php
 *   - URL:  https://app.hsdental.es/api/cron_gabinete1_mostoles.php?token=EL_TOKEN
 *           (el token se define en config.secret.php -> 'cron_token')
 */

date_default_timezone_set('Europe/Madrid');

const CRON_DESTINO   = 'hsdental00@gmail.com';
// Base pública de producción (para construir el enlace de suscripción de Google).
const AGENDA_BASE_URL = 'https://app.hsdental.es';

$esCli = (php_sapi_name() === 'cli');

$cfg = require __DIR__ . '/../../config.secret.php';

// --- Seguridad: por navegador (no CLI) exigimos token válido ---
if (!$esCli) {
    header('Content-Type: text/plain; charset=utf-8');
    $tokenEsperado = $cfg['cron_token'] ?? '';
    $tokenRecibido = $_GET['token'] ?? '';
    if ($tokenEsperado === '' || !hash_equals($tokenEsperado, $tokenRecibido)) {
        http_response_code(403);
        echo 'Prohibido';
        exit;
    }
}

require_once __DIR__ . '/agenda_gabinete1_mostoles_lib.php';
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/** Escribe un aviso y termina, adaptándose a CLI o web. */
function terminar($msg, $codigo = 0) {
    global $esCli;
    if ($esCli) {
        fwrite($codigo === 0 ? STDOUT : STDERR, $msg . "\n");
    } else {
        echo $msg;
    }
    exit($codigo);
}

// --- Fecha objetivo: hoy por defecto; se puede pedir otra SOLO para pruebas ---
// URL:  ...?dia=manana   o   ...?fecha=YYYY-MM-DD   (requiere token, ya validado)
// CLI:  php cron_gabinete1_mostoles.php manana   |   php ... 2026-07-15
$hoy = date('Y-m-d');
$dia = $hoy;
$origen = $esCli ? ($argv[1] ?? '') : (($_GET['fecha'] ?? '') ?: ($_GET['dia'] ?? ''));
if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $origen)) {
    $dia = $origen;
} elseif ($origen === 'manana') {
    $dia = date('Y-m-d', strtotime('+1 day'));
}
$esHoy = ($dia === $hoy);

// --- Citas de Gabinete 1 (med1) de ese día, sin canceladas ---
try {
    $conn  = agendaConexionMostolesProd($cfg);
    $citas = agendaCitasGab1($conn, $dia, $dia);
    $conn->close();
} catch (Throwable $e) {
    terminar($e->getMessage(), 1);
}

$fechaLegible = date('d/m/Y', strtotime($dia));
$diaFrase = $esHoy ? 'de hoy' : ('del ' . $fechaLegible);
$total = count($citas);

// Enlace para suscribir TODA la agenda de Gabinete 1 en Google (feed .ics).
$feedUrl = AGENDA_BASE_URL . '/api/agenda_gabinete1_mostoles_ics.php?token=' . rawurlencode($cfg['cron_token'] ?? '');
$googleSubscribeUrl = 'https://calendar.google.com/calendar/render?cid=' . rawurlencode($feedUrl);

// --- Filas de la tabla del correo ---
$filas = '';
foreach ($citas as $cita) {
    $paciente = trim($cita['servicio'] ?? '') ?: 'Sin nombre'; // 'servicio' = Paciente
    $obs      = trim($cita['cliente']  ?? '');                 // 'cliente'  = Observaciones

    try {
        $horaTxt = (new DateTime($cita['fecha']))->format('H:i');
    } catch (Exception $e) {
        continue;
    }

    $gcal = agendaGoogleEventUrl($cita['fecha'], $paciente . ' (Gabinete 1)', $obs);
    $hp = htmlspecialchars($paciente);
    $ho = htmlspecialchars($obs);

    $filas .=
        '<tr>' .
        '<td style="padding:12px;border-bottom:1px solid #eef0f4;font-size:14px;font-weight:700;color:#1e2a5e;white-space:nowrap;vertical-align:top;">' . $horaTxt . '</td>' .
        '<td style="padding:12px;border-bottom:1px solid #eef0f4;font-size:14px;color:#111827;vertical-align:top;">' .
            '<div style="font-weight:600;">' . $hp . '</div>' .
            ($obs !== '' ? '<div style="font-size:12px;color:#6b7280;margin-top:2px;">' . $ho . '</div>' : '') .
        '</td>' .
        '<td style="padding:12px;border-bottom:1px solid #eef0f4;text-align:right;vertical-align:top;white-space:nowrap;">' .
            '<a href="' . $gcal . '" style="display:inline-block;background:#5671EB;color:#fff;text-decoration:none;font-size:12px;font-weight:600;padding:7px 12px;border-radius:6px;">+ Google</a>' .
        '</td>' .
        '</tr>';
}

// --- Cuerpo del correo ---
if ($total > 0) {
    $cuerpo =
        '<p style="margin:0 0 6px;font-size:16px;color:#111827;">Hola doctor 👋</p>' .
        '<p style="margin:0 0 18px;font-size:14px;color:#374151;">Estas son tus citas <strong>' . $diaFrase . '</strong> en <strong>Gabinete 1</strong> (Móstoles):</p>' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;border-collapse:separate;">' . $filas . '</table>' .

        '<div style="margin-top:22px;text-align:center;">' .
        '<a href="' . $googleSubscribeUrl . '" style="display:inline-block;background:#3a56d4;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 22px;border-radius:8px;">📅 Añadir todas a Google Calendar</a>' .
        '</div>' .
        '<p style="margin:10px 0 0;font-size:12px;color:#9ca3af;text-align:center;">Suscribe toda tu agenda de Gabinete 1 de una vez (se mantiene actualizada).</p>' .

        '<div style="margin-top:20px;background:#f8f9ff;border:1px solid #e0e4ff;border-radius:8px;padding:14px 16px;">' .
        '<p style="margin:0;font-size:13px;color:#374151;">📎 <strong>¿iPhone u otro calendario?</strong> Abre el archivo adjunto <strong>citas.ics</strong> desde este correo y se añadirán las citas a tu calendario predeterminado.</p>' .
        '</div>';
} else {
    $cuerpo =
        '<p style="margin:0 0 6px;font-size:16px;color:#111827;">Hola doctor 👋</p>' .
        '<p style="margin:0;font-size:14px;color:#374151;">No tienes citas <strong>' . $diaFrase . '</strong> en <strong>Gabinete 1</strong> (Móstoles). ¡Buen día!</p>';
}

$body =
'<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Tus citas de hoy · Gabinete 1</title></head>' .
'<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
'<table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">' .

'<tr><td style="background:#1e2a5e;border-radius:10px 10px 0 0;padding:18px 24px;">' .
'<span style="display:inline-block;background:#5671EB;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;letter-spacing:.5px;">AGENDA DIARIA</span>' .
'<span style="color:rgba(255,255,255,.6);font-size:12px;margin-left:12px;">Gabinete 1 &middot; Móstoles &middot; ' . $fechaLegible . '</span>' .
'</td></tr>' .

'<tr><td style="background:#ffffff;padding:26px;">' . $cuerpo . '</td></tr>' .

'<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 10px 10px;padding:14px 24px;text-align:center;">' .
'<p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental &middot; Aviso automático diario</p>' .
'</td></tr>' .

'</table></td></tr></table></body></html>';

// --- .ics con las citas de HOY (para el adjunto del calendario predeterminado) ---
$icsHoy = $total > 0 ? agendaConstruirIcs($citas) : '';

// --- Enviar por SMTP (config.secret.php) ---
$smtp = $cfg['smtp'] ?? [];
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

    $mail->setFrom($smtp['user'] ?? 'avisos@hsdental.es', 'HS Dental · Agenda');
    $mail->addAddress(CRON_DESTINO);
    $mail->isHTML(true);
    $mail->Subject = 'Tus citas ' . $diaFrase . ' · Gabinete 1 · Móstoles · ' . $fechaLegible;
    $mail->Body    = $body;
    $mail->AltBody = "Hola doctor, tienes $total cita(s) $diaFrase en Gabinete 1 (Mostoles).";

    if ($icsHoy !== '') {
        $mail->addStringAttachment($icsHoy, 'citas.ics', PHPMailer::ENCODING_BASE64, 'text/calendar; charset=utf-8; method=PUBLISH');
    }

    $mail->send();
    terminar("OK: correo enviado con $total cita(s).", 0);
} catch (Exception $e) {
    terminar('Error al enviar el correo: ' . $mail->ErrorInfo, 1);
}
