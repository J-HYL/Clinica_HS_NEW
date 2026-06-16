  <?php
  // test_mail.php - Script para probar envío de correo directamente
  // Sube este archivo a: /web/api/test_mail.php
  // Accede a: https://tu-dominio.com/api/test_mail.php

  // Aseguramos que se muestren todos los errores para depuración
  error_reporting(E_ALL);
  ini_set('display_errors', 1);
  ini_set('log_errors', 1);
  ini_set('error_log', __DIR__ . '/php_error.log');

  // Importamos PHPMailer
  require_once __DIR__ . '/PHPMailer/src/PHPMailer.php';
  require_once __DIR__ . '/PHPMailer/src/SMTP.php';
  require_once __DIR__ . '/PHPMailer/src/Exception.php';

  use PHPMailer\PHPMailer\PHPMailer;
  use PHPMailer\PHPMailer\Exception;

  echo "<!DOCTYPE html>
  <html lang='es'>
  <head>
      <meta charset='UTF-8'>
      <title>Prueba de configuración SMTP - HSDental</title>
      <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .container { max-width: 800px; margin: 0 auto; }
          .success { color: #28a745; }
          .error { color: #dc3545; }
          .debug { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; font-family: monospace;
  font-size: 14px; }
          h1, h2 { color: #2c3e50; }
      </style>
  </head>
  <body>
      <div class='container'>
          <h1>Prueba de configuración SMTP</h1>
          <div class='debug' id='debug-output'>
              <strong>Iniciando prueba...</strong><br>
          </div>
  ";

  function logDebug($message) {
      echo "<script>document.getElementById('debug-output').innerHTML += '$message<br>';</script>";
      flush();
      ob_flush();
      error_log("SMTP TEST: $message");
  }

  function testEmail() {
      logDebug("Inicializando PHPMailer...");

      $mail = new PHPMailer(true);
      try {
          // Configuración SMTP
          logDebug("Configurando SMTP...");
          $mail->isSMTP();
          $mail->Host       = 'smtp.ionos.es';
          $mail->SMTPAuth   = true;
          $mail->Username   = 'avisos@hsdental.es';
          $mail->Password   = 'Jjbinks1999$';
          $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS; // Probamos con STARTTLS primero
          $mail->Port       = 587;
          $mail->CharSet    = 'UTF-8';

          // Activar depuración completa
          logDebug("Activando depuración SMTP (nivel 4)...");
          $mail->SMTPDebug = 4; // Nivel máximo de depuración
          $mail->Debugoutput = function($str, $level) use (&$mailDebugBuffer) {
              global $mailDebugBuffer;
              $mailDebugBuffer .= "SMTP DEBUG: $str\n";
              logDebug("SMTP DEBUG: $str");
          };

          $mail->setFrom('avisos@hsdental.es', 'HSDental Test');
          // IMPORTANTE: CAMBIA ESTE EMAIL POR UNO QUE PUEDAS REVISAR
          $testEmail = 'jhonrodrigohyl@gmail.com'; // ← CAMBIA ESTO
          $mail->addAddress($testEmail);
          logDebug("Dirección de destino añadida: $testEmail");

          $mail->isHTML(true);
          $mail->Subject = 'Prueba de SMTP - HSDental - ' . date('Y-m-d H:i:s');
          $mail->Body    = '<h3>Esta es una prueba de envío de correo</h3>'
                          . '<p>Si recibes este mensaje, la configuración SMTP funciona correctamente.</p>'
                          . '<p><strong>Fecha y hora:</strong> ' . date('d/m/Y H:i:s') . '</p>';

          logDebug("Intentando enviar correo...");
          if($mail->send()) {
              logDebug("<span class='success'>CORREO ENVIADO CORRECTAMENTE!</span>");
              echo "<script>document.getElementById('debug-output').innerHTML += '<p class=\"success\">CORREO ENVIADO
  CORRECTAMENTE!</p>';</script>";
              return true;
          } else {
              $errorMsg = $mail->ErrorInfo;
              logDebug("<span class='error'>ERROR AL ENVIAR: $errorMsg</span>");
              echo "<script>document.getElementById('debug-output').innerHTML += '<p class=\"error\">ERROR AL ENVIAR:
  $errorMsg</p>';</script>";
              return false;
          }
      } catch (Exception $e) {
          $errorMsg = $e->getMessage();
          logDebug("<span class='error'>EXCEPCIÓN: $errorMsg</span>");
          echo "<script>document.getElementById('debug-output').innerHTML += '<p class=\"error\">EXCEPCIÓN:
  $errorMsg</p>';</script>";
          return false;
      }
  }

  // Ejecutar la prueba
  echo "<h2>Resultados de la prueba:</h2>";
  $success = testEmail();

  echo "
          <hr>
          <h2>Próximos pasos:</h2>
          <ol>
              <li>Revisa arriba si ves mensajes de 'SMTP DEBUG:' que muestren la conexión con el servidor</li>
              <li>Revisa si recibiste el correo en la dirección que configuraste</li>
              <li>Si no funcionó, los mensajes de debug mostrarán exactamente dónde falló</li>
          </ol>

          <h2>Interpretación de resultados:</h2>
          <ul>
              <li><strong>Si ves 'Connection: opened' y 'Authentication successful':</strong> La conexión y auth
  funcionan</li>
              <li><strong>Si ves 'Connection failed' o 'Could not connect to SMTP host':</strong> El servidor bloquea la
   conexión</li>
              <li><strong>Si ves 'Authentication failed':</strong> Usuario o contraseña incorrectos</li>
              <li><strong>Si el correo se envía pero no lo recibes:</strong> Revisa spam o el servidor de destino lo
  está filtrando</li>
          </ul>

          <p><em>Nota: Recuerda cambiar 'tuemail@prueba.com' en el código por un email real que puedas revisar.</em></p>
      </div>
  </body>
  </html>";
  ?>