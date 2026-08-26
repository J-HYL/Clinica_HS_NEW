<?php
// portal/api/solicitudes.php
// Fase 2: pedir cita + notificaciones del paciente. Enruta por ?accion=:
//   huecos | crear | notificaciones | marcar-leidas | responder-contraoferta
//
// Modelo hibrido (decidido con el cliente): el paciente NO reserva; crea una
// SOLICITUD que la clinica confirma desde el panel. "huecos" son orientativos
// (libre/ocupado calculado desde appointments); nunca se exponen datos de otras
// citas. TODO scoped server-side al client_id de la sesion.

require_once __DIR__ . '/helpers.php';

$client_id = require_login();

// --- Config de agenda (orientativa; la clinica confirma de todas formas) ---
const SLOT_MIN  = 30;   // minutos por hueco
const GABINETES = 2;    // capacidad por hueco (med1 + med2)

// Horario por sede: mañana 09:30-13:00 en ambas; tarde hasta 19:30 en Mostoles
// y hasta 20:00 en Alcorcon.
function horariosSede($sede) {
    $tardeFin = ($sede === 'mostoles') ? '19:30' : '20:00';
    return [['inicio' => '09:30', 'fin' => '13:00'], ['inicio' => '16:30', 'fin' => $tardeFin]];
}

$accion = $_GET['accion'] ?? '';
switch ($accion) {
    case 'huecos':                 recurso_huecos($client_id);         break;
    case 'crear':                  recurso_crear($client_id);          break;
    case 'notificaciones':         recurso_notificaciones($client_id); break;
    case 'marcar-leidas':          recurso_marcar_leidas($client_id);  break;
    case 'responder-contraoferta': recurso_responder($client_id);      break;
    default:                       json_error('Acción desconocida.', 404);
}

// -------------------------------------------------------------- helpers

/** Genera la rejilla de horas ('09:30','10:00',...) para un horario dado. */
function generar_slots($horarios) {
    $slots = [];
    foreach ($horarios as $f) {
        for ($t = strtotime($f['inicio']), $fin = strtotime($f['fin']); $t < $fin; $t += SLOT_MIN * 60) {
            $slots[] = date('H:i', $t);
        }
    }
    return $slots;
}

