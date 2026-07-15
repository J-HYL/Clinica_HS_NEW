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
<meta name="theme-color" content="#191fbe">
<title>Elige tu clínica · HS Dental</title>

<!-- PWA: esta es la pagina de entrada real (DirectoryIndex api/index.php),
     asi que el manifest tiene que estar aqui para poder instalar la app. -->
<link rel="manifest" href="/assets/favicon/site.webmanifest"/>
<link rel="icon" type="image/png" href="/assets/favicon/favicon-96x96.png" sizes="96x96"/>
<link rel="apple-touch-icon" href="/assets/favicon/apple-touch-icon.png"/>
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="HS Dental">
<script src="/js/pwa.js" defer></script>

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
    }

    *{ box-sizing:border-box; margin:0; padding:0; }
    html,body{ min-height:100%; }

    body{
        font-family:"Figtree",Arial,sans-serif;
        color:var(--ink);
        background:var(--bg);
        min-height:100dvh;
        display:flex;
        flex-direction:column;
        -webkit-font-smoothing:antialiased;
        text-rendering:optimizeLegibility;
    }

    /* Fondo ambiental muy sutil */
    body::before{
        content:"";
        position:fixed; inset:0;
        z-index:-1;
        background:
            radial-gradient(60% 55% at 12% 0%, rgba(43,128,247,.10) 0%, transparent 60%),
            radial-gradient(55% 55% at 100% 100%, rgba(131,156,255,.12) 0%, transparent 60%);
        pointer-events:none;
    }

    .shell{
        width:100%;
        max-width:960px;
        margin:auto;
        padding:48px 24px 40px;
        text-align:center;
    }

    .brand{
        display:inline-flex;
        justify-content:center;
        margin-bottom:40px;
    }
    .brand__logo{
        display:block;
        width:clamp(160px, 46vw, 230px);
        height:auto;
        /* Funde el fondo blanco del logo con el de la página: se ve suelto, sin caja. */
        mix-blend-mode:multiply;
    }

    h1{
        font-size:clamp(1.9rem, 5vw, 2.9rem);
        font-weight:800;
        letter-spacing:-.03em;
        line-height:1.05;
        text-wrap:balance;
    }
    .lede{
        margin:16px auto 0;
        max-width:46ch;
        color:var(--muted);
        font-size:1.05rem;
        line-height:1.55;
    }

    .grid{
        margin-top:44px;
        display:grid;
        gap:22px;
        grid-template-columns:1fr;
    }

    .clinic{
        position:relative;
        overflow:hidden;
        display:flex;
        align-items:center;
        gap:18px;
        text-align:left;
        text-decoration:none;
        padding:26px 24px;
        background:#fff;
        border:1px solid var(--line);
        border-radius:22px;
        box-shadow:0 12px 34px rgba(29,36,46,.05);
        transition:transform .28s cubic-bezier(.16,1,.3,1), box-shadow .28s ease, border-color .28s ease;
        animation:rise .6s cubic-bezier(.16,1,.3,1) both;
    }
    .clinic:nth-child(2){ animation-delay:.09s; }
    @keyframes rise{ from{ opacity:0; transform:translateY(16px);} to{ opacity:1; transform:none;} }

    .clinic:hover, .clinic:focus-visible{
        transform:translateY(-4px);
        border-color:transparent;
        box-shadow:0 22px 46px rgba(43,128,247,.20);
        outline:none;
    }
    .clinic:focus-visible{ box-shadow:0 0 0 3px rgba(43,128,247,.4), 0 22px 46px rgba(43,128,247,.20); }

    .clinic__icon{
        flex-shrink:0;
        width:58px; height:58px;
        display:grid; place-items:center;
        border-radius:16px;
        color:var(--primary);
        background:var(--pale-primary);
        transition:background-color .28s ease, color .28s ease, transform .28s ease;
    }
    .clinic__icon svg{ width:28px; height:28px; }
    .clinic:hover .clinic__icon, .clinic:focus-visible .clinic__icon{
        background:linear-gradient(150deg, var(--primary), var(--dark-primary));
        color:#fff;
        transform:scale(1.05);
    }

    .clinic__body{ flex:1; min-width:0; }
    .clinic__eyebrow{
        font-size:.72rem; font-weight:700; letter-spacing:.14em;
        text-transform:uppercase; color:var(--faint);
    }
    .clinic__name{
        margin-top:3px;
        font-size:1.4rem; font-weight:800; letter-spacing:-.02em;
        color:var(--ink);
    }
    .clinic__addr{
        margin-top:5px;
        display:flex; align-items:center; gap:6px;
        font-size:.9rem; color:var(--muted);
    }
    .clinic__addr svg{ width:14px; height:14px; color:var(--faint); flex-shrink:0; }

    .clinic__go{
        flex-shrink:0;
        width:42px; height:42px;
        display:grid; place-items:center;
        border-radius:50%;
        color:var(--faint);
        background:var(--bg);
        transition:color .28s ease, background-color .28s ease, transform .28s ease;
    }
    .clinic__go svg{ width:20px; height:20px; }
    .clinic:hover .clinic__go, .clinic:focus-visible .clinic__go{
        color:#fff;
        background:var(--primary);
        transform:translateX(3px);
    }

    footer{
        text-align:center;
        padding:22px;
        color:var(--faint);
        font-size:.82rem;
    }

    @media (min-width:720px){
        .shell{ padding:72px 32px 48px; }
        .grid{ grid-template-columns:1fr 1fr; gap:24px; }
        .clinic{ flex-direction:column; align-items:flex-start; text-align:left; padding:32px 30px; gap:22px; }
        .clinic__row{ display:flex; align-items:center; gap:16px; width:100%; }
        .clinic__go{ position:absolute; top:26px; right:26px; }
    }

    @media (prefers-reduced-motion:reduce){
        .clinic{ animation:none; transition:box-shadow .2s ease; }
        .clinic:hover, .clinic:focus-visible{ transform:none; }
        .clinic__icon, .clinic__go{ transition:none; }
    }
