<?php
// index.php
session_start();

// Guardar elección de clínica
if (isset($_GET['clinic'])) {
    $clinic = $_GET['clinic'];

    if ($clinic === 'alcorcon') {
        $_SESSION['clinic_id'] = 1;
        header("Location: api/login.php");
        exit();
    } elseif ($clinic === 'mostoles') {
        $_SESSION['clinic_id'] = 2;
        header("Location: api/login.php");
        exit();
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenido a HS Dental</title>
<style>
    * { margin:0; padding:0; box-sizing:border-box; font-family:Arial,sans-serif; }
    body {
        height:100vh;
        display:flex;
        justify-content:center;
        align-items:center;
        flex-direction:column;
        background: url('https://wallpapers.com/images/hd/dental-background-7680-x-4320-usct49wy8uz5bssx.jpg') no-repeat center center fixed;
        background-size: cover;
        position: relative;
        color:#fff;
        text-align:center;
    }
    body::before {
        content: '';
        position: absolute;
        top:0; left:0; width:100%; height:100%;
        background: rgba(0,0,0,0.4);
        z-index:0;
    }
    h1 {
        position: relative;
        z-index:1;
        margin-bottom:50px;
        font-size:2.5rem;
        text-shadow: 2px 2px 8px rgba(0,0,0,0.7);
    }
    .container {
        position: relative;
        z-index:1;
        display:flex;
        gap:40px;
        flex-wrap:wrap;
        justify-content:center;
    }
    .clinic-button {
        width:200px; height:200px;
        background: rgba(255,255,255,0.15);
        backdrop-filter: blur(10px);
        border-radius:20px;
        display:flex;
        justify-content:center;
        align-items:center;
        font-size:1.5rem;
        cursor:pointer;
        transition: all 0.3s ease;
        text-decoration:none;
        color:#fff;
        border: 1px solid rgba(255,255,255,0.3);
        box-shadow: 0 8px 30px rgba(0,0,0,0.3);
    }
    .clinic-button:hover {
        background: rgba(255,255,255,0.3);
        transform: scale(1.1);
    }
    @media(max-width:600px){
        .container { flex-direction:column; gap:20px; }
        .clinic-button { width:150px; height:150px; font-size:1.2rem; }
        h1 { font-size:2rem; margin-bottom:30px; }
    }
</style>
</head>
<body>
<h1>Bienvenido a HS Dental</h1>
<div class="container">
    <a href="?clinic=alcorcon" class="clinic-button">Alcorcón</a>
    <a href="?clinic=mostoles" class="clinic-button">Móstoles</a>
</div>
</body>
</html>