/** Fecha legible en español para textos de notificacion. */
function fecha_legible($dt) {
    $ts = strtotime($dt);
    $dias  = ['Sunday' => 'domingo', 'Monday' => 'lunes', 'Tuesday' => 'martes', 'Wednesday' => 'miércoles', 'Thursday' => 'jueves', 'Friday' => 'viernes', 'Saturday' => 'sábado'];
    $meses = [1 => 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return $dias[date('l', $ts)] . ' ' . date('j', $ts) . ' de ' . $meses[(int) date('n', $ts)] . ' a las ' . date('H:i', $ts);
}

/** Crea una cita real en `appointments` siguiendo la convencion del panel:
 *  servicio = nombre del paciente, cliente = motivo/observaciones. Devuelve el id. */
function crear_cita($conn, $client_id, $fecha_dt, $motivo, $medico = 'med1') {
    $stmt = $conn->prepare("SELECT nombre FROM clients WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $nombre = $stmt->get_result()->fetch_assoc()['nombre'] ?? '';
    $stmt->close();

    $obs = (string) ($motivo ?? '');
    $estado = 'Pendiente';
    $stmt = $conn->prepare("INSERT INTO appointments (client_id, cliente, estado, fecha, medico, servicio) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isssss', $client_id, $obs, $estado, $fecha_dt, $medico, $nombre);
    $stmt->execute();
    $id = $conn->insert_id;
    $stmt->close();
    return $id;
}

/** Crea una notificacion para el paciente. */
function crear_notificacion($conn, $client_id, $tipo, $titulo, $mensaje, $solicitud_id = null) {
    $stmt = $conn->prepare("INSERT INTO notificaciones (client_id, tipo, titulo, mensaje, solicitud_id) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('isssi', $client_id, $tipo, $titulo, $mensaje, $solicitud_id);
    $stmt->execute();
    $stmt->close();
}

// -------------------------------------------------------------- huecos

function recurso_huecos($client_id) {
    only_methods(['GET']);
    $fecha = $_GET['fecha'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) json_error('Fecha no válida.');

    $conn = getConnection();
    // Cuantas citas hay ya en cada hora de ese dia (sin canceladas).
    $stmt = $conn->prepare(
        "SELECT DATE_FORMAT(fecha, '%H:%i') AS hora, COUNT(*) AS n
         FROM appointments WHERE DATE(fecha) = ? AND estado <> 'Cancelada' GROUP BY hora"
    );
    $stmt->bind_param('s', $fecha);
    $stmt->execute();
    $res = $stmt->get_result();
    $ocup = [];
    while ($r = $res->fetch_assoc()) $ocup[$r['hora']] = (int) $r['n'];
    $stmt->close();
    $conn->close();

    $sede = $_SESSION['portal_sede'] ?? 'alcorcon';
    $ahora = time();
    $slots = [];
    foreach (generar_slots(horariosSede($sede)) as $hora) {
        $dt = strtotime($fecha . ' ' . $hora);
        $ocupado = ($dt <= $ahora) || (($ocup[$hora] ?? 0) >= GABINETES);
        $slots[] = ['hora' => $hora, 'ocupado' => $ocupado];
    }
    json_out(['fecha' => $fecha, 'slots' => $slots]);
}

// -------------------------------------------------------------- crear

function recurso_crear($client_id) {
    only_methods(['POST']);
    $d = body_json();
    $fecha = $d['fecha'] ?? '';
    $hora  = $d['hora'] ?? '';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha) || !preg_match('/^\d{2}:\d{2}$/', $hora)) {
        json_error('Elige el día y la hora.');
    }
    $dt = $fecha . ' ' . $hora . ':00';
    if (strtotime($dt) <= time()) json_error('Elige una fecha y hora futuras.');

    $motivo = trim((string) ($d['motivo'] ?? ''));
    if (mb_strlen($motivo) > 255) $motivo = mb_substr($motivo, 0, 255);
    $notas = trim((string) ($d['notas'] ?? ''));
    $mot = $motivo === '' ? null : $motivo;
    $not = $notas === '' ? null : $notas;

    $conn = getConnection();
    // No duplicar la misma solicitud pendiente en el mismo hueco.
    $stmt = $conn->prepare("SELECT id FROM solicitudes_cita WHERE client_id = ? AND fecha_preferida = ? AND estado = 'solicitada' LIMIT 1");
    $stmt->bind_param('is', $client_id, $dt);
    $stmt->execute();
    $dup = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($dup) { $conn->close(); json_error('Ya tienes una solicitud para ese día y hora.'); }

    $stmt = $conn->prepare("INSERT INTO solicitudes_cita (client_id, fecha_preferida, motivo, notas, estado) VALUES (?, ?, ?, ?, 'solicitada')");
    $stmt->bind_param('isss', $client_id, $dt, $mot, $not);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    json_out(['success' => true, 'message' => 'Solicitud enviada. La clínica te confirmará en breve.']);
}

// -------------------------------------------------------- notificaciones

function recurso_notificaciones($client_id) {
    only_methods(['GET']);
    $conn = getConnection();
    // payment_id (migracion 009) permite el deep-link de la notificacion de factura
    // al detalle del pago. Guardado por si la 009 aun no esta aplicada.
    $tienePago = ($chk = $conn->query("SHOW COLUMNS FROM notificaciones LIKE 'payment_id'")) && $chk->num_rows > 0;
    $pagoSel  = $tienePago ? "n.payment_id, p.treatment_id" : "NULL AS payment_id, NULL AS treatment_id";
    $pagoJoin = $tienePago ? "LEFT JOIN payments p ON n.payment_id = p.id" : "";
    $stmt = $conn->prepare(
        "SELECT n.id, n.tipo, n.titulo, n.mensaje, n.leida, n.created_at, n.solicitud_id,
                s.estado AS solicitud_estado, s.fecha_propuesta,
                $pagoSel
         FROM notificaciones n
         LEFT JOIN solicitudes_cita s ON n.solicitud_id = s.id
         $pagoJoin
         WHERE n.client_id = ? ORDER BY n.created_at DESC LIMIT 50"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $items = [];
    $noLeidas = 0;
    while ($r = $res->fetch_assoc()) {
        if (!$r['leida']) $noLeidas++;
        $items[] = [
            'id'              => (int) $r['id'],
            'tipo'            => $r['tipo'],
            'titulo'          => $r['titulo'],
            'mensaje'         => $r['mensaje'],
            'leida'           => (int) $r['leida'],
            'created_at'      => $r['created_at'],
            'solicitud_id'    => $r['solicitud_id'] ? (int) $r['solicitud_id'] : null,
            // Solo es accionable si sigue siendo una contraoferta abierta.
            'accionable'      => ($r['tipo'] === 'cita_contraoferta' && $r['solicitud_estado'] === 'contraoferta'),
            'fecha_propuesta' => $r['fecha_propuesta'],
            // Deep-link de la factura al detalle del pago (aviso 'factura_emitida').
            'payment_id'      => isset($r['payment_id'])   && $r['payment_id']   !== null ? (int) $r['payment_id']   : null,
            'treatment_id'    => isset($r['treatment_id']) && $r['treatment_id'] !== null ? (int) $r['treatment_id'] : null,
        ];
    }
    $stmt->close();
    $conn->close();
    json_out(['notificaciones' => $items, 'no_leidas' => $noLeidas]);
}

function recurso_marcar_leidas($client_id) {
    only_methods(['POST']);
    $conn = getConnection();
    $stmt = $conn->prepare("UPDATE notificaciones SET leida = 1 WHERE client_id = ? AND leida = 0");
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();
    json_out(['success' => true]);
}

// ---------------------------------------------- responder-contraoferta

function recurso_responder($client_id) {
    only_methods(['POST']);
    $d = body_json();
    $sid = (int) ($d['solicitud_id'] ?? 0);
    $acepta = !empty($d['acepta']);
    if ($sid <= 0) json_error('Falta la solicitud.');

    $conn = getConnection();
    $stmt = $conn->prepare("SELECT id, fecha_propuesta, motivo FROM solicitudes_cita WHERE id = ? AND client_id = ? AND estado = 'contraoferta' LIMIT 1");
    $stmt->bind_param('ii', $sid, $client_id);
    $stmt->execute();
    $sol = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$sol) { $conn->close(); json_error('Esa propuesta ya no está disponible.', 404); }

    if ($acepta) {
        $apptId = crear_cita($conn, $client_id, $sol['fecha_propuesta'], $sol['motivo']);
        $stmt = $conn->prepare("UPDATE solicitudes_cita SET estado = 'confirmada', appointment_id = ? WHERE id = ?");
        $stmt->bind_param('ii', $apptId, $sid);
        $stmt->execute();
        $stmt->close();
        crear_notificacion($conn, $client_id, 'cita_confirmada', 'Cita confirmada',
            'Tu cita ha quedado confirmada para el ' . fecha_legible($sol['fecha_propuesta']) . '.', $sid);
        $conn->close();
        json_out(['success' => true, 'message' => '¡Cita confirmada!']);
    }

    $stmt = $conn->prepare("UPDATE solicitudes_cita SET estado = 'cancelada' WHERE id = ?");
    $stmt->bind_param('i', $sid);
    $stmt->execute();
    $stmt->close();
    crear_notificacion($conn, $client_id, 'cita_rechazada', 'Propuesta rechazada',
        'Has rechazado la hora propuesta. Puedes pedir otra cita cuando quieras.', $sid);
    $conn->close();
    json_out(['success' => true, 'message' => 'Propuesta rechazada.']);
}
