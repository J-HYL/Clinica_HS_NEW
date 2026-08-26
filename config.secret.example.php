<?php
/**
 * PLANTILLA de configuración (sí se versiona, sin secretos).
 * Copia este archivo como  config.secret.php  y rellena las credenciales reales.
 * config.secret.php está en .gitignore y NO debe subirse a git.
 */
return [
    'db' => [
        'prod' => [
            'alcorcon' => ['host' => '', 'user' => '', 'pass' => '', 'db' => ''],
            'mostoles' => ['host' => '', 'user' => '', 'pass' => '', 'db' => ''],
        ],
        'pre' => [
            'alcorcon' => ['host' => '', 'user' => '', 'pass' => '', 'db' => ''],
            'mostoles' => ['host' => '', 'user' => '', 'pass' => '', 'db' => ''],
        ],
        'local' => ['host' => 'localhost', 'user' => 'root', 'pass' => '', 'db' => 'clinicahs'],
    ],
    'smtp' => [
        'host' => 'smtp.ionos.es',
        'user' => '',
        'pass' => '',
        'port' => 587,
    ],
    // Token secreto para lanzar los cron por URL (?token=...). Genera uno aleatorio.
    'cron_token' => '',
];
