<?php
// portal/api/facturas.php
// Solicitud de factura del paciente. Enruta por ?accion=:
//   solicitar  -> POST {payment_id}: crea una solicitud de factura de ese pago.
//
// SEGURIDAD: el pago DEBE pertenecer al client_id de la SESION (scope server-side);
// nunca se acepta un pago de otro paciente. La clinica ve la solicitud en el panel
// (campana de avisos), genera la factura y avisa (email + notificacion).

require_once __DIR__ . '/helpers.php';

$client_id = require_login();
$accion = $_GET['accion'] ?? '';

switch ($accion) {
    case 'solicitar': recurso_solicitar($client_id); break;
    case 'descargar': recurso_descargar($client_id); break;
    default:          json_error('Acción desconocida.', 404);
}

/**
 * Sirve el PDF de la factura de un pago, SOLO si esa factura es del paciente de la
 * sesion (se resuelve por payment_id + client_id via solicitudes_factura; nunca se
 * acepta un factura_id del cliente). El PDF lo genera y guarda el panel en
 * app/uploads/facturas/: app/ y portal/ son hermanas en local/pre/prod, asi que la
 * ruta relativa es estable. basename() corta cualquier intento de path traversal.
 */
function recurso_descargar($client_id) {
    only_methods(['GET']);
    $payment_id = (int) ($_GET['payment_id'] ?? 0);
    if ($payment_id <= 0) json_error('Falta el pago.');

    $conn = getConnection();
    $stmt = $conn->prepare(
        "SELECT f.ruta, f.numero_factura
         FROM solicitudes_factura sf JOIN facturas f ON sf.factura_id = f.id
         WHERE sf.payment_id = ? AND sf.client_id = ? AND sf.estado = 'generada'
         ORDER BY sf.id DESC LIMIT 1"
    );
    $stmt->bind_param('ii', $payment_id, $client_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $conn->close();
    if (!$row || empty($row['ruta'])) json_error('Factura no disponible.', 404);

    $file = __DIR__ . '/../../app/uploads/facturas/' . basename((string) $row['ruta']);
    if (!is_file($file)) json_error('El archivo de la factura no se encuentra.', 404);

    $nombre = 'factura_' . ($row['numero_factura'] ?? '') . '.pdf';
    header('Content-Type: application/pdf');                 // override del JSON de helpers.php
    header('Content-Disposition: inline; filename="' . $nombre . '"');
    header('Content-Length: ' . filesize($file));
    header('Cache-Control: no-store, private');
    readfile($file);
    exit;
}

function recurso_solicitar($client_id) {
    only_methods(['POST']);
    $d = body_json();
    $payment_id = (int) ($d['payment_id'] ?? 0);
    if ($payment_id <= 0) json_error('Falta el pago.');

    $conn = getConnection();

    // El pago debe ser del paciente de la sesion.
    $stmt = $conn->prepare("SELECT id FROM payments WHERE id = ? AND client_id = ? LIMIT 1");
    $stmt->bind_param('ii', $payment_id, $client_id);
    $stmt->execute();
    $pago = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$pago) { $conn->close(); json_error('Pago no encontrado.', 404); }

    // No duplicar: si ya hay una solicitud abierta o la factura ya se emitio.
    $stmt = $conn->prepare("SELECT estado FROM solicitudes_factura WHERE payment_id = ? AND estado IN ('solicitada','generada') ORDER BY id DESC LIMIT 1");
    $stmt->bind_param('i', $payment_id);
    $stmt->execute();
    $ex = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($ex) {
        $conn->close();
        $msg = $ex['estado'] === 'generada' ? 'La factura de este pago ya está emitida.' : 'Ya has solicitado la factura de este pago.';
        json_error($msg, 409);
    }

    $stmt = $conn->prepare("INSERT INTO solicitudes_factura (client_id, payment_id, estado) VALUES (?, ?, 'solicitada')");
    $stmt->bind_param('ii', $client_id, $payment_id);
    $stmt->execute();
    $stmt->close();
    $conn->close();

    json_out(['success' => true, 'message' => 'Factura solicitada. La clínica la emitirá y te avisará.']);
}
