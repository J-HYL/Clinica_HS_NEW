<?php
// api/login.php
session_start();
require_once "db_connect.php";

// Redirigir a index si no hay clínica seleccionada
if (!isset($_SESSION['clinic_id'])) {
    header("Location: ../index.php");
    exit();
}

// Datos de la clínica
$clinicName = ($_SESSION['clinic_id'] == 1) ? "Alcorcón" : "Móstoles";
$defaultUser = ($_SESSION['clinic_id'] == 1) ? "alcrcnHS" : "mstlsHS";

$error = '';

// Procesar formulario
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $conn = getConnection();
    $password = $_POST['password'];

    $stmt = $conn->prepare("SELECT username, password FROM users WHERE username = ? LIMIT 1");
    $stmt->bind_param("s", $defaultUser);
    $stmt->execute();
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();

    if ($user && hash("sha256", $password) === trim($user["password"])) {
        $_SESSION['logged_in'] = true;
        $_SESSION['user'] = $user['username'];
        header("Location: ../index.html"); // Redirige al panel principal
        exit();
    } else {
        $error = "Contraseña incorrecta";
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Login HS Dental - <?= htmlspecialchars($clinicName) ?></title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:Arial,sans-serif; }
    body {
        height:100vh;
        display:flex;
        justify-content:center;
        align-items:center;
        flex-direction:column;
        background: url('https://wallpapers.com/images/high/dental-background-7680-x-4320-usct49wy8uz5bssx.webp') no-repeat center center fixed;
        background-size: cover;
        position: relative;
        color:#fff;
        text-align:center;
    }
    body::before {
        content:''; position:absolute; top:0; left:0; width:100%; height:100%;
        background: rgba(0,0,0,0.4); z-index:0;
    }
    .login-container {
        position: relative; z-index:1;
        background: rgba(255,255,255,0.15);
        backdrop-filter: blur(12px);
        padding: 40px 30px;
        border-radius: 20px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
        width: 100%; max-width: 400px;
        text-align:center;
    }
    h1 { margin-bottom:30px; font-size:2rem; text-shadow: 2px 2px 8px rgba(0,0,0,0.7); }
    input[type="password"] {
        width: 100%; padding: 12px 15px; margin-bottom: 20px;
        border-radius: 10px; border: 1px solid rgba(255,255,255,0.3);
        background: rgba(255,255,255,0.2); color: #fff; font-size:1rem; outline:none;
    }
    input::placeholder { color: #eee; }
    button {
        width: 100%; padding: 12px; border:none; border-radius: 10px;
        background: rgba(255,255,255,0.25); color:#fff; font-size:1.1rem; cursor:pointer;
        transition: all 0.3s ease;
    }
    button:hover { background: rgba(255,255,255,0.4); }
    .error { color: #ff6b6b; margin-bottom: 15px; font-weight: bold; }
    @media(max-width:500px){ .login-container { padding: 30px 20px; } h1 { font-size:1.5rem; } }
</style>
<script>
    // Pasamos la clínica al frontend
    window.CLINIC = "<?= ($_SESSION['clinic_id'] == 1 ? 'clinic1' : 'clinic2') ?>";
</script>
</head>
<body>
<div class="login-container">
    <h1><?= htmlspecialchars($clinicName) ?></h1>
    <?php if($error): ?>
        <div class="error"><?= htmlspecialchars($error) ?></div>
    <?php endif; ?>
    <form method="post">
        <input type="password" name="password" placeholder="Contraseña" required>
        <button type="submit">Ingresar</button>
    </form>
</div>
</body>
</html>
