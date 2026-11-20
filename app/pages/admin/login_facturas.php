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
    <link rel="stylesheet" href="/css/pages/admin.css">

    <link rel="icon" type="image/png" href="/assets/favicon/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png" />
    <link rel="manifest" href="/assets/favicon/site.webmanifest"/>
</head>
<body>
    <nav class="sidebar" id="sidebar"></nav>

    <div class="wrapper">
        <h1 class="page-title">Admin</h1>

        <main class="acceso">
            <section class="tarjeta acceso__tarjeta" aria-labelledby="acceso-titulo">
                <div class="acceso__icono" aria-hidden="true"><i class="ri-shield-keyhole-line"></i></div>
                <h2 class="acceso__titulo" id="acceso-titulo">Acceso a facturación</h2>
                <p class="acceso__intro">Introduce tus credenciales de administrador.</p>
                <?php if ($error): ?><p class="acceso__error" role="alert"><?= htmlspecialchars($error) ?></p><?php endif; ?>
                <form method="post" class="acceso__form">
                    <div class="form__group">
                        <label for="acceso-usuario" class="form__label">Usuario</label>
                        <input type="text" id="acceso-usuario" name="username" class="form__input" placeholder="Usuario admin" autocomplete="username" required>
                    </div>
                    <div class="form__group">
                        <label for="acceso-password" class="form__label">Contraseña</label>
                        <input type="password" id="acceso-password" name="password" class="form__input" placeholder="••••••••" autocomplete="current-password" required>
                    </div>
                    <button type="submit" class="boton boton--primario">Entrar <i class="ri-arrow-right-line" aria-hidden="true"></i></button>
                </form>
            </section>
        </main>
    </div>

    <script src="/js/main.js" type="module"></script>
</body>
</html>
