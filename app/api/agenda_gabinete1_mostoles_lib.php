<?php
/**
 * agenda_gabinete1_mostoles_lib.php
 *
 * Lógica compartida para la agenda de GABINETE 1 (medico='med1') de MÓSTOLES en
 * PRODUCCIÓN. La usan:
 *   - cron_gabinete1_mostoles.php        (correo diario a las 06:00)
 *   - agenda_gabinete1_mostoles_ics.php  (feed .ics para suscribir en Google/Apple)
 *
 * Modelo de datos (tabla appointments):
 *   - 'servicio' = nombre del PACIENTE
 *   - 'cliente'  = OBSERVACIONES
 */

const AGENDA_DURACION = 30;                 // minutos por cita (igual que la vista diaria)
const AGENDA_LUGAR    = 'HS Dental Móstoles';

/** Conexión directa a la BD de Móstoles de PRODUCCIÓN (sin sesión). */
function agendaConexionMostolesProd(array $cfg): mysqli {
    $c = $cfg['db']['prod']['mostoles'] ?? null;
    if (!$c) {
        throw new RuntimeException('Falta la configuración db.prod.mostoles en config.secret.php');
    }
    $conn = new mysqli($c['host'], $c['user'], $c['pass'], $c['db']);
    if ($conn->connect_error) {
        throw new RuntimeException('Error de conexión: ' . $conn->connect_error);
    }
    $conn->set_charset('utf8mb4');
    return $conn;
}

/**
 * Devuelve las citas de Gabinete 1 (med1) entre dos fechas (inclusive),
 * excluyendo las canceladas, ordenadas por fecha.
 * @return array<int,array{id:string,fecha:string,servicio:string,cliente:string,estado:string}>
 */
function agendaCitasGab1(mysqli $conn, string $desde, string $hasta): array {
    $sql = "SELECT id, fecha, servicio, cliente, estado
            FROM appointments
            WHERE medico = 'med1'
              AND DATE(fecha) BETWEEN ? AND ?
              AND estado <> 'Cancelada'
            ORDER BY fecha ASC";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('Error preparando la consulta: ' . $conn->error);
    }
    $stmt->bind_param('ss', $desde, $hasta);
    $stmt->execute();
    $citas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    return $citas;
}

/** Escapa texto para un campo de iCalendar (.ics). */
function agendaIcsEscape($texto): string {
    return str_replace(
        ["\\", ";", ",", "\r\n", "\n", "\r"],
        ["\\\\", "\\;", "\\,", "\\n", "\\n", "\\n"],
        (string) $texto
    );
}

/**
 * Construye un calendario iCalendar (.ics) con las citas dadas.
 * Las horas guardadas se interpretan como Europe/Madrid y se emiten en UTC.
 */
function agendaConstruirIcs(array $citas): string {
    $tzLocal = new DateTimeZone('Europe/Madrid');
    $tzUtc   = new DateTimeZone('UTC');

    $vevents = '';
    foreach ($citas as $cita) {
        try {
            $inicio = new DateTime($cita['fecha'], $tzLocal);
        } catch (Exception $e) {
            continue; // fecha inválida (p.ej. 0000-00-00)
        }
        $fin = (clone $inicio)->modify('+' . AGENDA_DURACION . ' minutes');

        $inicioUtc = (clone $inicio)->setTimezone($tzUtc)->format('Ymd\THis\Z');
        $finUtc    = (clone $fin)->setTimezone($tzUtc)->format('Ymd\THis\Z');

        $paciente = trim($cita['servicio'] ?? '') ?: 'Sin nombre';
        $obs      = trim($cita['cliente']  ?? '');
        $uid      = ($cita['id'] ?? uniqid()) . '@hsdental.es';

        $vevents .=
            "BEGIN:VEVENT\r\n" .
            "UID:" . $uid . "\r\n" .
            "DTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\n" .
            "DTSTART:" . $inicioUtc . "\r\n" .
            "DTEND:" . $finUtc . "\r\n" .
            "SUMMARY:" . agendaIcsEscape($paciente . ' (Gabinete 1)') . "\r\n" .
            ($obs !== '' ? "DESCRIPTION:" . agendaIcsEscape('Observaciones: ' . $obs) . "\r\n" : '') .
            "LOCATION:" . agendaIcsEscape(AGENDA_LUGAR) . "\r\n" .
            "END:VEVENT\r\n";
    }

    return "BEGIN:VCALENDAR\r\n" .
           "VERSION:2.0\r\n" .
           "PRODID:-//HS Dental//Agenda Gabinete 1//ES\r\n" .
           "CALSCALE:GREGORIAN\r\n" .
           "METHOD:PUBLISH\r\n" .
           "X-WR-CALNAME:Gabinete 1 - Móstoles\r\n" .
           $vevents .
           "END:VCALENDAR\r\n";
}

/** Enlace para añadir UNA cita a Google Calendar (evento suelto). */
function agendaGoogleEventUrl(string $fechaLocal, string $titulo, string $obs): string {
    $tzLocal = new DateTimeZone('Europe/Madrid');
    $tzUtc   = new DateTimeZone('UTC');
    $inicio  = new DateTime($fechaLocal, $tzLocal);
    $fin     = (clone $inicio)->modify('+' . AGENDA_DURACION . ' minutes');

    return 'https://calendar.google.com/calendar/render?action=TEMPLATE'
        . '&text='     . rawurlencode($titulo)
        . '&dates='    . (clone $inicio)->setTimezone($tzUtc)->format('Ymd\THis\Z')
        . '/'          . (clone $fin)->setTimezone($tzUtc)->format('Ymd\THis\Z')
        . '&details='  . rawurlencode($obs !== '' ? ('Observaciones: ' . $obs) : 'Cita HS Dental')
        . '&location=' . rawurlencode(AGENDA_LUGAR);
}
