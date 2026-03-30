<?php
/**
 * HSDental · contacto.php
 * Endpoint para recibir formularios de contacto
 * Sin sesiones - Todo público
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Manejar preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Solo aceptar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método no permitido']);
    exit;
}

// Incluir conexión a base de datos
require_once __DIR__ . '/db_connect_public.php';

// Incluir PHPMailer
require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
require_once __DIR__ . '/PHPMailer/src/SMTP.php';
require_once __DIR__ . '/PHPMailer/src/Exception.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// Función para enviar correo
function sendEmail($to, $subject, $body, $isHtml = false) {
    $mail = new PHPMailer(true);

    try {
        // Configuración SMTP IONOS
        $mail->isSMTP();
        $mail->Host       = 'smtp.ionos.es';
        $mail->SMTPAuth   = true;
        $mail->Username   = 'avisos@hsdental.es';
        $mail->Password   = 'Jjbinks1999$'; // Placeholder - reemplazar con contraseña real
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587;
        $mail->CharSet    = 'UTF-8';

        // Remitente
        $mail->setFrom('avisos@hsdental.es', 'HSDental');

        // Destinatario
        $mail->addAddress($to);

        // Contenido
        $mail->isHTML($isHtml);
        $mail->Subject = $subject;
        $mail->Body    = $body;

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log("Error al enviar correo: " . $e->getMessage());
        return false;
    }
}

// Leer JSON del body
$input = file_get_contents('php://input');
$data = json_decode($input, true);

// Verificar que se recibió JSON válido
if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON inválido']);
    exit;
}

// Extraer datos del formulario
$name    = isset($data['name']) ? trim($data['name']) : '';
$email   = isset($data['email']) ? trim($data['email']) : '';
$phone   = isset($data['phone']) ? trim($data['phone']) : '';
$clinic  = isset($data['clinic']) ? trim($data['clinic']) : '';
$service = isset($data['service']) ? trim($data['service']) : '';
$message = isset($data['message']) ? trim($data['message']) : '';

// Validar campos requeridos
if (empty($name) || empty($email) || empty($clinic)) {
    http_response_code(400);
    echo json_encode(['error' => 'Faltan campos requeridos']);
    exit;
}

// Validar email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email inválido']);
    exit;
}

// Conectar a la base de datos según la clínica
$conn = getConnectionByClinic($clinic);

if (!$conn) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a la base de datos']);
    exit;
}

// Insertar en la tabla contactos
$stmt = $conn->prepare("INSERT INTO contactos (nombre, email, telefono, clinica, servicio, mensaje, fecha) VALUES (?, ?, ?, ?, ?, ?, NOW())");

if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al preparar la consulta']);
    $conn->close();
    exit;
}

$stmt->bind_param('ssssss', $name, $email, $phone, $clinic, $service, $message);

if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'Error al guardar el contacto']);
    $stmt->close();
    $conn->close();
    exit;
}

$stmt->close();
$conn->close();

// Enviar correos electrónicos
$adminSubject = 'Nuevo contacto desde la web - ' . ucfirst($clinic);
$adminBody = "
    <h2>Nuevo formulario de contacto</h2>
    <p><strong>Nombre:</strong> {$name}</p>
    <p><strong>Email:</strong> {$email}</p>
    <p><strong>Teléfono:</strong> {$phone}</p>
    <p><strong>Clínica:</strong> " . ucfirst($clinic) . "</p>
    <p><strong>Servicio:</strong> {$service}</p>
    <p><strong>Mensaje:</strong></p>
    <p>{$message}</p>
";

// Enviar al admin
sendEmail('hsdental00@gmail.com', $adminSubject, $adminBody, true);

// Enviar confirmación al usuario
$userSubject = 'Confirmación de contacto - HSDental';
$userBody = "
    <h2>Gracias por contactar con HSDental</h2>
    <p>Hola <strong>{$name}</strong>,</p>
    <p>Hemos recibido tu mensaje y nos pondremos en contacto contigo lo antes posible.</p>
    <p><strong>Resumen de tu consulta:</strong></p>
    <p><strong>Servicio:</strong> {$service}</p>
    <p><strong>Mensaje:</strong> {$message}</p>
    <br>
    <p>Atentamente,<br>El equipo de HSDental</p>
";

sendEmail($email, $userSubject, $userBody, true);

// Responder éxito
http_response_code(200);
echo json_encode(['success' => true]);