<?php
// portal/api/auth.php
// Autenticacion del Portal de Pacientes. Un solo endpoint que enruta por ?accion=:
//   login | logout | sesion | activar | solicitar-reset | reset
//
// Contrasenas con password_hash()/password_verify() (bcrypt) — NUNCA el SHA-256
// sin sal del panel. Tokens (invitacion/reset) hasheados en reposo, de un solo
// uso y caducables. Rate-limit por intentos fallidos.

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/mailer.php';

const MIN_PASS      = 8;    // longitud minima de contrasena
const MAX_INTENTOS  = 5;    // intentos fallidos antes de bloquear
const BLOQUEO_MIN   = 15;   // minutos de bloqueo tras superar los intentos
const RESET_HORAS   = 1;    // validez del enlace de reset

/** Datos publicos del paciente (para saludo/perfil). email = el de login (portal_users). */
function cliente_publico($conn, $client_id, $emailLogin) {
    $stmt = $conn->prepare("SELECT nombre FROM clients WHERE id = ? LIMIT 1");
    $stmt->bind_param('i', $client_id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return [
        'nombre' => $row['nombre'] ?? '',
        'email'  => $emailLogin,
    ];
}

/** Fija la sesion autenticada del paciente (regenera id para evitar fixation). */
function iniciar_sesion_paciente($client_id, $sede, $email) {
    session_regenerate_id(true);
    $_SESSION['portal_client_id'] = (int) $client_id;
    $_SESSION['portal_sede']      = $sede;
    $_SESSION['portal_email']     = $email;
}

// ----------------------------------------------------------------- login

function portal_login() {
    only_methods(['POST']);
    $d = body_json();
    $email = norm_email($d['email'] ?? '');
    $pass  = (string) ($d['password'] ?? '');
    if ($email === '' || $pass === '') {
        json_error('Introduce tu email y tu contrasena.');
    }

    $found = portal_buscar('email', $email);
    if ($found === null) {
        // Mensaje generico: no revelamos si el email existe.
        json_error('Email o contrasena incorrectos.', 401);
    }
    $conn = $found['conn'];
    $row  = $found['row'];
    $id   = (int) $row['id'];

    if ($row['estado'] === 'invitado' || $row['password_hash'] === null) {
        json_error('Tu cuenta aun no esta activada. Revisa el email de invitacion que te envio la clinica.', 403);
    }
    if ($row['estado'] === 'bloqueado') {
        json_error('Tu cuenta esta bloqueada. Contacta con la clinica.', 403);
    }
    if ($row['bloqueado_hasta'] !== null && strtotime($row['bloqueado_hasta']) > time()) {
        json_error('Demasiados intentos. Prueba de nuevo en unos minutos.', 429);
    }

    if (!password_verify($pass, $row['password_hash'])) {
        $intentos = ((int) $row['intentos_fallidos']) + 1;
        $bloqueo  = null;
        if ($intentos >= MAX_INTENTOS) {
            $bloqueo  = date('Y-m-d H:i:s', time() + BLOQUEO_MIN * 60);
            $intentos = 0; // se reinicia el contador tras aplicar el bloqueo
        }
        $stmt = $conn->prepare("UPDATE portal_users SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?");
        $stmt->bind_param('isi', $intentos, $bloqueo, $id);
        $stmt->execute();
        $stmt->close();
        json_error('Email o contrasena incorrectos.', 401);
    }

    // OK: limpia el rate-limit, marca acceso e inicia sesion.
    $stmt = $conn->prepare("UPDATE portal_users SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();

    iniciar_sesion_paciente($row['client_id'], $found['sede'], $row['email']);
    $cliente = cliente_publico($conn, (int) $row['client_id'], $row['email']);
    $conn->close();
    json_out(['success' => true, 'cliente' => $cliente]);
}

// ---------------------------------------------------------------- sesion

function portal_sesion() {
    if (empty($_SESSION['portal_client_id']) || empty($_SESSION['portal_sede'])) {
        json_out(['autenticado' => false]);
    }
    $conn = getConnection();
    $cliente = cliente_publico($conn, (int) $_SESSION['portal_client_id'], $_SESSION['portal_email'] ?? '');
    $conn->close();
    json_out(['autenticado' => true, 'cliente' => $cliente]);
}

// ---------------------------------------------------------------- logout

function portal_logout() {
    only_methods(['POST']);
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
    json_out(['success' => true]);
}

// --------------------------------------------------------------- activar
// El paciente abre el enlace de invitacion (activar.html?token=...) y fija su
// contrasena. Deja la cuenta 'activa' y la inicia sesion directamente.

function portal_activar() {
    only_methods(['POST']);
    $d = body_json();
    $token = (string) ($d['token'] ?? '');
    $pass  = (string) ($d['password'] ?? '');
    if (strlen($pass) < MIN_PASS) {
        json_error('La contrasena debe tener al menos ' . MIN_PASS . ' caracteres.');
    }
    if ($token === '') {
        json_error('Falta el token de activacion.');
    }

    $found = portal_buscar('invite_token_hash', hash_token($token));
    if ($found === null) {
        json_error('Enlace de activacion invalido o ya utilizado.', 400);
    }
    $conn = $found['conn'];
    $row  = $found['row'];
    if ($row['invite_expira'] === null || strtotime($row['invite_expira']) < time()) {
        json_error('El enlace de activacion ha caducado. Pide una nueva invitacion a la clinica.', 400);
    }

    $hash = password_hash($pass, PASSWORD_DEFAULT);
    $stmt = $conn->prepare("UPDATE portal_users SET password_hash = ?, estado = 'activo', invite_token_hash = NULL, invite_expira = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?");
    $id = (int) $row['id'];
    $stmt->bind_param('si', $hash, $id);
    $stmt->execute();
    $stmt->close();

    iniciar_sesion_paciente($row['client_id'], $found['sede'], $row['email']);
    $cliente = cliente_publico($conn, (int) $row['client_id'], $row['email']);
    $conn->close();
    json_out(['success' => true, 'cliente' => $cliente]);
}

// -------------------------------------------------------- solicitar-reset
// Siempre responde success (no revela si el email existe). Solo envia correo si
// la cuenta existe y esta activa.

function portal_solicitar_reset() {
    only_methods(['POST']);
    $d = body_json();
    $email = norm_email($d['email'] ?? '');
    if ($email === '') {
        json_error('Introduce tu email.');
    }

    $found = portal_buscar('email', $email);
    if ($found !== null && $found['row']['estado'] === 'activo') {
        $conn = $found['conn'];
        $id   = (int) $found['row']['id'];
        list($token, $tokenHash) = nuevo_token();
        $expira = date('Y-m-d H:i:s', time() + RESET_HORAS * 3600);
        $stmt = $conn->prepare("UPDATE portal_users SET reset_token_hash = ?, reset_expira = ? WHERE id = ?");
        $stmt->bind_param('ssi', $tokenHash, $expira, $id);
        $stmt->execute();
        $stmt->close();
        $conn->close();

        $enlace = portalBaseUrl() . '/reset.html?token=' . rawurlencode($token);
        portal_enviar_email(
            $email,
            'Restablece tu contrasena · HS Dental',
            email_wrap(
                '<p style="margin:0 0 12px;font-size:16px;color:#111827;">Hola 👋</p>' .
                '<p style="margin:0 0 18px;font-size:14px;color:#374151;">Has pedido restablecer la contrasena de tu portal de paciente. Pulsa el boton (el enlace caduca en ' . RESET_HORAS . ' hora):</p>' .
                boton_email('Crear nueva contrasena', $enlace) .
                '<p style="margin:18px 0 0;font-size:12px;color:#9ca3af;">Si no has sido tu, ignora este correo: tu contrasena no cambiara.</p>'
            )
        );
    }
    json_out(['success' => true]);
}

// ----------------------------------------------------------------- reset

function portal_reset() {
    only_methods(['POST']);
    $d = body_json();
    $token = (string) ($d['token'] ?? '');
    $pass  = (string) ($d['password'] ?? '');
    if (strlen($pass) < MIN_PASS) {
        json_error('La contrasena debe tener al menos ' . MIN_PASS . ' caracteres.');
    }
    if ($token === '') {
        json_error('Falta el token.');
    }

    $found = portal_buscar('reset_token_hash', hash_token($token));
    if ($found === null) {
        json_error('Enlace invalido o ya utilizado.', 400);
    }
    $conn = $found['conn'];
    $row  = $found['row'];
    if ($row['reset_expira'] === null || strtotime($row['reset_expira']) < time()) {
        json_error('El enlace ha caducado. Pide otro desde "He olvidado mi contrasena".', 400);
    }

    $hash = password_hash($pass, PASSWORD_DEFAULT);
    $id = (int) $row['id'];
    $stmt = $conn->prepare("UPDATE portal_users SET password_hash = ?, estado = 'activo', reset_token_hash = NULL, reset_expira = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?");
    $stmt->bind_param('si', $hash, $id);
    $stmt->execute();
    $stmt->close();

    iniciar_sesion_paciente($row['client_id'], $found['sede'], $row['email']);
    $cliente = cliente_publico($conn, (int) $row['client_id'], $row['email']);
    $conn->close();
    json_out(['success' => true, 'cliente' => $cliente]);
}

// ----------------------------------------------- plantillas de email (HTML)

function email_wrap($contenido) {
    return
        '<div style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center">' .
        '<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">' .
        '<tr><td style="background:#1e2a5e;border-radius:12px 12px 0 0;padding:20px 26px;">' .
        '<span style="color:#fff;font-size:16px;font-weight:700;">HS Dental</span>' .
        '<span style="color:rgba(255,255,255,.6);font-size:12px;margin-left:10px;">Portal del paciente</span>' .
        '</td></tr>' .
        '<tr><td style="background:#ffffff;padding:28px 26px;">' . $contenido . '</td></tr>' .
        '<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:14px 26px;text-align:center;">' .
        '<p style="margin:0;font-size:12px;color:#9ca3af;">HS Dental · Este es un correo automatico.</p>' .
        '</td></tr>' .
        '</table></td></tr></table></div>';
}

function boton_email($texto, $url) {
    return '<div style="text-align:center;margin:6px 0;">' .
        '<a href="' . htmlspecialchars($url) . '" style="display:inline-block;background:#5671EB;color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:13px 26px;border-radius:10px;">' . htmlspecialchars($texto) . '</a>' .
        '</div>';
}

// ------------------------------------------------------------------ router

$accion = $_GET['accion'] ?? '';
switch ($accion) {
    case 'login':           portal_login();           break;
    case 'logout':          portal_logout();          break;
    case 'sesion':          portal_sesion();          break;
    case 'activar':         portal_activar();         break;
    case 'solicitar-reset': portal_solicitar_reset(); break;
    case 'reset':           portal_reset();           break;
    default:                json_error('Accion desconocida.', 404);
}
