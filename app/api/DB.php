<?php
session_start();
header('Content-Type: application/json');
$allowedOrigins = ['https://app.hsdental.es', 'https://pre.hsdental.es'];
$reqOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Access-Control-Allow-Origin: ' . (in_array($reqOrigin, $allowedOrigins, true) ? $reqOrigin : 'https://app.hsdental.es'));
header('Vary: Origin'); 
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Verificar login
if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id'])) {
    http_response_code(401);
    echo json_encode(["error" => "No autenticado o clínica no seleccionada"]);
    exit;
}
require_once __DIR__ . '/dompdf/dompdf/autoload.inc.php';
use Dompdf\Dompdf;
use Dompdf\Options;

require_once "db_connect.php";
$conn = getConnection();

// Segmento de clínica: aísla los archivos de pacientes por sede, para que los IDs
// coincidentes entre clínicas (cada una con su propia BD) no compartan carpeta.
$clinicSeg = 'clinica' . (int)($_SESSION['clinic_id'] ?? 0);

/**
 * Borra recursivamente un directorio, validando que quede DENTRO de uploads/pacientes.
 * Devuelve false si no existe (nada que borrar); lanza excepción si la ruta se sale del árbol.
 */
function deleteDir($dir) {
    $base = realpath(__DIR__ . '/../uploads/pacientes');
    $real = realpath($dir);
    if ($real === false) return false;
    if ($base === false || strpos($real, $base) !== 0) {
        throw new Exception('Ruta fuera de uploads/pacientes: ' . $dir);
    }
    $items = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($real, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($items as $it) {
        $it->isDir() ? rmdir($it->getPathname()) : unlink($it->getPathname());
    }
    return rmdir($real);
}

// Resto de tu lógica: switch(GET/POST/PUT/DELETE) ...
$table = $_GET['table'] ?? null;
$id    = $_GET['id'] ?? null;
$start = $_GET['start'] ?? null;
$end   = $_GET['end'] ?? null;

switch ($_SERVER['REQUEST_METHOD']) {
    case 'POST':
        if ($table !== 'images') {
            $data = json_decode(file_get_contents("php://input"), true);
            error_log("DEBUG - POST Request - Data received: " . print_r($data, true));
        } else {
            $data = $_POST; 
            error_log("DEBUG - POST Request (Images) - POST data: " . print_r($data, true));
            error_log("DEBUG - POST Request (Images) - FILES data: " . print_r($_FILES, true));
        }
        

        switch ($table) {

          case 'clients':
              $nombre   = $data["nombre"];
              $email    = trim($data["email"] ?? '');
              $telefono = $data["telefono"];
              $alergias = $data["alergias"];
              $edad     = $data["edad"];

              if ($email === '') {
                  $email = null;
              }

              $stmt = $conn->prepare("
                  INSERT INTO clients (nombre, email, telefono, alergias, edad)
                  VALUES (?, ?, ?, ?, ?)
              ");
              $stmt->bind_param("ssssi", $nombre, $email, $telefono, $alergias, $edad);

              if ($stmt->execute()) {
                  $new_patient_id = $conn->insert_id;

                  $sanitized_patient_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $new_patient_id);
                  if (empty($sanitized_patient_id)) {
                      error_log("ERROR - El ID sanitizado está vacío. Generando uno aleatorio.");
                      $sanitized_patient_id = uniqid('patient_');
                  }

                  $folder_path = __DIR__ . "/../uploads/pacientes/" . $clinicSeg . "/" . $sanitized_patient_id;

                  if (!file_exists($folder_path)) {
                      if (mkdir($folder_path, 0777, true)) {
                          echo json_encode([
                              "success" => true,
                              "id" => $new_patient_id,
                              "folder_created" => true,
                              "folder_path" => $folder_path
                          ]);
                      } else {
                          http_response_code(500);
                          echo json_encode([
                              "error" => "Error al crear la carpeta del paciente",
                              "id" => $new_patient_id,
                              "folder_path_attempted" => $folder_path
                          ]);
                      }
                  } else {
                      echo json_encode([
                          "success" => true,
                          "id" => $new_patient_id,
                          "folder_exists" => true,
                          "folder_path" => $folder_path
                      ]);
                  }

                  $stmt->close();
                  break 2;
              } else {
                  http_response_code(500);
                  echo json_encode(["error" => "Error al insertar cliente: " . $stmt->error]);
                  $stmt->close();
                  break 2;
              }

            break;
            case 'pieces':
              if ($_SERVER['REQUEST_METHOD'] === 'POST') {
                  $data = json_decode(file_get_contents('php://input'), true);
                  if ($data) {
                      $stmt = $conn->prepare("INSERT INTO pieces (treatment_id, tooth_number, piece_status) VALUES (?, ?, ?)");
                      $stmt->bind_param("isi", $data['treatment_id'], $data['tooth_number'], $data['piece_status']);
                      if ($stmt->execute()) {
                          echo json_encode(["success" => true, "id" => $conn->insert_id]);
                          exit; // <--- Añade esto
                      } else {
                          http_response_code(500);
                          echo json_encode(["success" => false, "error" => $stmt->error]);
                          exit; // <--- Y esto
                      }
                      $stmt->close();
                  } else {
                      http_response_code(400);
                      echo json_encode(["success" => false, "error" => "Invalid input."]);
                      exit; // <--- Y esto
                  }
              } else if ($_SERVER['REQUEST_METHOD'] === 'GET') {
                  // ... Tu lógica GET para 'pieces' ...
                  echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                  $stmt->close();
                  exit; // <--- Y esto al final del GET
              }
              break;

            case 'services':
                $stmt = $conn->prepare("
                    INSERT INTO services (id, nombre, precio)
                    VALUES (?, ?, ?)
                ");
                $stmt->bind_param("ssd", $data["id"], $data["nombre"], $data["precio"]);

                if ($stmt->execute()) {
                    echo json_encode(["success" => true, "id" => $conn->insert_id]);
                } else {
                    http_response_code(500);
                    echo json_encode(["error" => "Error al insertar servicio: " . $stmt->error]);
                }

                $stmt->close();
                break 2;

                case 'treatments':
                error_log("DEBUG - POST Request - Handling table: treatments");

                $stmt = $conn->prepare("
                    INSERT INTO treatments (client_id, diagnostico, observaciones, monto_total, monto_pagado, deuda, estado)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ");
                error_log("DEBUG - POST Request - SQL Query for treatments: INSERT INTO treatments (...) VALUES (...)");

                $stmt->bind_param("sssdssd",
                    $data["client_id"],
                    $data["diagnostico"],
                    $data["observaciones"],
                    $data["monto_total"],
                    $data["monto_pagado"],
                    $data["deuda"],
                    $data["estado"]
                );

                if ($stmt->execute()) {
                    $new_treatment_id = $conn->insert_id;

                    $sanitized_client_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $data["client_id"]);
                    $sanitized_treatment_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $new_treatment_id);

                    if (empty($sanitized_treatment_id)) {
                        error_log("ERROR - ID tratamiento sanitizado vacío. Generando uno aleatorio.");
                        $sanitized_treatment_id = uniqid('treatment_');
                    }

                    $folder_path = __DIR__ . "/../uploads/pacientes/" . $clinicSeg . "/" . $sanitized_client_id . "/" . $sanitized_treatment_id;
                    error_log("DEBUG - Ruta completa de la carpeta de tratamiento a crear: " . $folder_path);

                    if (!file_exists($folder_path)) {
                        if (mkdir($folder_path, 0777, true)) {
                            error_log("DEBUG - Carpeta de tratamiento creada: " . $folder_path);
                            echo json_encode(["success" => true, "id" => $new_treatment_id, "folder_created" => true, "folder_path" => $folder_path]);
                        } else {
                            error_log("ERROR - No se pudo crear la carpeta del tratamiento: " . $folder_path);
                            http_response_code(500);
                            echo json_encode(["error" => "Error al crear la carpeta del tratamiento", "id" => $new_treatment_id]);
                        }
                    } else {
                        error_log("DEBUG - La carpeta del tratamiento ya existe: " . $folder_path);
                        echo json_encode(["success" => true, "id" => $new_treatment_id, "folder_exists" => true, "folder_path" => $folder_path]);
                    }

                    $stmt->close();
                    break 2;
                } else {
                    http_response_code(500);
                    echo json_encode(["error" => "Error al insertar tratamiento: " . $stmt->error]);
                    $stmt->close();
                    break 2;
                }

            case 'appointments':
                error_log("DEBUG - POST Request - Handling table: " . $table . " (Generic Appointments/Unknown)");

                $stmt = $conn->prepare("
                    INSERT INTO {$table} (cliente, servicio, fecha, medico, estado)
                    VALUES (?, ?, ?, ?, ?)
                ");
                error_log("DEBUG - POST Request - SQL Query: INSERT INTO {$table} (...) VALUES (...)");

                $stmt->bind_param("sssss",
                    $data["cliente"],
                    $data["servicio"],
                    $data["fecha"],
                    $data["medico"],
                    $data["estado"]
                );

                if ($stmt->execute()) {
                    echo json_encode(["success" => true, "id" => $conn->insert_id]);
                } else {
                    http_response_code(500);
                    echo json_encode(["error" => "Error al insertar cita: " . $stmt->error]);
                }

                $stmt->close();
                break 2;

            case 'payments':
                error_log("DEBUG - POST Request - Handling table: payments with treatment update");

                $conn->begin_transaction();

                try {
                    $stmt = $conn->prepare("INSERT INTO payments (treatment_id, client_id, monto, metodo_pago, notas) VALUES (?, ?, ?, ?, ?)");
                    $stmt->bind_param("iidss",
                        $data['treatment_id'],
                        $data['client_id'],
                        $data['monto_pagado'],
                        $data['metodo_pago'],
                        $data['notas']
                    );

                    if (!$stmt->execute()) throw new Exception("Error al insertar el pago: " . $stmt->error);

                    $payment_id = $conn->insert_id;
                    error_log("DEBUG - Payment inserted with ID: " . $payment_id);

                    $monto_pago = $data['monto_pagado'];
                    $treatment_id = $data['treatment_id'];

                    $stmt_get_treatment = $conn->prepare("SELECT monto_total, monto_pagado, deuda FROM treatments WHERE id = ?");
                    $stmt_get_treatment->bind_param("i", $treatment_id);
                    $stmt_get_treatment->execute();
                    $result = $stmt_get_treatment->get_result();

                    if ($result->num_rows === 0) throw new Exception("No se encontró el tratamiento con ID: " . $treatment_id);

                    $treatment = $result->fetch_assoc();
                    $monto_total = floatval($treatment['monto_total']);
                    $monto_pagado_actual = floatval($treatment['monto_pagado']);
                    $nuevo_monto_pagado = $monto_pagado_actual + $monto_pago;
                    $nueva_deuda = max(0, $monto_total - $nuevo_monto_pagado);

                    $nuevo_estado = $nueva_deuda == 0 ? 'pagado' : ($nuevo_monto_pagado == 0 ? 'pendiente' : 'parcial');

                    $stmt_update_treatment = $conn->prepare("UPDATE treatments SET monto_pagado = ?, deuda = ?, estado = ? WHERE id = ?");
                    $stmt_update_treatment->bind_param("ddsi", $nuevo_monto_pagado, $nueva_deuda, $nuevo_estado, $treatment_id);

                    if (!$stmt_update_treatment->execute()) throw new Exception("Error al actualizar el tratamiento: " . $stmt_update_treatment->error);

                    $conn->commit();

                    echo json_encode([
                        "success" => true,
                        "payment_id" => $payment_id,
                        "treatment_updated" => true,
                        "new_monto_pagado" => $nuevo_monto_pagado,
                        "new_deuda" => $nueva_deuda,
                        "new_estado" => $nuevo_estado
                    ]);

                    $stmt->close();
                    $stmt_get_treatment->close();
                    $stmt_update_treatment->close();

                } catch (Exception $e) {
                    $conn->rollback();
                    error_log("DEBUG - Transaction rolled back due to error: " . $e->getMessage());
                    http_response_code(500);
                    echo json_encode(["error" => $e->getMessage()]);
                }

                break 2;

            case 'images':
                error_log("DEBUG - POST Request - Handling file upload for table: images");

                if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
                    http_response_code(400);
                    echo json_encode(["error" => "No se recibió ningún archivo o hubo un error en la subida."]);
                    break 2;
                }

                if (!isset($data['client_id']) || !isset($data['tratamiento_id'])) {
                    http_response_code(400);
                    echo json_encode(["error" => "client_id y tratamiento_id son requeridos para subir un archivo."]);
                    break 2;
                }

                $client_id = $data['client_id'];
                $tratamiento_id = $data['tratamiento_id'];
                $file_tmp_name = $_FILES['file']['tmp_name'];
                $original_file_name = basename($_FILES['file']['name']);
                $file_type = $_FILES['file']['type'];
                $file_size = $_FILES['file']['size'];
                $description = $data['descripcion'] ?? null;

                $db_file_type = strpos($file_type, 'pdf') !== false ? 'pdf' : 'imagen';

                $sanitized_client_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $client_id);
                $sanitized_treatment_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $tratamiento_id);

                if (empty($sanitized_client_id) || empty($sanitized_treatment_id)) {
                    http_response_code(400);
                    echo json_encode(["error" => "ID de cliente o tratamiento no válidos después de sanitización."]);
                    break 2;
                }

                $file_extension = pathinfo($original_file_name, PATHINFO_EXTENSION);
                $unique_file_name = uniqid() . '_' . md5(microtime()) . '.' . $file_extension;

                $upload_dir_relative = "uploads/pacientes/{$clinicSeg}/{$sanitized_client_id}/{$sanitized_treatment_id}/";
                $target_dir = __DIR__ . "/../" . $upload_dir_relative;
                $target_file_path_full = $target_dir . $unique_file_name;
                $target_file_path_db = $upload_dir_relative . $unique_file_name;

                if (!is_dir($target_dir)) {
                    if (!mkdir($target_dir, 0777, true)) {
                        http_response_code(500);
                        echo json_encode(["error" => "Error al crear el directorio de destino para la subida."]);
                        break 2;
                    }
                }

                if (move_uploaded_file($file_tmp_name, $target_file_path_full)) {
                    $stmt = $conn->prepare("
                        INSERT INTO images (tratamiento_id, ruta, nombre_original, tipo, descripcion)
                        VALUES (?, ?, ?, ?, ?)
                    ");
                    $stmt->bind_param("issss", $tratamiento_id, $target_file_path_db, $original_file_name, $db_file_type, $description);

                    if ($stmt->execute()) {
                        echo json_encode([
                            "success" => true,
                            "message" => "Archivo subido y registrado correctamente.",
                            "id" => $conn->insert_id,
                            "tratamiento_id" => $tratamiento_id,
                            "nombre_original" => $original_file_name,
                            "ruta" => $target_file_path_db,
                            "tipo" => $db_file_type
                        ]);
                    } else {
                        unlink($target_file_path_full);
                        http_response_code(500);
                        echo json_encode(["error" => "Error al registrar el archivo en la base de datos: " . $stmt->error]);
                    }

                    $stmt->close();
                } else {
                    http_response_code(500);
                    echo json_encode(["error" => "Error al mover el archivo subido."]);
                }

                break 2;

            case 'visits':
                error_log("DEBUG - POST Request - Handling table: visits");

                try {
                    // Insertar la visita
                    $stmt = $conn->prepare("
                        INSERT INTO visits (client_id, treatment_id, observaciones, doctor, pago_de_visita)
                        VALUES (?, ?, ?, ?, ?)
                    ");

                    $stmt->bind_param(
                        "iisds",
                        $data["client_id"],
                        $data["treatment_id"],
                        $data["observaciones"],
                        $data["doctor"],
                        $data["pago_de_visita"]
                    );

                    if (!$stmt->execute()) {
                        throw new Exception("Error al insertar visita: " . $stmt->error);
                    }

                    $visit_id = $conn->insert_id;
                    error_log("DEBUG - Visit inserted with ID: " . $visit_id);

                    echo json_encode([
                        "success" => true,
                        "visit_id" => $visit_id,
                        "message" => "Visita registrada con éxito."
                    ]);

                    $stmt->close();

                } catch (Exception $e) {
                    error_log("DEBUG - Error al registrar visita: " . $e->getMessage());
                    http_response_code(500);
                    echo json_encode(["error" => $e->getMessage()]);
                }

                break 2;
            case 'facturas':
                $nombre_paciente = $_POST['nombre_paciente'] ?? '';
                $html = $_POST['html'] ?? '';

                if (empty($nombre_paciente) || empty($html)) {
                    echo json_encode(["success" => false, "error" => "Faltan datos"]);
                    exit;
                }
                $resUser = $conn->query("SELECT username FROM users WHERE id = 1 LIMIT 1");
                $rowUser = $resUser ? $resUser->fetch_assoc() : null;
                $usuario = $rowUser['username'] ?? '';

                $inicial = 'GEN'; 
                if (stripos($usuario, 'mstlsHS') !== false) {
                    $inicial = 'M';
                } elseif (stripos($usuario, 'alcrcnHS') !== false) {
                    $inicial = 'A';
    			}

                $res = $conn->query("SELECT MAX(numero_factura) AS ultimo FROM facturas");
                $row = $res ? $res->fetch_assoc() : null;
                $numero_factura = $row && $row['ultimo'] ? intval($row['ultimo']) + 1 : 1;

                $fecha = date('Y-m-d');
                $ruta_relativa = "/uploads/facturas/factura_HSD-{$inicial}-$numero_factura.pdf";
                $ruta_absoluta =  __DIR__ . "/../$ruta_relativa";

                if (!is_dir(__DIR__ . "/../uploads/facturas")) mkdir(__DIR__ . "/../uploads/facturas", 0777, true);
                $options = new Options();
				$options->set('isRemoteEnabled', true);
            	$dompdf = new Dompdf($options);
                // Logo embebido como data URI: el PDF se genera en el servidor sin acceso de red,
                // así el logo sale igual en producción y en pre (no depende del host).
                $logoPath = __DIR__ . '/../assets/images/logoCompleto.jpg';
                if (is_file($logoPath)) {
                    $logoData = 'data:image/jpeg;base64,' . base64_encode(file_get_contents($logoPath));
                    $html = preg_replace_callback(
                        '#src\s*=\s*([\'"])[^\'"]*logoCompleto\.jpg\1#i',
                        function ($m) use ($logoData) { return 'src=' . $m[1] . $logoData . $m[1]; },
                        $html
                    );
                }
                $dompdf->loadHtml($html);
                $dompdf->setPaper('A4', 'portrait');
                $dompdf->render();
                file_put_contents($ruta_absoluta, $dompdf->output());

                $stmt = $conn->prepare("INSERT INTO facturas (numero_factura, nombre_paciente, fecha, ruta) VALUES (?, ?, ?, ?)");
                $stmt->bind_param("isss", $numero_factura, $nombre_paciente, $fecha, $ruta_relativa);

                if ($stmt->execute()) {
                    echo json_encode([
                        "success" => true,
                        "numero" => $numero_factura,
                        "ruta" => $ruta_relativa
                    ]);
                } else {
                    echo json_encode(["success" => false, "error" => $conn->error]);
                }
                break;
            default:
                http_response_code(400);
                echo json_encode(["error" => "Tabla no especificada o no manejada para POST"]);
            exit;
        }
    
    case 'GET':
        switch ($table) {
          case 'clients':
              if ($id) {
                  $stmt = $conn->prepare("
                      SELECT 
                          c.*,
                          COALESCE(NULLIF(c.email, ''), 'No proporcionado') AS email,
                          COALESCE(NULLIF(c.alergias, ''), 'No consta') AS alergias,
                          COALESCE(NULLIF(NULLIF(c.edad, 0), ''), 'No proporcionado') AS edad
                      FROM clients c
                      WHERE id = ?
                  ");
                  $stmt->bind_param("i", $id);
                  $stmt->execute();
                  $result = $stmt->get_result();
                  echo json_encode($result->fetch_assoc() ?: (object)[]);
              } else {
                  $result = $conn->query("
                      SELECT 
                          c.*,
                          COALESCE(NULLIF(c.email, ''), 'No proporcionado') AS email,
                          COALESCE(NULLIF(c.alergias, ''), 'No consta') AS alergias,
                          COALESCE(NULLIF(NULLIF(c.edad, 0), ''), 'No proporcionado') AS edad
                      FROM clients c
                  ");
                  echo json_encode($result->fetch_all(MYSQLI_ASSOC));
              }
              $stmt->close();
              break;
            case 'services':
                if ($id) {
                    $stmt = $conn->prepare("SELECT * FROM services WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_assoc() ?: (object)[]);
                } else {
                    $result = $conn->query("SELECT * FROM services");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'treatments':
                if ($id) {
                    $stmt = $conn->prepare("SELECT * FROM treatments WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_assoc() ?: (object)[]);
                } else if (isset($_GET['client_id'])) {
                    $client_id = $_GET['client_id'];
                    $stmt = $conn->prepare("SELECT * FROM treatments WHERE client_id = ?");
                    $stmt->bind_param("i", $client_id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                } else {
                    $result = $conn->query("SELECT * FROM treatments");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'appointments':
                if ($id) {
                    $stmt = $conn->prepare("SELECT * FROM appointments WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_assoc() ?: (object)[]);
                } else if ($start && $end) {
                    $stmt = $conn->prepare("
                        SELECT * FROM appointments 
                        WHERE fecha BETWEEN ? AND ?
                        ORDER BY fecha
                    ");
                    $stmt->bind_param("ss", $start, $end);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                } else {
                    $result = $conn->query("SELECT * FROM appointments ORDER BY fecha");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'payments':
                if ($id) {
                    $stmt = $conn->prepare("SELECT * FROM payments WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_assoc() ?: (object)[]);
                } else if (isset($_GET['treatment_id'])) {
                    $treatment_id = $_GET['treatment_id'];
                    $stmt = $conn->prepare("SELECT * FROM payments WHERE treatment_id = ? ORDER BY fecha_pago DESC");
                    $stmt->bind_param("i", $treatment_id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                } else {
                    $result = $conn->query("SELECT * FROM payments ORDER BY fecha_pago DESC");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'images':
                if ($id) {
                    $stmt = $conn->prepare("SELECT * FROM images WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_assoc() ?: (object)[]);
                } else if (isset($_GET['tratamiento_id'])) {
                    $tratamiento_id = $_GET['tratamiento_id'];
                    $stmt = $conn->prepare("SELECT * FROM images WHERE tratamiento_id = ? ORDER BY fecha_subida DESC");
                    $stmt->bind_param("i", $tratamiento_id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                } else {
                    $result = $conn->query("SELECT * FROM images ORDER BY fecha_subida DESC");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'pieces':
                             // <-- NUEVO CASO AÑADIDO
                if (isset($_GET['treatment_id'])) {
                    $treatment_id = $_GET['treatment_id'];
                    $stmt = $conn->prepare("SELECT * FROM pieces WHERE treatment_id = ?");
                    $stmt->bind_param("i", $treatment_id); // Asumiendo que treatment_id es un entero
                    $stmt->execute();
                    $result = $stmt->get_result();
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                } else {
                    // Si se quieren todas las piezas, o puedes restringirlo
                    $result = $conn->query("SELECT * FROM pieces");
                    echo json_encode($result->fetch_all(MYSQLI_ASSOC));
                }
                $stmt->close();
                break;
            case 'visits':
                if (isset($_GET['client_id'])) {
                    // Obtener visitas por client_id
                    $client_id = intval($_GET['client_id']);
                    $stmt = $conn->prepare("
                        SELECT v.*, t.diagnostico AS tratamiento_nombre 
                        FROM visits v 
                        LEFT JOIN treatments t ON v.treatment_id = t.id 
                        WHERE v.client_id = ? 
                        ORDER BY v.fecha DESC
                    ");
                    $stmt->bind_param("i", $client_id);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $visits = [];
                    while ($row = $result->fetch_assoc()) {
                        $visits[] = $row;
                    }

                    echo json_encode(["data" => $visits]);
                    $stmt->close();

                } elseif (isset($_GET['id'])) {
                    // Obtener una visita específica por ID
                    $visit_id = intval($_GET['id']);
                    $stmt = $conn->prepare("
                        SELECT v.*, t.diagnostico AS tratamiento_nombre 
                        FROM visits v 
                        LEFT JOIN treatments t ON v.treatment_id = t.id 
                        WHERE v.id = ?
                    ");
                    $stmt->bind_param("i", $visit_id);
                    $stmt->execute();
                    $result = $stmt->get_result();

                    if ($result->num_rows > 0) {
                        $visit = $result->fetch_assoc();
                        echo json_encode(["data" => $visit]);
                    } else {
                        http_response_code(404);
                        echo json_encode(["error" => "Visita no encontrada"]);
                    }

                    $stmt->close();

                } else {
                    // Obtener todas las visitas (sin filtro)
                    $stmt = $conn->prepare("
                        SELECT v.*, t.diagnostico AS tratamiento_nombre, c.nombre AS cliente_nombre 
                        FROM visits v 
                        LEFT JOIN treatments t ON v.treatment_id = t.id 
                        LEFT JOIN clients c ON v.client_id = c.id 
                        ORDER BY v.fecha DESC
                    ");
                    $stmt->execute();
                    $result = $stmt->get_result();

                    $visits = [];
                    while ($row = $result->fetch_assoc()) {
                        $visits[] = $row;
                    }

                    echo json_encode(["data" => $visits]);
                    $stmt->close();
                }
                break;
            case 'facturas':
                $sql = "SELECT * FROM facturas ORDER BY id DESC";
                $res = $conn->query($sql);

                if (!$res) {
                    echo json_encode(["success" => false, "error" => $conn->error]);
                    exit;
                }

                $facturas = [];
                while ($row = $res->fetch_assoc()) {
                    $facturas[] = $row;
                }

                // Obtener el último número de factura
                $res2 = $conn->query("SELECT MAX(numero_factura) AS ultimo FROM facturas");
                $row2 = $res2 ? $res2->fetch_assoc() : null;
                $ultimoNumero = $row2 && $row2['ultimo'] ? intval($row2['ultimo']) : 0;

                echo json_encode([
                    "success" => true,
                    "facturas" => $facturas,
                    "ultimoNumero" => $ultimoNumero
                ]);
                break;
            default:
                http_response_code(400);
                echo json_encode(["error" => "Tabla no especificada o no manejada para GET"]);
                break;
            
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        if (!$id) {
            http_response_code(400);
            echo json_encode(["error" => "Falta parámetro id"]);
            break;
        }

        // DEBUG: Log de la tabla actual al entrar en el PUT
        error_log("DEBUG - PUT Request - Table value: " . $table);

        $stmt = null; // Inicializar $stmt a null para controlar su existencia

        switch ($table) {
            case 'clients':
                // Actualizar clients
                $sets = []; $types = ""; $values = [];
                foreach (["nombre","email","telefono", "alergias", "edad"] as $col) {
                    if (isset($data[$col])) {
                        $sets[]   = "$col = ?";
                        $types   .= "s";
                        $values[] = $data[$col];
                    }
                }
                $types   .= "i";      // id
                $values[] = $id;
                $sql = "UPDATE clients SET " . implode(", ", $sets) . " WHERE id = ?";
                // DEBUG: Log de la consulta SQL para PUT clients
                error_log("DEBUG - PUT Request - SQL Query for clients: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            case 'services':
                // Actualizar services
                $sets = []; $types = ""; $values = [];
                if (isset($data["nombre"])) {
                    $sets[]   = "nombre = ?";
                    $types   .= "s";
                    $values[] = $data["nombre"];
                }
                if (isset($data["precio"])) {
                    $sets[]   = "precio = ?";
                    $types   .= "d";
                    $values[] = $data["precio"];
                }
                $types   .= "i";      // id
                $values[] = $id;
                $sql = "UPDATE services SET " . implode(", ", $sets) . " WHERE id = ?";
                // DEBUG: Log de la consulta SQL para PUT services
                error_log("DEBUG - PUT Request - SQL Query for services: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            case 'treatments':
                // Actualizar treatments
                error_log("DEBUG - PUT Request - Handling table: treatments");
                $sets = []; $types = ""; $values = [];
                foreach (["client_id", "diagnostico", "observaciones", "monto_total", "monto_pagado", "deuda", "estado"] as $col) {
                    if (isset($data[$col])) {
                        $sets[]   = "$col = ?";
                        // Asigna el tipo 'd' para los campos numéricos y 's' para los demás
                        if (in_array($col, ["monto_total", "monto_pagado", "deuda"])) {
                            $types .= "d";
                        } else {
                            $types .= "s";
                        }
                        $values[] = $data[$col];
                    }
                }
                $types   .= "i";      // id
                $values[] = $id;
                $sql = "UPDATE treatments SET " . implode(", ", $sets) . " WHERE id = ?";
                // DEBUG: Log de la consulta SQL para PUT treatments
                error_log("DEBUG - PUT Request - SQL Query for treatments: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            case 'payments':
                // Actualizar payments - TAMBIÉN NECESITA LÓGICA DE ACTUALIZACIÓN DE TRATAMIENTO
                error_log("DEBUG - PUT Request - Handling table: payments");
                
                // Primero, obtener el pago actual para saber el monto anterior
                $stmt_get_old_payment = $conn->prepare("SELECT treatment_id, monto FROM payments WHERE id = ?");
                $stmt_get_old_payment->bind_param("i", $id); // Asumiendo ID es INT
                $stmt_get_old_payment->execute();
                $old_payment_result = $stmt_get_old_payment->get_result();
                
                if ($old_payment_result->num_rows === 0) {
                    http_response_code(404);
                    echo json_encode(["error" => "Pago no encontrado"]);
                    break 2; // Salir del switch principal
                }
                
                $old_payment = $old_payment_result->fetch_assoc();
                $old_monto = floatval($old_payment['monto']);
                $treatment_id = $old_payment['treatment_id'];
                
                // Iniciar transacción
                $conn->begin_transaction();
                
                try {
                    // Actualizar el pago
                    $sets = []; $types = ""; $values = [];
                    foreach (["treatment_id", "client_id", "monto", "fecha_pago", "metodo_pago", "notas"] as $col) {
                        if (isset($data[$col])) {
                            $sets[] = "$col = ?";
                            if (in_array($col, ["treatment_id", "client_id"])) { // estos deberían ser enteros si son IDs
                                $types .= "i";
                            } else if ($col === "monto") {
                                $types .= "d"; // monto es decimal
                            } else {
                                $types .= "s";
                            }
                            $values[] = $data[$col];
                        }
                    }
                    $types .= "i"; // El ID para el WHERE (asumiendo ID es INT)
                    $values[] = $id;
                    $sql = "UPDATE payments SET " . implode(", ", $sets) . " WHERE id = ?";
                    $stmt = $conn->prepare($sql);
                    $stmt->bind_param($types, ...$values);
                    
                    if (!$stmt->execute()) {
                        throw new Exception("Error al actualizar el pago: " . $stmt->error);
                    }
                    
                    // Si se actualizó el monto, recalcular el tratamiento
                    if (isset($data['monto'])) {
                        $nuevo_monto = floatval($data['monto']);
                        $diferencia_monto = $nuevo_monto - $old_monto;
                        
                        // Obtener el tratamiento actual
                        $stmt_get_treatment = $conn->prepare("SELECT monto_total, monto_pagado, deuda FROM treatments WHERE id = ?");
                        $stmt_get_treatment->bind_param("i", $treatment_id);
                        $stmt_get_treatment->execute();
                        $treatment_result = $stmt_get_treatment->get_result();
                        
                        if ($treatment_result->num_rows > 0) {
                            $treatment = $treatment_result->fetch_assoc();
                            $monto_total = floatval($treatment['monto_total']);
                            $monto_pagado_actual = floatval($treatment['monto_pagado']);
                            
                            // Calcular nuevo monto_pagado
                            $nuevo_monto_pagado = $monto_pagado_actual + $diferencia_monto;
                            
                            // Calcular nueva deuda
                            $nueva_deuda = $monto_total - $nuevo_monto_pagado;
                            if ($nueva_deuda < 0) $nueva_deuda = 0;
                            
                            // Determinar nuevo estado
                            $nuevo_estado = '';
                            if ($nueva_deuda == 0 && $monto_total > 0) { // Si la deuda es 0 y el total es > 0, es pagado
                                $nuevo_estado = 'pagado';
                            } elseif ($nuevo_monto_pagado == 0) { // Si no se ha pagado nada
                                $nuevo_estado = 'pendiente';
                            } else { // Si se ha pagado algo pero no todo
                                $nuevo_estado = 'parcial';
                            }
                            
                            // Actualizar el tratamiento
                            $stmt_update_treatment = $conn->prepare("UPDATE treatments SET monto_pagado = ?, deuda = ?, estado = ? WHERE id = ?");
                            $stmt_update_treatment->bind_param("ddsi", $nuevo_monto_pagado, $nueva_deuda, $nuevo_estado, $treatment_id);
                            
                            if (!$stmt_update_treatment->execute()) {
                                throw new Exception("Error al actualizar el tratamiento: " . $stmt_update_treatment->error);
                            }
                        }
                    }
                    
                    $conn->commit();
                    echo json_encode(["success" => true]);
                    
                } catch (Exception $e) {
                    $conn->rollback();
                    http_response_code(500);
                    echo json_encode(["error" => $e->getMessage()]);
                }
                
                break 2; // Salir del switch principal
                
            case 'appointments': // Este bloque es para 'appointments'
                error_log("DEBUG - PUT Request - Handling table: " . $table);
                $sets = []; $types = ""; $values = [];
                foreach (["cliente","servicio","fecha","medico","estado"] as $col) {
                    if (isset($data[$col])) {
                        $sets[]   = "$col = ?";
                        $types   .= "s";
                        $values[] = $data[$col];
                    }
                }
                $types   .= "i";      // id
                $values[] = $id;
                $sql = "UPDATE {$table} SET " . implode(", ", $sets) . " WHERE id = ?";
                // DEBUG: Log de la consulta SQL para PUT appointments
                error_log("DEBUG - PUT Request - SQL Query for appointments: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            case 'images':
                error_log("DEBUG - PUT Request - Handling table: images");
                $sets = []; $types = ""; $values = [];
                foreach (["tratamiento_id", "ruta", "nombre_original", "tipo", "descripcion"] as $col) {
                    if (isset($data[$col])) {
                        $sets[]   = "$col = ?";
                        if ($col === "tratamiento_id") {
                            $types .= "i";
                        } else {
                            $types .= "s";
                        }
                        $values[] = $data[$col];
                    }
                }
                $types   .= "i";      // id
                $values[] = $id;
                $sql = "UPDATE images SET " . implode(", ", $sets) . " WHERE id = ?";
                error_log("DEBUG - PUT Request - SQL Query for images: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            case 'pieces':
                error_log("DEBUG - PUT Request - Handling table: pieces");
                $sets = []; $types = ""; $values = [];
                // 'piece_status' es el único campo que esperamos actualizar para una pieza a través de este PUT
                if (isset($data["piece_status"])) {
                    $sets[]   = "piece_status = ?";
                    $types   .= "i"; // Asumiendo piece_status es un entero (0 o 1)
                    $values[] = $data["piece_status"];
                } else {
                    http_response_code(400);
                    echo json_encode(["error" => "Falta el campo piece_status para actualizar la pieza."]);
                    break 2; // Salir de ambos switches
                }
                $types   .= "i";       // id para la cláusula WHERE
                $values[] = $id;
                $sql = "UPDATE pieces SET " . implode(", ", $sets) . " WHERE id = ?";
                // DEBUG: Log de la consulta SQL para PUT pieces
                error_log("DEBUG - PUT Request - SQL Query for pieces: " . $sql);
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$values);
                break;
            default:
                http_response_code(400);
                echo json_encode(["error" => "Tabla no especificada o no manejada para PUT"]);
                break;
        }

        // Este bloque solo se ejecuta si un 'case' anterior ha preparado $stmt
        if ($stmt && $stmt->execute()) {
            echo json_encode(["success" => true, "rows_affected" => $stmt->affected_rows]); // Añadido rows_affected
        } else if ($stmt) { // Solo si $stmt fue preparado y falló la ejecución
            http_response_code(500);
            echo json_encode(["error" => "Error al actualizar: " . $stmt->error]);
        } else { // Si $stmt nunca fue preparado (ej. tabla no manejada por el switch)
            // Ya se ha enviado un 400 en el default del switch
        }
        if ($stmt) $stmt->close(); // Cerrar statement si fue creado
        break; // Salir del switch principal

    case 'DELETE':
        if (!$id) {
            http_response_code(400);
            echo json_encode(["error" => "Falta parámetro id"]);
            break;
        }
        
        // Si es un pago, necesitamos actualizar el tratamiento antes de eliminar
        if ($table === 'payments') {
            // Obtener el pago antes de eliminarlo
            $stmt_get_payment = $conn->prepare("SELECT treatment_id, monto FROM payments WHERE id = ?");
            $stmt_get_payment->bind_param("i", $id); // Asumiendo ID es INT
            $stmt_get_payment->execute();
            $payment_result = $stmt_get_payment->get_result();
            
            if ($payment_result->num_rows > 0) {
                $payment = $payment_result->fetch_assoc();
                $treatment_id = $payment['treatment_id'];
                $monto_pago = floatval($payment['monto']);
                
                // Iniciar transacción
                $conn->begin_transaction();
                
                try {
                    // Eliminar el pago
                    $stmt = $conn->prepare("DELETE FROM {$table} WHERE id = ?");
                    $stmt->bind_param("i", $id); // Asumiendo ID es INT
                    
                    if (!$stmt->execute()) {
                        throw new Exception("Error al eliminar el pago: " . $stmt->error);
                    }
                    
                    // Obtener el tratamiento actual
                    $stmt_get_treatment = $conn->prepare("SELECT monto_total, monto_pagado, deuda FROM treatments WHERE id = ?");
                    $stmt_get_treatment->bind_param("i", $treatment_id);
                    $stmt_get_treatment->execute();
                    $treatment_result = $stmt_get_treatment->get_result();
                    
                    if ($treatment_result->num_rows > 0) {
                        $treatment = $treatment_result->fetch_assoc();
                        $monto_total = floatval($treatment['monto_total']);
                        $monto_pagado_actual = floatval($treatment['monto_pagado']);
                        
                        // Calcular nuevo monto_pagado (restar el monto del pago eliminado)
                        $nuevo_monto_pagado = $monto_pagado_actual - $monto_pago;
                        if ($nuevo_monto_pagado < 0) $nuevo_monto_pagado = 0;
                        
                        // Calcular nueva deuda
                        $nueva_deuda = $monto_total - $nuevo_monto_pagado;
                        
                        // Determinar nuevo estado
                        $nuevo_estado = '';
                        if ($nueva_deuda == 0 && $monto_total > 0) { // Si la deuda es 0 y el total es > 0, es pagado
                            $nuevo_estado = 'pagado';
                        } elseif ($nuevo_monto_pagado == 0) { // Si no se ha pagado nada
                            $nuevo_estado = 'pendiente';
                        } else { // Si se ha pagado algo pero no todo
                            $nuevo_estado = 'parcial';
                        }
                        
                        // Actualizar el tratamiento
                        $stmt_update_treatment = $conn->prepare("UPDATE treatments SET monto_pagado = ?, deuda = ?, estado = ? WHERE id = ?");
                        $stmt_update_treatment->bind_param("ddsi", $nuevo_monto_pagado, $nueva_deuda, $nuevo_estado, $treatment_id);
                        
                        if (!$stmt_update_treatment->execute()) {
                            throw new Exception("Error al actualizar el tratamiento: " . $stmt_update_treatment->error);
                        }
                    }
                    
                    $conn->commit();
                    echo json_encode(["success" => true]);
                    
                } catch (Exception $e) {
                    $conn->rollback();
                    http_response_code(500);
                    echo json_encode(["error" => $e->getMessage()]);
                }
                
            } else {
                http_response_code(404);
                echo json_encode(["error" => "Pago no encontrado"]);
            }
            $stmt_get_payment->close(); // Cerrar este statement también
            
        } else {
            // Para otras tablas, eliminar normalmente
            switch ($table) { // Añadido un switch para DELETE de otras tablas
                case 'clients':
                    // Obtener la ruta de la carpeta del cliente antes de eliminarlo de la DB
                    $sanitized_patient_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $id);
                    $folder_path = __DIR__ . "/../uploads/pacientes/" . $clinicSeg . "/" . $sanitized_patient_id;

                    $stmt = $conn->prepare("DELETE FROM clients WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    if ($stmt->execute()) {
                        $success = true;
                        $message = "Cliente eliminado correctamente.";

                        if (file_exists($folder_path)) {
                            try {
                                deleteDir($folder_path); // Usar la función definida
                                error_log("DEBUG - Carpeta de cliente eliminada: " . $folder_path);
                                $message .= " Carpeta de uploads también eliminada.";
                            } catch (Exception $e) {
                                error_log("ERROR - No se pudo eliminar la carpeta del cliente: " . $folder_path . " - Error: " . $e->getMessage());
                                $message .= " Pero hubo un error al eliminar su carpeta de uploads.";
                                $success = false;
                            }
                        } else {
                            error_log("DEBUG - La carpeta del cliente no existe: " . $folder_path);
                            $message .= " La carpeta de uploads no existía.";
                        }

                        echo json_encode(["success" => $success, "message" => $message, "rows_affected" => $stmt->affected_rows]);
                    } else {
                        http_response_code(500);
                        echo json_encode(["error" => "Error al eliminar cliente: " . $stmt->error]);
                    }
                    $stmt->close();
                    break;
                case 'services':
                    $stmt = $conn->prepare("DELETE FROM services WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    if ($stmt->execute()) {
                        echo json_encode(["success" => true, "rows_affected" => $stmt->affected_rows]);
                    } else {
                        http_response_code(500);
                        echo json_encode(["error" => "Error al eliminar servicio: " . $stmt->error]);
                    }
                    $stmt->close();
                    break;
                case 'treatments':
                    // Eliminar tratamiento con cascada manual (pieces, payments, images)
                    error_log("DEBUG - DELETE treatments - ID recibido: " . $id);

                    $stmt = $conn->prepare("SELECT client_id FROM treatments WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    $stmt->execute();
                    $result = $stmt->get_result();
                    $treatment_info = $result->fetch_assoc();
                    $stmt->close();

                    if ($treatment_info) {
                        $client_id_for_folder = $treatment_info['client_id'];
                        error_log("DEBUG - DELETE treatments - client_id: " . $client_id_for_folder);

                        // Iniciar transacción para eliminación en cascada
                        $conn->begin_transaction();

                        try {
                            // Paso 1: Eliminar piezas relacionadas
                            $stmt_pieces = $conn->prepare("DELETE FROM pieces WHERE treatment_id = ?");
                            $stmt_pieces->bind_param("i", $id);
                            $stmt_pieces->execute();
                            $pieces_deleted = $stmt_pieces->affected_rows;
                            error_log("DEBUG - DELETE pieces - Eliminadas " . $pieces_deleted . " piezas del tratamiento " . $id);
                            $stmt_pieces->close();

                            // Paso 2: Eliminar pagos relacionados
                            $stmt_payments = $conn->prepare("DELETE FROM payments WHERE treatment_id = ?");
                            $stmt_payments->bind_param("i", $id);
                            $stmt_payments->execute();
                            $payments_deleted = $stmt_payments->affected_rows;
                            error_log("DEBUG - DELETE payments - Eliminados " . $payments_deleted . " pagos del tratamiento " . $id);
                            $stmt_payments->close();

                            // Paso 3: Eliminar imágenes relacionadas (y archivos físicos)
                            $stmt_images = $conn->prepare("SELECT ruta FROM images WHERE tratamiento_id = ?");
                            $stmt_images->bind_param("i", $id);
                            $stmt_images->execute();
                            $images_result = $stmt_images->get_result();

                            while ($img = $images_result->fetch_assoc()) {
                                $full_file_path = __DIR__ . "/../" . $img['ruta'];
                                if (file_exists($full_file_path)) {
                                    unlink($full_file_path);
                                    error_log("DEBUG - DELETE images - Archivo físico eliminado: " . $full_file_path);
                                }
                            }
                            $stmt_images->close();

                            $stmt_delete_images = $conn->prepare("DELETE FROM images WHERE tratamiento_id = ?");
                            $stmt_delete_images->bind_param("i", $id);
                            $stmt_delete_images->execute();
                            $images_deleted = $stmt_delete_images->affected_rows;
                            error_log("DEBUG - DELETE images - Eliminadas " . $images_deleted . " imágenes del tratamiento " . $id);
                            $stmt_delete_images->close();

                            // Paso 4: Eliminar el tratamiento
                            $stmt_treatment = $conn->prepare("DELETE FROM treatments WHERE id = ?");
                            $stmt_treatment->bind_param("i", $id);
                            $stmt_treatment->execute();
                            $treatments_deleted = $stmt_treatment->affected_rows;
                            error_log("DEBUG - DELETE treatments - Tratamientos eliminados: " . $treatments_deleted);
                            $stmt_treatment->close();

                            $conn->commit();

                            // Eliminar carpeta de uploads
                            $success = true;
                            $message = "Tratamiento y " . ($pieces_deleted + $payments_deleted + $images_deleted) . " registros relacionados eliminados correctamente.";

                            $sanitized_client_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $client_id_for_folder);
                            $sanitized_treatment_id = preg_replace('/[^a-zA-Z0-9_\-.]/', '', $id);
                            $folder_path = __DIR__ . "/../uploads/pacientes/" . $clinicSeg . "/" . $sanitized_client_id . "/" . $sanitized_treatment_id;

                            if (file_exists($folder_path)) {
                                try {
                                    deleteDir($folder_path);
                                    error_log("DEBUG - Carpeta de tratamiento eliminada: " . $folder_path);
                                    $message .= " Carpeta de uploads también eliminada.";
                                } catch (Exception $e) {
                                    error_log("ERROR - No se pudo eliminar la carpeta del tratamiento: " . $folder_path . " - Error: " . $e->getMessage());
                                }
                            }

                            echo json_encode([
                                "success" => $success,
                                "message" => $message,
                                "pieces_deleted" => $pieces_deleted,
                                "payments_deleted" => $payments_deleted,
                                "images_deleted" => $images_deleted
                            ]);

                        } catch (Exception $e) {
                            $conn->rollback();
                            error_log("ERROR - Transacción rollback: " . $e->getMessage());
                            http_response_code(500);
                            echo json_encode(["error" => "Error al eliminar tratamiento y relacionados: " . $e->getMessage()]);
                        }

                    } else {
                        http_response_code(404);
                        echo json_encode(["error" => "Tratamiento no encontrado para eliminar. ID: " . $id]);
                    }
                    break;
                case 'appointments': // DELETE para citas
                    $stmt = $conn->prepare("DELETE FROM appointments WHERE id = ?");
                    $stmt->bind_param("i", $id);
                    if ($stmt->execute()) {
                        echo json_encode(["success" => true, "rows_affected" => $stmt->affected_rows]);
                    } else {
                        http_response_code(500);
                        echo json_encode(["error" => "Error al eliminar cita: " . $stmt->error]);
                    }
                    $stmt->close();
                    break;
                case 'images':
                    // Primero, obtener la ruta del archivo
                    $stmt_get_file = $conn->prepare("SELECT ruta FROM images WHERE id = ?");
                    $stmt_get_file->bind_param("i", $id);
                    $stmt_get_file->execute();
                    $file_result = $stmt_get_file->get_result();
                    $file_info = $file_result->fetch_assoc();
                    $stmt_get_file->close();

                    if ($file_info) {
                        $file_path_relative = $file_info['ruta'];
                        $full_file_path = __DIR__ . "/../" . $file_path_relative;

                        $stmt = $conn->prepare("DELETE FROM images WHERE id = ?");
                        $stmt->bind_param("i", $id);

                        if ($stmt->execute()) {
                            $success = true;
                            $message = "Archivo eliminado correctamente de la base de datos.";
                            if (file_exists($full_file_path)) {
                                if (unlink($full_file_path)) {
                                    error_log("DEBUG - Archivo físico eliminado: " . $full_file_path);
                                    $message .= " Archivo físico también eliminado.";
                                } else {
                                    error_log("ERROR - No se pudo eliminar el archivo físico: " . $full_file_path);
                                    $message .= " Pero hubo un error al eliminar el archivo físico.";
                                    $success = false;
                                }
                            } else {
                                error_log("DEBUG - Archivo físico no encontrado en: " . $full_file_path);
                                $message .= " El archivo físico no existía.";
                            }
                            echo json_encode(["success" => $success, "message" => $message, "rows_affected" => $stmt->affected_rows]);
                        } else {
                            http_response_code(500);
                            echo json_encode(["error" => "Error al eliminar el archivo de la base de datos: " . $stmt->error]);
                        }
                    } else {
                        http_response_code(404);
                        echo json_encode(["error" => "Archivo no encontrado para eliminar."]);
                    }
                    $stmt->close();
                    break;
                default:
                    http_response_code(400);
                    echo json_encode(["error" => "Tabla no especificada o no manejada para DELETE"]);
                    break;
            }
        }
        break;

    case 'OPTIONS':
        http_response_code(204);
        break;

    default:
        http_response_code(405);
        echo json_encode(["error" => "Método no permitido"]);
}

$conn->close();
exit;
?>