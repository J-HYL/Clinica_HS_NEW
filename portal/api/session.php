<?php
// portal/api/session.php
// Arranque de sesion del portal con cookies endurecidas. Incluir ANTES de tocar
// $_SESSION. La sesion es INDEPENDIENTE de la del panel: nombre de cookie propio
// (PORTALSESSID) y, ademas, el portal vive en otro subdominio, asi que la cookie
// no colisiona con la de app.hsdental.es.

if (session_status() === PHP_SESSION_NONE) {
    // En prod/pre siempre es HTTPS -> Secure. En local (http) no forzamos Secure
    // o el navegador no guardaria la cookie.
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
          || (($_SERVER['SERVER_PORT'] ?? '') == 443)
          || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,
        'httponly' => true,      // JS no puede leer la cookie de sesion
        'samesite' => 'Lax',     // se envia en navegacion normal, no en cross-site POST
    ]);
    session_name('PORTALSESSID');
    session_start();
}
