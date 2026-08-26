<?php
/**
 * agenda_gabinete1_mostoles_ics.php
 *
 * Feed .ics (iCalendar) con la agenda de GABINETE 1 (medico='med1') de MÓSTOLES en
 * PRODUCCIÓN, desde hoy y los próximos 60 días, excluyendo canceladas.
 *
 * Sirve para SUSCRIBIRSE de una vez a todas las citas:
 *   - Google Calendar: "Otros calendarios" > "Desde una URL" (o el botón del correo).
 *   - Apple/iOS: Ajustes > Calendario > Cuentas > Añadir cuenta > Otra > Calendario suscrito.
 *
 * Protegido con token (?token=...) definido en config.secret.php -> 'cron_token'.
 */

date_default_timezone_set('Europe/Madrid');

$cfg = require __DIR__ . '/../../config.secret.php';

// --- Seguridad: token obligatorio (este endpoint es público) ---
$tokenEsperado = $cfg['cron_token'] ?? '';
$tokenRecibido = $_GET['token'] ?? '';
if ($tokenEsperado === '' || !hash_equals($tokenEsperado, $tokenRecibido)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Prohibido';
    exit;
}

require_once __DIR__ . '/agenda_gabinete1_mostoles_lib.php';

try {
    $conn  = agendaConexionMostolesProd($cfg);
    $desde = date('Y-m-d');
    $hasta = date('Y-m-d', strtotime('+60 days'));
    $citas = agendaCitasGab1($conn, $desde, $hasta);
    $conn->close();

    $ics = agendaConstruirIcs($citas);

    header('Content-Type: text/calendar; charset=utf-8');
    header('Content-Disposition: inline; filename="gabinete1_mostoles.ics"');
    header('Cache-Control: no-cache, must-revalidate');
    echo $ics;
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Error generando el calendario';
}
