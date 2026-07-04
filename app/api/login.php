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
<meta name="theme-color" content="#191fbe">
<title>Acceso · HS Dental — <?= htmlspecialchars($clinicName) ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&display=swap" rel="stylesheet">
<style>
    :root{
        --primary:#2b80f7;
        --dark-primary:#191fbe;
        --light-primary:#839cff;
        --pale-primary:#e8f7ff;
        --bg:#FAFBFF;
        --ink:#1D242E;
        --muted:#6D6D6D;
        --faint:#9197B3;
        --line:#DCE0EA;
        --danger:#ed4646;
        --radius:16px;
    }

    *{ box-sizing:border-box; margin:0; padding:0; }

    html,body{ height:100%; }

    body{
        font-family:"Figtree",Arial,sans-serif;
        color:var(--ink);
        background:var(--bg);
        -webkit-font-smoothing:antialiased;
        text-rendering:optimizeLegibility;
    }

    .auth{
        min-height:100dvh;
        display:grid;
        grid-template-columns:1fr;
    }

    /* ---------- Panel de marca ---------- */
    .brand{
        position:relative;
        overflow:hidden;
        display:flex;
        flex-direction:column;
        justify-content:space-between;
        padding:34px 30px;
        min-height:210px;
        color:#fff;
        background:
            radial-gradient(120% 120% at 100% 0%, #3b8bff 0%, rgba(59,139,255,0) 45%),
            linear-gradient(150deg, #2b80f7 0%, #2447d6 52%, #191fbe 100%);
        isolation:isolate;
    }

    /* Aurora en movimiento */
    .brand__aurora{
        position:absolute; inset:-30% -10%;
        z-index:-1;
        filter:blur(46px);
        opacity:.55;
        pointer-events:none;
    }
    .brand__aurora span{
        position:absolute;
        border-radius:50%;
        mix-blend-mode:screen;
    }
    .brand__aurora span:nth-child(1){
        width:46%; aspect-ratio:1; left:52%; top:8%;
        background:radial-gradient(circle, #7fb2ff 0%, transparent 70%);
        animation:drift1 16s ease-in-out infinite alternate;
    }
    .brand__aurora span:nth-child(2){
        width:40%; aspect-ratio:1; left:-6%; top:38%;
        background:radial-gradient(circle, #63e0ff 0%, transparent 70%);
        animation:drift2 20s ease-in-out infinite alternate;
    }
    .brand__aurora span:nth-child(3){
        width:34%; aspect-ratio:1; left:24%; top:66%;
        background:radial-gradient(circle, #b39dff 0%, transparent 70%);
        animation:drift3 24s ease-in-out infinite alternate;
    }
    @keyframes drift1{ to{ transform:translate3d(-14%,10%,0) scale(1.15);} }
    @keyframes drift2{ to{ transform:translate3d(12%,-8%,0) scale(1.2);} }
    @keyframes drift3{ to{ transform:translate3d(8%,-14%,0) scale(1.1);} }

    /* Diente line-art de fondo */
    .brand__tooth{
        position:absolute;
        right:-70px; bottom:-70px;
        width:340px; height:auto;
        color:#fff;
        opacity:.10;
        z-index:-1;
        pointer-events:none;
    }

    .brand__mark{
        display:flex; align-items:center; gap:12px;
        position:relative; z-index:1;
    }
    .brand__glyph{
        width:38px; height:38px;
        display:grid; place-items:center;
        border-radius:11px;
        background:rgba(255,255,255,.16);
        border:1px solid rgba(255,255,255,.28);
        backdrop-filter:blur(2px);
    }
    .brand__glyph svg{ width:22px; height:22px; color:#fff; }
    .brand__word{ font-size:1.18rem; font-weight:800; letter-spacing:-.01em; line-height:1; }
    .brand__word small{ display:block; font-size:.62rem; font-weight:600; letter-spacing:.32em; opacity:.8; margin-top:4px; }

    .brand__copy{ position:relative; z-index:1; max-width:30ch; }
    .brand__headline{
        font-size:clamp(1.5rem, 4.2vw, 2.35rem);
        font-weight:800;
        line-height:1.08;
        letter-spacing:-.025em;
        text-wrap:balance;
    }
    .brand__sub{
        margin-top:14px;
        font-size:.98rem;
        line-height:1.55;
        color:rgba(255,255,255,.82);
        font-weight:400;
    }
    .brand__meta{
        display:none;
        position:relative; z-index:1;
        font-size:.8rem;
        color:rgba(255,255,255,.72);
        font-weight:500;
    }

    /* ---------- Panel del formulario ---------- */
    .panel{
        display:flex;
        align-items:center;
        justify-content:center;
        padding:40px 24px;
    }
    .card{
        width:100%;
        max-width:400px;
        animation:rise .6s cubic-bezier(.16,1,.3,1) both;
    }
    @keyframes rise{ from{ opacity:0; transform:translateY(14px);} to{ opacity:1; transform:none;} }

    .logo{
        height:52px; width:auto;
        margin-bottom:26px;
        display:block;
    }

    .clinic-pill{
        display:inline-flex; align-items:center; gap:8px;
        padding:6px 13px 6px 10px;
        border-radius:999px;
        background:var(--pale-primary);
        color:var(--dark-primary);
        font-size:.8rem; font-weight:600;
        letter-spacing:.01em;
    }
    .clinic-pill .dot{
        width:7px; height:7px; border-radius:50%;
        background:var(--primary);
        box-shadow:0 0 0 4px rgba(43,128,247,.18);
    }

    h1{
        margin:18px 0 6px;
        font-size:1.7rem;
        font-weight:800;
        letter-spacing:-.02em;
        color:var(--ink);
        text-wrap:balance;
    }
    .lede{
        color:var(--muted);
        font-size:.95rem;
        line-height:1.5;
        margin-bottom:26px;
    }

    form{ display:flex; flex-direction:column; gap:18px; }

    .field{ display:flex; flex-direction:column; gap:8px; }
    .field label{
        font-size:.875rem; font-weight:600; color:var(--ink);
    }

    .input-wrap{ position:relative; display:flex; align-items:center; }
    .input-wrap input{
        width:100%;
        padding:13px 46px 13px 16px;
        font-family:inherit;
        font-size:1rem;
        color:var(--ink);
        background:#fff;
        border:1px solid var(--line);
        border-radius:12px;
        transition:border-color .2s ease, box-shadow .2s ease;
    }
    .input-wrap input::placeholder{ color:var(--faint); }
    .input-wrap input:focus-visible{
        outline:none;
        border-color:var(--primary);
        box-shadow:0 0 0 3px rgba(43,128,247,.15);
    }
    .toggle{
        position:absolute; right:6px;
        width:34px; height:34px;
        display:grid; place-items:center;
        border:none; background:transparent;
        color:var(--faint); cursor:pointer;
        border-radius:9px;
        transition:color .2s ease, background-color .2s ease;
    }
    .toggle:hover{ color:var(--muted); background:var(--bg); }
    .toggle:focus-visible{ outline:2px solid var(--primary); outline-offset:2px; }
    .toggle svg{ width:19px; height:19px; }
    .toggle .eye-off{ display:none; }
    .toggle.is-on .eye{ display:none; }
    .toggle.is-on .eye-off{ display:block; }

    .alert{
        display:flex; align-items:center; gap:10px;
        padding:12px 14px;
        background:#fdecec;
        color:#b42020;
        border:1px solid #f6c9c9;
        border-radius:12px;
        font-size:.9rem; font-weight:500;
        animation:shake .4s ease;
    }
    .alert svg{ width:18px; height:18px; flex-shrink:0; }
    @keyframes shake{
        0%,100%{ transform:translateX(0);}
        20%,60%{ transform:translateX(-5px);}
        40%,80%{ transform:translateX(5px);}
    }

    .submit{
        position:relative;
        height:50px;
        display:flex; align-items:center; justify-content:center; gap:9px;
        border:none; border-radius:12px;
        background:var(--primary);
        color:#fff;
        font-family:inherit; font-size:1.03rem; font-weight:700;
        cursor:pointer;
        box-shadow:0 8px 18px rgba(43,128,247,.28);
        transition:background-color .2s ease, box-shadow .2s ease, transform .15s ease;
    }
    .submit:hover, .submit:focus-visible{
        background:var(--dark-primary);
        box-shadow:0 10px 24px rgba(43,128,247,.36);
        transform:translateY(-2px);
        outline:none;
    }
    .submit:active{ transform:translateY(0); }
    .submit svg.arrow{ width:18px; height:18px; transition:transform .2s ease; }
    .submit:hover svg.arrow{ transform:translateX(3px); }

    .submit.is-loading{ pointer-events:none; color:transparent; }
    .submit.is-loading::after{
        content:"";
        position:absolute;
        width:20px; height:20px;
        border:2.5px solid rgba(255,255,255,.4);
        border-top-color:#fff;
        border-radius:50%;
        animation:spin .7s linear infinite;
    }
    @keyframes spin{ to{ transform:rotate(360deg);} }

    .back{
        margin-top:26px;
        display:inline-flex; align-items:center; gap:7px;
        color:var(--muted);
        font-size:.875rem; font-weight:600;
        text-decoration:none;
        transition:color .2s ease, gap .2s ease;
    }
    .back:hover{ color:var(--primary); gap:10px; }
    .back svg{ width:16px; height:16px; }

    /* ---------- Desktop: split ---------- */
    @media (min-width:900px){
        .auth{ grid-template-columns:1.05fr .95fr; }
        .brand{
            padding:56px 52px;
            min-height:auto;
        }
        .brand__meta{ display:block; }
        .brand__tooth{ width:460px; right:-90px; bottom:-90px; }
        .panel{ padding:48px; }
        .card{ max-width:388px; }
    }

    @media (min-width:1280px){
        .brand{ padding:72px 76px; }
    }

    @media (prefers-reduced-motion:reduce){
        .brand__aurora span{ animation:none; }
        .card, .alert{ animation:none; }
        .submit, .back, .submit svg.arrow, .toggle, .input-wrap input{ transition:none; }
    }
</style>
<script>
    // Pasamos la clínica al frontend
    window.CLINIC = "<?= ($_SESSION['clinic_id'] == 1 ? 'clinic1' : 'clinic2') ?>";
</script>
</head>
<body>
<main class="auth">

    <aside class="brand">
        <div class="brand__aurora" aria-hidden="true"><span></span><span></span><span></span></div>
        <svg class="brand__tooth" viewBox="0 0 100 110" fill="none" aria-hidden="true">
            <path d="M50 8C34 8 22 18 22 33c0 13 3 27 7 43 3 13 10 20 13 8 3-11 4-22 8-22s5 11 8 22c3 12 10 5 13-8 4-16 7-30 7-43C78 18 66 8 50 8Z"
                stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
        </svg>

        <div class="brand__mark">
            <span class="brand__glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                    <path d="M12 3C8.5 3 6.3 5 6.3 8.2c0 2.7.7 5.6 1.6 8.9.7 2.6 2.1 4 2.7 1.7.6-2.3.8-4.5 1.4-4.5s.8 2.2 1.4 4.5c.6 2.3 2 .9 2.7-1.7.9-3.3 1.6-6.2 1.6-8.9C17.7 5 15.5 3 12 3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
                </svg>
            </span>
            <span class="brand__word">HS Dental<small>EL GRECO</small></span>
        </div>

        <div class="brand__copy">
            <h2 class="brand__headline">El panel de tu clínica, listo cuando tú lo estás.</h2>
            <p class="brand__sub">Citas, pacientes, tratamientos y facturación en un mismo lugar. Accede para continuar.</p>
        </div>

        <div class="brand__meta">Clínicas HS Dental · Alcorcón &amp; Móstoles</div>
    </aside>

    <section class="panel">
        <div class="card">
            <img class="logo" src="/assets/images/logoCompleto.jpg" alt="HS Dental" width="130" height="52">

            <span class="clinic-pill"><span class="dot"></span>Clínica de <?= htmlspecialchars($clinicName) ?></span>

            <h1>Bienvenido de nuevo</h1>
            <p class="lede">Introduce tu contraseña para acceder al panel de gestión.</p>

            <?php if($error): ?>
                <div class="alert" role="alert">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
                        <path d="M12 7.5v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                        <circle cx="12" cy="16" r="1.1" fill="currentColor"/>
                    </svg>
                    <?= htmlspecialchars($error) ?>
                </div>
            <?php endif; ?>

            <form method="post" id="loginForm" novalidate>
                <div class="field">
                    <label for="password">Contraseña</label>
                    <div class="input-wrap">
                        <input type="password" id="password" name="password"
                               placeholder="Tu contraseña"
                               autocomplete="current-password"
                               autofocus required>
                        <button type="button" class="toggle" id="togglePw"
                                aria-label="Mostrar contraseña" aria-pressed="false">
                            <svg class="eye" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
                            </svg>
                            <svg class="eye-off" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                                <path d="M9.5 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.8 3.4M6.3 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <button type="submit" class="submit" id="submitBtn">
                    Entrar al panel
                    <svg class="arrow" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </form>

            <a class="back" href="../index.php">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Elegir otra clínica
            </a>
        </div>
    </section>

</main>

<script>
    // Mostrar / ocultar contraseña
    const pw = document.getElementById('password');
    const toggle = document.getElementById('togglePw');
    toggle.addEventListener('click', () => {
        const show = pw.type === 'password';
        pw.type = show ? 'text' : 'password';
        toggle.classList.toggle('is-on', show);
        toggle.setAttribute('aria-pressed', String(show));
        toggle.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
        pw.focus();
    });

    // Estado de carga al enviar
    const form = document.getElementById('loginForm');
    const btn = document.getElementById('submitBtn');
    form.addEventListener('submit', () => {
        if (form.checkValidity()) btn.classList.add('is-loading');
    });
</script>
</body>
</html>
