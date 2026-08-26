<?php
// portal/api/datos.php
// Datos del paciente para el portal. Enruta por ?recurso=:
//   inicio | tratamientos | citas | perfil   (perfil: GET lee, PUT actualiza)
//
// SEGURIDAD: TODO se scopea server-side al client_id de la SESION (require_login).
// Nunca se acepta un id de paciente del cliente -> un paciente no puede ver ni
// tocar datos de otro. Se exponen solo los campos que el paciente debe ver
// (nunca notas internas de citas/pagos ni el codigo de medico/gabinete).

require_once __DIR__ . '/helpers.php';

$client_id = require_login();
$recurso   = $_GET['recurso'] ?? '';

switch ($recurso) {
    case 'inicio':       recurso_inicio($client_id);       break;
    case 'tratamientos': recurso_tratamientos($client_id); break;
    case 'citas':        recurso_citas($client_id);        break;
    case 'perfil':       recurso_perfil($client_id);       break;
    default:             json_error('Recurso desconocido.', 404);
}

// ------------------------------------------------------------------ inicio

function recurso_inicio($client_id) {
    only_methods(['GET']);
    $conn = getConnection();

    // Proxima cita (futura y no cancelada).
    $stmt = $conn->prepare(
        "SELECT fecha, estado FROM appointments
         WHERE client_id = ? AND fecha >= NOW() AND estado <> 'Cancelada'
         ORDER BY fecha ASC LIMIT 1"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $proxima = $stmt->get_result()->fetch_assoc() ?: null;
    $stmt->close();

    // Deuda total y nº de tratamientos con saldo pendiente.
    $stmt = $conn->prepare(
        "SELECT COALESCE(SUM(deuda),0) AS deuda_total,
                SUM(CASE WHEN deuda > 0 THEN 1 ELSE 0 END) AS con_deuda
         FROM treatments WHERE client_id = ?"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $t = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();

    json_out([
        'proxima_cita' => $proxima,
        'deuda_total'  => (float) ($t['deuda_total'] ?? 0),
        'con_deuda'    => (int) ($t['con_deuda'] ?? 0),
    ]);
}

// ------------------------------------------------------------ tratamientos

function recurso_tratamientos($client_id) {
    only_methods(['GET']);
    $conn = getConnection();

    $stmt = $conn->prepare(
        "SELECT id, diagnostico, observaciones, monto_total, monto_pagado, deuda, estado, fecha_creacion, fecha
         FROM treatments WHERE client_id = ? ORDER BY fecha_creacion DESC"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $tratamientos = [];
    $indexById = [];   // id de tratamiento -> posicion en $tratamientos
    while ($row = $res->fetch_assoc()) {
        $tratamientos[] = [
            'id'           => (int) $row['id'],
            'diagnostico'  => $row['diagnostico'],
            'observaciones'=> $row['observaciones'],
            'monto_total'  => (float) $row['monto_total'],
            'monto_pagado' => (float) $row['monto_pagado'],
            'deuda'        => (float) $row['deuda'],
            'estado'       => $row['estado'] ?: 'pendiente',
            'fecha'        => $row['fecha'] ?: $row['fecha_creacion'],
            'pagos'        => [],
        ];
        $indexById[(int) $row['id']] = count($tratamientos) - 1;
    }
    $stmt->close();

    // Pagos del paciente, agrupados por tratamiento (sin 'notas': pueden ser internas).
    // `factura_estado` (null | solicitada | generada | ...) indica si el paciente ya
    // pidio la factura de ese pago. Antes de aplicar la migracion 008 la tabla puede
    // no existir: en ese caso se devuelve NULL sin romper la vista.
    $tieneSolF = ($chk = $conn->query("SHOW TABLES LIKE 'solicitudes_factura'")) && $chk->num_rows > 0;
    $estadoExpr = $tieneSolF
        ? "(SELECT sf.estado FROM solicitudes_factura sf WHERE sf.payment_id = p.id ORDER BY sf.id DESC LIMIT 1)"
        : "NULL";
    $stmt = $conn->prepare(
        "SELECT p.id, p.treatment_id, p.monto, p.fecha_pago, p.metodo_pago,
                $estadoExpr AS factura_estado
         FROM payments p WHERE p.client_id = ? ORDER BY p.fecha_pago ASC"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($p = $res->fetch_assoc()) {
        $tid = (int) $p['treatment_id'];
        if (isset($indexById[$tid])) {
            $tratamientos[$indexById[$tid]]['pagos'][] = [
                'id'             => (int) $p['id'],
                'monto'          => (float) $p['monto'],
                'fecha_pago'     => $p['fecha_pago'],
                'metodo_pago'    => $p['metodo_pago'],
                'factura_estado' => $p['factura_estado'],
            ];
        }
    }
    $stmt->close();
    $conn->close();

    json_out(['tratamientos' => $tratamientos]);
}

// ------------------------------------------------------------------- citas

function recurso_citas($client_id) {
    only_methods(['GET']);
    $conn = getConnection();

    // Solo fecha y estado: 'servicio' (nombre) y 'cliente' (observaciones) pueden
    // contener notas internas -> no se exponen al paciente.
    $stmt = $conn->prepare(
        "SELECT fecha, estado FROM appointments WHERE client_id = ? ORDER BY fecha DESC"
    );
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $res = $stmt->get_result();
    $citas = [];
    while ($row = $res->fetch_assoc()) {
        $citas[] = ['fecha' => $row['fecha'], 'estado' => $row['estado'], 'solicitud' => false];
    }
    $stmt->close();

    // Solicitudes de cita AÚN sin confirmar -> se muestran como "Pendiente de
    // aprobación" (no son citas reales todavía; al confirmarlas la clínica crea la
    // cita real). Guardado por si la migración 006 no está aplicada.
    $tieneSol = ($chk = $conn->query("SHOW TABLES LIKE 'solicitudes_cita'")) && $chk->num_rows > 0;
    if ($tieneSol) {
        $stmt = $conn->prepare(
            "SELECT COALESCE(fecha_propuesta, fecha_preferida) AS fecha
             FROM solicitudes_cita WHERE client_id = ? AND estado IN ('solicitada','contraoferta')"
        );
        $stmt->bind_param('i', $client_id);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $citas[] = ['fecha' => $row['fecha'], 'estado' => 'Pendiente de aprobación', 'solicitud' => true];
        }
        $stmt->close();
    }
    $conn->close();

    json_out(['citas' => $citas]);
}

// ------------------------------------------------------------------ perfil

function recurso_perfil($client_id) {
    $metodo = only_methods(['GET', 'PUT']);
    if ($metodo === 'PUT') {
        return perfil_actualizar($client_id);
    }
    $conn = getConnection();
    $stmt = $conn->prepare("SELECT nombre, telefono, alergias, edad, Alta FROM clients WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();
    if (!$row) json_error('Paciente no encontrado.', 404);

    json_out(['perfil' => [
        'nombre'   => $row['nombre'],
        'email'    => $_SESSION['portal_email'] ?? '',   // email = login (solo lectura en Fase 1)
        'telefono' => $row['telefono'],
        'alergias' => $row['alergias'],
        'edad'     => $row['edad'] !== null ? (int) $row['edad'] : null,
        'alta'     => $row['Alta'],
    ]]);
}

/**
 * El paciente completa/edita SOLO telefono, alergias y edad (los datos que
 * suelen faltar). El email NO se edita aqui: es el identificador de login y
 * cambiarlo exige re-verificacion (Fase 2). El nombre lo gestiona la clinica.
 */
function perfil_actualizar($client_id) {
    $d = body_json();
    $campos = [];
    $tipos  = '';
    $vals   = [];

    if (array_key_exists('telefono', $d)) {
        $tel = trim((string) $d['telefono']);
        if (!preg_match('/^\d{7,15}$/', $tel)) {
            json_error('El telefono debe tener entre 7 y 15 digitos.');
        }
        $campos[] = 'telefono = ?'; $tipos .= 's'; $vals[] = $tel;
    }
    if (array_key_exists('alergias', $d)) {
        $al = trim((string) $d['alergias']);
        if (mb_strlen($al) > 100) $al = mb_substr($al, 0, 100);
        $campos[] = 'alergias = ?'; $tipos .= 's'; $vals[] = ($al === '' ? null : $al);
    }
    if (array_key_exists('edad', $d)) {
        $raw = $d['edad'];
        if ($raw === '' || $raw === null) {
            $campos[] = 'edad = ?'; $tipos .= 'i'; $vals[] = null;
        } else {
            $edad = (int) $raw;
            if ($edad < 0 || $edad > 120) json_error('La edad no es valida.');
            $campos[] = 'edad = ?'; $tipos .= 'i'; $vals[] = $edad;
        }
    }

    if (!$campos) json_error('No hay nada que actualizar.');

    $conn = getConnection();
    $sql  = 'UPDATE clients SET ' . implode(', ', $campos) . ' WHERE id = ?';
    $tipos .= 'i'; $vals[] = $client_id;
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($tipos, ...$vals);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    json_out(['success' => true]);
}
