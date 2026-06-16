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
    $result = $stmt->get_result();
    $user = $result->fetch_assoc();

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
<title>Acceso Admin- HS Dental</title>
<style>
body {
    height:100vh; display:flex; justify-content:center; align-items:center;
    background: url('https://wallpapers.com/images/hd/dental-background-7680-x-4320-usct49wy8uz5bssx.jpg') no-repeat center center fixed;
    background-size: cover; color:white; font-family:Arial,sans-serif;
}
form {
    background: rgba(0,0,0,0.6); padding: 30px 40px; border-radius: 10px; text-align:center;
    box-shadow: 0 8px 30px rgba(0,0,0,0.3);
}
input {
    display:block; width:100%; margin-bottom:15px; padding:10px; border-radius:5px; border:none;
}
button {
    width:100%; padding:10px; background:#00bcd4; border:none; border-radius:5px; color:white; font-size:1rem;
    cursor:pointer;
}
button:hover { background:#0097a7; }
.error { color:#ff6b6b; margin-bottom:10px; font-weight:bold; }
</style>
</head>
<body>
<form method="post">
    <h2>Admin</h2>
    <?php if($error): ?><div class="error"><?= htmlspecialchars($error) ?></div><?php endif; ?>
    <input type="text" name="username" placeholder="Usuario" required>
    <input type="password" name="password" placeholder="Contraseña" required>
    <button type="submit">Entrar</button>
</form>
</body>
</html>