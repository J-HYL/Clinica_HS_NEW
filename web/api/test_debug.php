<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db_connect_public.php';

$result = [];
foreach (['mostoles', 'alcorcon'] as $clinic) {
    $conn = getConnectionByClinic($clinic);
    if (!$conn) { $result[$clinic] = 'Sin conexion'; continue; }
    $r = $conn->query("DESCRIBE contactos");
    $cols = [];
    while ($row = $r->fetch_assoc()) $cols[] = $row['Field'] . ' (' . $row['Type'] . ')';
    $result[$clinic] = $cols;
    $conn->close();
}
echo json_encode($result, JSON_PRETTY_PRINT);