</style>
</head>
<body>
    <div class="shell">
        <div class="brand">
            <img src="/assets/images/logoCompleto.jpg" alt="HS Dental El Greco" class="brand__logo">
        </div>

        <h1>Selecciona tu clínica</h1>
        <p class="lede">Elige la sede con la que vas a trabajar para acceder a su panel de gestión.</p>

        <div class="grid">
            <a class="clinic" href="?clinic=alcorcon">
                <div class="clinic__row">
                    <span class="clinic__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M3 21V9l9-6 9 6v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                            <path d="M3 21h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M9.5 21v-5h5v5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="clinic__body">
                        <span class="clinic__eyebrow">Sede</span>
                        <span class="clinic__name">Alcorcón</span>
                        <span class="clinic__addr">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                            </svg>
                            Comunidad de Madrid
                        </span>
                    </span>
                </div>
                <span class="clinic__go" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
            </a>

            <a class="clinic" href="?clinic=mostoles">
                <div class="clinic__row">
                    <span class="clinic__icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none">
                            <path d="M3 21V9l9-6 9 6v12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                            <path d="M3 21h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                            <path d="M9.5 21v-5h5v5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                        </svg>
                    </span>
                    <span class="clinic__body">
                        <span class="clinic__eyebrow">Sede</span>
                        <span class="clinic__name">Móstoles</span>
                        <span class="clinic__addr">
                            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
                                <circle cx="12" cy="10" r="2.4" stroke="currentColor" stroke-width="1.8"/>
                            </svg>
                            Comunidad de Madrid
                        </span>
                    </span>
                </div>
                <span class="clinic__go" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </span>
            </a>
        </div>
    </div>

    <footer>© HS Dental El Greco · Portal de gestión interna</footer>
    <!-- Marquesina de aviso de entorno de pruebas (se autoinyecta solo en pre.*) -->
    <script src="/js/entorno.js"></script>
</body>
</html>
