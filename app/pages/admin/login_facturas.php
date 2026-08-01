<?php
session_start();

require_once "../../api/db_connect.php";

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $conn = getConnection();
    $username = trim($_POST['username']);
    $password = $_POST['password'];

    $stmt = $conn->prepare("SELECT username, password, role FROM users WHERE username = ? AND role = 'admin' LIMIT 1");
    $stmt->bind_param("s", $username);
    $stmt->execute();
    $user = $stmt->get_result()->fetch_assoc();

    if ($user && hash("sha256", $password) === trim($user['password'])) {
        $_SESSION['facturas_admin'] = true;
        $_SESSION['admin_user'] = $user['username'];
        header("Location: panel_facturas.php");
        exit();
    } else {
        $error = "Usuario o contraseña incorrectos";
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Acceso Admin · HS Dental</title>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.6.0/remixicon.min.css" integrity="sha512-XcIsjKMcuVe0Ucj/xgIXQnytNwBttJbNjltBV18IOnru2lDPe9KRRyvCXw6Y5H415vbBLRm8+q6fmLUU7DfO6Q==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="/css/pages/control.css">

    <link rel="icon" type="image/png" href="/assets/favicon/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png" />
    <link rel="manifest" href="/assets/favicon/site.webmanifest"/>
    <style>
        .admin-login{ min-height: 68vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .admin-login__card{ width: 100%; max-width: 380px; background: #fff; border-radius: 16px;
            box-shadow: 0 10px 30px rgba(16,24,40,.10); padding: 34px 28px; text-align: center; }
        .admin-login__icon{ width: 62px; height: 62px; border-radius: 16px; display: grid; place-items: center;
            margin: 0 auto 16px; background: var(--pale-primary); color: var(--primary); font-size: 30px; }
        .admin-login__card h2{ font-size: 1.4rem; color: #111827; margin-bottom: 6px; }
        .admin-login__card p{ color: #6b7280; font-size: .9rem; margin-bottom: 20px; }
        .admin-login__error{ background: #fdeceb; color: #c62a22; font-size: .85rem; font-weight: 600;
            padding: 10px 12px; border-radius: 8px; margin-bottom: 16px; }
        .admin-login form{ display: flex; flex-direction: column; gap: 14px; text-align: left; }
        .admin-login label{ display: flex; flex-direction: column; gap: 6px; font-size: .85rem; font-weight: 600; color: #374151; }
        .admin-login input{ padding: 11px 14px; border: 1px solid #d1d5db; border-radius: 10px; font-size: 1rem; }
        .admin-login input:focus{ outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(43,128,247,.15); }
        .admin-login button{ margin-top: 6px; background: var(--primary); color: #fff; border: none; border-radius: 10px;
            padding: 12px; font-size: 1rem; font-weight: 600; cursor: pointer; display: flex; align-items: center;
            justify-content: center; gap: 8px; transition: background .2s ease-in-out; }
        .admin-login button:hover{ background: #1e5fd0; }
    </style>
</head>
<body>
    <nav class="sidebar" id="sidebar"></nav>

    <div class="wrapper">
        <header class="header">
            <div class="header__group">
                <button class="header__menu" aria-label="Abrir Sidebar"><i class="ri-menu-line"></i></button>
                <h1 class="header__heading">HS Dental - <span>Acceso Admin</span></h1>
            </div>
        </header>

        <main class="container">
            <div class="admin-login">
                <div class="admin-login__card">
                    <div class="admin-login__icon"><i class="ri-shield-keyhole-line"></i></div>
                    <h2>Acceso a facturación</h2>
                    <p>Introduce tus credenciales de administrador.</p>
                    <?php if ($error): ?><div class="admin-login__error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
                    <form method="post">
                        <label>Usuario
                            <input type="text" name="username" placeholder="Usuario admin" autocomplete="username" required>
                        </label>
                        <label>Contraseña
                            <input type="password" name="password" placeholder="••••••••" autocomplete="current-password" required>
                        </label>
                        <button type="submit">Entrar <i class="ri-arrow-right-line"></i></button>
                    </form>
                </div>
            </div>
        </main>
    </div>

    <script src="/js/main.js" type="module"></script>
</body>
</html>
