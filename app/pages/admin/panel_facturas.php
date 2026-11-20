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
    <title>Admin · HS Dental</title>

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
        <div class="admin__cabecera">
            <h1 class="page-title">Admin</h1>
            <a class="boton boton--secundario boton--pequeno" href="logout_facturas.php"><i class="ri-logout-box-r-line" aria-hidden="true"></i> Salir</a>
        </div>

        <div class="segmentado admin__pestanas" role="tablist" aria-label="Secciones del admin">
            <button type="button" class="segmentado__opcion" role="tab" id="tab-facturas" data-tab="facturas" aria-controls="panel-facturas" aria-selected="true">
                <i class="ri-receipt-line" aria-hidden="true"></i> Facturas
            </button>
            <button type="button" class="segmentado__opcion" role="tab" id="tab-pagos" data-tab="pagos" aria-controls="panel-pagos" aria-selected="false">
                <i class="ri-bank-card-line" aria-hidden="true"></i> Pagos
            </button>
        </div>

        <section class="tarjeta lista" id="panel-facturas" role="tabpanel" aria-labelledby="tab-facturas">
            <div class="tarjeta__cabecera">
                <h2 class="tarjeta__titulo">Facturas emitidas</h2>
            </div>
            <div id="table-facturas"></div>
        </section>

        <section class="tarjeta lista" id="panel-pagos" role="tabpanel" aria-labelledby="tab-pagos" hidden>
            <div class="tarjeta__cabecera">
                <h2 class="tarjeta__titulo">Pagos registrados</h2>
                <div class="lista__acciones">
                    <button type="button" class="boton boton--primario boton--pequeno" id="btn-registrar-pago"><i class="ri-add-line" aria-hidden="true"></i> Registrar pago</button>
                </div>
            </div>
            <div id="table-pagos"></div>
        </section>
    </div>

    <!-- Modal: Registrar pago -->
    <dialog id="pago-modal" class="pago-modal" aria-labelledby="pago-modal-titulo">
        <form class="pago-form" id="pago-form">
            <div class="pago-modal__cabecera">
                <h2 class="pago-modal__titulo" id="pago-modal-titulo">Registrar pago</h2>
                <button type="button" class="boton boton--icono boton--fantasma" id="pago-cerrar" aria-label="Cerrar">
                    <i class="ri-close-line" aria-hidden="true"></i>
                </button>
            </div>
            <div class="pago-modal__cuerpo">
                <div class="form__group">
                    <label for="pago-cliente" class="form__label">Paciente</label>
                    <div class="pago-cliente">
                        <input type="text" id="pago-cliente" class="form__input" placeholder="Escribe el nombre del paciente…" autocomplete="off">
                        <div class="pago-ac" id="pago-cliente-list"></div>
                    </div>
                </div>
                <div class="form__group">
                    <label for="pago-tratamiento" class="form__label">Tratamiento</label>
                    <select id="pago-tratamiento" class="form__input form__input--select" disabled><option value="">Elige primero un paciente</option></select>
                </div>
                <div class="pago-modal__fila">
                    <div class="form__group">
                        <label for="pago-monto" class="form__label">Importe (€)</label>
                        <input type="number" id="pago-monto" class="form__input" min="0" step="0.01" placeholder="0.00">
                    </div>
                    <div class="form__group">
                        <label for="pago-metodo" class="form__label">Método</label>
                        <select id="pago-metodo" class="form__input form__input--select">
                            <option value="Efectivo">Efectivo</option>
                            <option value="Tarjeta">Tarjeta</option>
                            <option value="Transferencia">Transferencia</option>
                            <option value="Bizum">Bizum</option>
                        </select>
                    </div>
                </div>
                <div class="form__group">
                    <label for="pago-notas" class="form__label">Notas (opcional)</label>
                    <input type="text" id="pago-notas" class="form__input" placeholder="Observaciones del pago…">
                </div>
            </div>
            <div class="pago-modal__pie">
                <button type="button" class="boton boton--secundario" id="pago-cancel">Cancelar</button>
                <button type="button" class="boton boton--primario" id="pago-guardar"><i class="ri-check-line" aria-hidden="true"></i> Guardar pago</button>
            </div>
        </form>
    </dialog>

    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="/js/main.js" type="module"></script>
    <script src="/js/pages/admin/panel-admin.js" type="module"></script>
</body>
</html>
