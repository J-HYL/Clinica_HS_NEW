<?php
// Guardia de sesion: solo el admin (login_facturas.php) puede ver este panel.
session_start();
if (empty($_SESSION['facturas_admin'])) {
    header('Location: login_facturas.php');
    exit;
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>HS Dental - Admin</title>

    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.6.0/remixicon.min.css" integrity="sha512-XcIsjKMcuVe0Ucj/xgIXQnytNwBttJbNjltBV18IOnru2lDPe9KRRyvCXw6Y5H415vbBLRm8+q6fmLUU7DfO6Q==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <link rel="stylesheet" href="/css/lib/datatables.min.css" />
    <link rel="stylesheet" href="/css/pages/control.css">

    <link rel="icon" type="image/png" href="/assets/favicon/favicon-96x96.png" sizes="96x96" />
    <link rel="icon" type="image/svg+xml" href="/assets/favicon/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/favicon/apple-touch-icon.png" />
    <link rel="manifest" href="/assets/favicon/site.webmanifest"/>
    <style>
        /* Pestañas Facturas / Pagos (mismo patrón que la ficha del paciente) */
        .tabs{ display: flex; gap: 4px; border-bottom: 2px solid #e6e8ef; margin-bottom: 1.5rem; align-items: center; }
        .tab{ appearance: none; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -2px;
            padding: 12px 22px; font-size: 1rem; font-weight: 600; color: #667085; cursor: pointer; transition: color .2s, border-color .2s; }
        .tab:hover{ color: #3b82f6; }
        .tab--active{ color: #3b82f6; border-bottom-color: #3b82f6; }
        .tab-panel[hidden]{ display: none; }
        .tabs__salir{ margin-left: auto; color: #c62a22; font-weight: 600; font-size: .9rem; text-decoration: none;
            display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; }
        .tabs__salir:hover{ background: #fdeceb; }
        .admin-empty{ text-align: center; color: #9ca3af; padding: 40px 16px; }

        /* Modal Registrar pago */
        dialog.pago-modal{ margin: auto; width: 460px; max-width: calc(100vw - 24px); border: none; border-radius: 16px;
            padding: 24px; box-shadow: 0 24px 60px rgba(17,24,39,.28); }
        dialog.pago-modal::backdrop{ background: rgba(17,24,39,.45); }
        .pago-modal h3{ font-size: 1.2rem; color: #111827; margin-bottom: 18px; }
        .pago-form label{ display: flex; flex-direction: column; gap: 6px; font-size: .85rem; font-weight: 600; color: #374151; margin-bottom: 14px; position: relative; }
        .pago-form input, .pago-form select{ padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 9px; font-size: .95rem; font-family: inherit; }
        .pago-form input:focus, .pago-form select:focus{ outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(43,128,247,.15); }
        .pago-row{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        /* Autocompletado de cliente */
        .pago-ac{ position: absolute; top: 100%; left: 0; right: 0; z-index: 5; background: #fff; border: 1px solid #e5e7eb;
            border-radius: 10px; box-shadow: 0 10px 24px rgba(16,24,40,.14); max-height: 220px; overflow: auto; display: none; }
        .pago-ac.show{ display: block; }
        .pago-ac__item{ padding: 9px 12px; font-size: .9rem; cursor: pointer; font-weight: 500; color: #374151; }
        .pago-ac__item:hover, .pago-ac__item--active{ background: #eef1fe; color: var(--primary); }
        .pago-modal__actions{ display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
        .pago-btn{ border: none; border-radius: 10px; padding: 10px 18px; font-size: .95rem; font-weight: 600; cursor: pointer; }
        .pago-btn--ghost{ background: #f3f4f6; color: #374151; }
        .pago-btn--ok{ background: var(--primary); color: #fff; }
        .pago-btn--ok:disabled{ opacity: .5; cursor: default; }
    </style>
</head>
<body>
    <nav class="sidebar" id="sidebar"></nav>

    <div class="wrapper">
        <header class="header">
            <div class="header__group">
                <button class="header__menu" aria-label="Abrir Sidebar"><i class="ri-menu-line"></i></button>
                <h1 class="header__heading">HS Dental - <span>Admin</span></h1>
            </div>
        </header>

        <main class="container main">
            <div class="tabs" role="tablist">
                <button type="button" class="tab tab--active" data-tab="facturas">Facturas</button>
                <button type="button" class="tab" data-tab="pagos">Pagos</button>
                <a class="tabs__salir" href="logout_facturas.php"><i class="ri-logout-box-r-line"></i> Salir</a>
            </div>

            <!-- Tab Facturas -->
            <div class="tab-panel" id="panel-facturas">
                <div class="admin-empty" id="facturas-empty" hidden>No hay facturas emitidas todavía.</div>
                <table id="table-facturas"></table>
            </div>

            <!-- Tab Pagos -->
            <div class="tab-panel" id="panel-pagos" hidden>
                <div class="main__group">
                    <h3 class="container__heading">Pagos registrados</h3>
                    <div class="main__actions">
                        <a href="#" class="main__action" id="btn-registrar-pago"><span>Registrar pago</span> <i class="ri-add-line"></i></a>
                    </div>
                </div>
                <div class="admin-empty" id="pagos-empty" hidden>No hay pagos registrados todavía.</div>
                <table id="table-pagos"></table>
            </div>
        </main>
    </div>

    <!-- Modal: Registrar pago -->
    <dialog id="pago-modal" class="pago-modal">
        <form class="pago-form" id="pago-form">
            <h3>Registrar pago</h3>
            <label>Cliente
                <input type="text" id="pago-cliente" placeholder="Escribe el nombre del paciente…" autocomplete="off">
                <div class="pago-ac" id="pago-cliente-list"></div>
            </label>
            <label>Tratamiento
                <select id="pago-tratamiento" disabled><option value="">Elige primero un cliente</option></select>
            </label>
            <div class="pago-row">
                <label>Importe (€)
                    <input type="number" id="pago-monto" min="0" step="0.01" placeholder="0.00">
                </label>
                <label>Método
                    <select id="pago-metodo">
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Bizum">Bizum</option>
                    </select>
                </label>
            </div>
            <label>Notas (opcional)
                <input type="text" id="pago-notas" placeholder="Observaciones del pago…">
            </label>
            <div class="pago-modal__actions">
                <button type="button" class="pago-btn pago-btn--ghost" id="pago-cancel">Cancelar</button>
                <button type="button" class="pago-btn pago-btn--ok" id="pago-guardar">Guardar pago</button>
            </div>
        </form>
    </dialog>

    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="/js/lib/datatables.min.js"></script>
    <script src="/js/main.js" type="module"></script>
    <script src="/js/pages/admin/panel-admin.js" type="module"></script>
</body>
</html>
