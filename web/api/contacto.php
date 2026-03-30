<?php
ob_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean(); http_response_code(200); exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ob_end_clean(); echo json_encode(['error' => 'Metodo no permitido']); exit;
}

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    ob_end_clean();
    http_response_code(500);
    echo json_encode(['error' => "PHP[$errno]: $errstr en linea $errline"]);
    exit;
});
register_shutdown_function(function() {
    $e = error_get_last();
    if ($e && in_array($e['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        ob_end_clean();
        http_response_code(500);
        echo json_encode(['error' => 'Fatal: ' . $e['message'] . ' linea ' . $e['line']]);
    }
});

require_once __DIR__ . '/db_connect_public.php';
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

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
        $mail->send();
        return true;
    } catch (Exception $e) {
        return $e->getMessage();
    }
}

$raw  = file_get_contents('php://input');
$data = json_decode($raw, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    ob_end_clean();
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

$name    = trim($data['name']    ?? '');
$email   = trim($data['email']   ?? '');
$phone   = trim($data['phone']   ?? '');
$clinic  = trim($data['clinic']  ?? '');
$service = trim($data['service'] ?? '');
$message = trim($data['message'] ?? '');

if (!$name || !$email || !$clinic) {
    ob_end_clean();
    echo json_encode(['error' => 'Faltan campos', 'name' => $name, 'email' => $email, 'clinic' => $clinic]);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    ob_end_clean();
    echo json_encode(['error' => 'Email invalido: ' . $email]);
    exit;
}

$conn = getConnectionByClinic($clinic);
if (!$conn) {
    ob_end_clean();
    echo json_encode(['error' => 'Clinica no reconocida: ' . $clinic]);
    exit;
}

$stmt = $conn->prepare(
    'INSERT INTO contactos (nombre, email, telefono, clinic, mensaje) VALUES (?, ?, ?, ?, ?)'
);
if (!$stmt) {
    ob_end_clean();
    echo json_encode(['error' => 'Prepare failed: ' . $conn->error]);
    $conn->close(); exit;
}
$stmt->bind_param('sssss', $name, $email, $phone, $clinic, $message);
if (!$stmt->execute()) {
    ob_end_clean();
    echo json_encode(['error' => 'Execute failed: ' . $stmt->error]);
    $stmt->close(); $conn->close(); exit;
}
$stmt->close();
$conn->close();

$adminBody = "<h2>Nuevo contacto</h2><p><b>Nombre:</b> $name</p><p><b>Email:</b> $email</p><p><b>Telefono:</b> $phone</p><p><b>Clinica:</b> $clinic</p><p><b>Servicio:</b> $service</p><p><b>Mensaje:</b> $message</p>";
$userBody  = "<h2>Gracias por contactar con HSDental</h2><p>Hola $name, hemos recibido tu mensaje y nos pondremos en contacto contigo lo antes posible.</p><p><b>Servicio:</b> $service</p><p><b>Mensaje:</b> $message</p><br><p>El equipo de HSDental</p>";

$r1 = sendEmail('hsdental00@gmail.com', 'Nuevo contacto - ' . $clinic, $adminBody);
$r2 = sendEmail($email, 'Confirmacion de contacto - HSDental', $userBody);

$errors = [];
if ($r1 !== true) $errors['admin']   = $r1;
if ($r2 !== true) $errors['usuario'] = $r2;

ob_end_clean();
echo json_encode(empty($errors) ? ['success' => true] : ['success' => false, 'guardado_bd' => true, 'email_errors' => $errors]);