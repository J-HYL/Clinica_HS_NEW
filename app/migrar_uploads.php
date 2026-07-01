<?php
/**
 * migrar_uploads.php  —  MIGRACIÓN DE UNA SOLA VEZ (borrar del servidor tras usarlo).
 *
 * Mueve los archivos de pacientes YA existentes al nuevo esquema por clínica:
 *     uploads/pacientes/{client_id}/...  ->  uploads/pacientes/clinica{clinic_id}/{client_id}/...
 * y actualiza images.ruta en la BD de la CLÍNICA CON LA SESIÓN INICIADA.
 *
 * USO (por CADA clínica, y por CADA entorno):
 *   0) Haz BACKUP antes: carpeta uploads/pacientes/ (SFTP) + volcado de la tabla `images`.
 *   1) Inicia sesión en la app de la clínica que quieres migrar (ej. Alcorcón).
 *   2) Abre  /migrar_uploads.php        -> SIMULACRO (no cambia nada, solo lista).
 *   3) Revisa el listado.
 *   4) Abre  /migrar_uploads.php?dry=0  -> EJECUTA de verdad.
 *   5) Comprueba en el panel que las imágenes/PDF se ven.
 *   6) BORRA este archivo del servidor.
 *
 * Es IDEMPOTENTE: si se re-ejecuta, ignora lo que ya está bajo clinica{n}/.
 * Cada clínica toca SOLO su propia BD (la que da su sesión), nunca la de la otra.
 */

session_start();
require_once __DIR__ . '/api/db_connect.php';

header('Content-Type: text/plain; charset=utf-8');

if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id'])) {
    http_response_code(401);
    exit("Inicia sesión en la clínica que quieres migrar antes de ejecutar esto.\n");
}

$clinicId  = (int) $_SESSION['clinic_id'];
$clinicSeg = 'clinica' . $clinicId;
$dry       = (($_GET['dry'] ?? '1') !== '0');   // por defecto: simulacro

$conn = getConnection();

echo $dry ? "== SIMULACRO (no cambia nada) ==\n" : "== EJECUCIÓN REAL ==\n";
echo "Clínica en sesión: {$clinicId}  ->  prefijo: {$clinicSeg}\n\n";

$sql = "SELECT id, ruta FROM images
        WHERE ruta LIKE 'uploads/pacientes/%'
          AND ruta NOT LIKE 'uploads/pacientes/clinica%'";
$res = $conn->query($sql);

$total = 0; $movidos = 0; $saltados = 0;

while ($row = $res->fetch_assoc()) {
    $total++;
    $rutaVieja = $row['ruta'];
    $rutaNueva = preg_replace('#^uploads/pacientes/#', "uploads/pacientes/{$clinicSeg}/", $rutaVieja);
    $origen  = __DIR__ . '/' . $rutaVieja;
    $destino = __DIR__ . '/' . $rutaNueva;

    if (!file_exists($origen)) {
        echo "SALTA (no existe el fichero): {$rutaVieja}\n";
        $saltados++;
        continue;
    }

    echo ($dry ? "MOVERÍA: " : "MUEVE:   ") . "{$rutaVieja}  ->  {$rutaNueva}\n";
    if ($dry) continue;

    $dirDestino = dirname($destino);
    if (!is_dir($dirDestino) && !mkdir($dirDestino, 0777, true)) {
        echo "  ERROR: no se pudo crear la carpeta destino {$dirDestino}\n";
        $saltados++;
        continue;
    }

    // Mover el fichero y, solo si el move va bien, actualizar su ruta en la BD.
    if (@rename($origen, $destino)) {
        $stmt = $conn->prepare("UPDATE images SET ruta = ? WHERE id = ?");
        $stmt->bind_param("si", $rutaNueva, $row['id']);
        $stmt->execute();
        $movidos++;
    } else {
        echo "  ERROR: no se pudo mover el fichero (BD no tocada para este id)\n";
        $saltados++;
    }
}

echo "\n----------------------------------------\n";
echo "Candidatos: {$total} | Movidos: {$movidos} | Saltados/errores: {$saltados}\n";
echo $dry
    ? "\nEra un SIMULACRO. Cuando lo tengas claro y con backup hecho, abre ?dry=0 para ejecutar.\n"
    : "\nHECHO. Revisa el panel. Cuando confirmes que todo se ve, BORRA este archivo del servidor.\n";
