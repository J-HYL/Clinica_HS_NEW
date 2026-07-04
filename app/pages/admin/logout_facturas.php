<?php
session_start();
// Cerrar SOLO la sesion del admin de facturas. NO destruir toda la sesion:
// eso tumbaria tambien el login del panel principal (logged_in / clinic_id).
unset($_SESSION['facturas_admin'], $_SESSION['admin_user']);
header("Location: ../facturas/facturas.html");
exit();
?>
