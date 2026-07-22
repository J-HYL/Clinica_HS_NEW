#Requires -Version 5.1
<#
.SYNOPSIS
    Deja listo el entorno local de HS Dental sobre un XAMPP ya instalado.

.DESCRIPTION
    De todo el montaje solo hay dos cosas que de verdad haya que escribir: los
    vhosts y config.secret.php. El resto son comprobaciones, que es lo que hace
    falta cuando esto se monta en un PC ajeno y algo no arranca.

    Idempotente: se puede ejecutar tantas veces como haga falta. Pasos:
      0. Comprueba XAMPP (PHP 8 y las extensiones que usa la app).
      1. Escribe los vhosts: app -> 8080, web -> 8081, apuntando a ESTE repo.
      2. Crea config.secret.php en la raiz desde la plantilla (si no existe).
      3. Crea app/uploads/pacientes y app/uploads/facturas.
      4. Comprueba la BD local y aplica el indice de db/migrations/001.
      5. Verifica que http://localhost:8080 sirve el selector de clinica.

    NO instala XAMPP y NO importa el dump: los dos pasos son manuales y previos.
    Tampoco toca el php.ini: XAMPP ya trae activadas las extensiones que hacen
    falta (mysqli, mbstring, dom, openssl); si falta alguna, avisa y ya esta.

    Nunca sobrescribe un config.secret.php existente, y respalda httpd-vhosts.conf
    con extension .hsdental-bak la primera vez que lo toca.

.PARAMETER XamppPath
    Carpeta de instalacion de XAMPP. Por defecto C:\xampp.

.PARAMETER DbName
    Nombre de la BD local. Por defecto dbs15816600, que es el que trae el
    "USE" del dump; si la importaste con otro nombre, pasalo aqui.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\setup-local.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\setup-local.ps1 -XamppPath D:\xampp -DbName hsdental_local
#>
[CmdletBinding()]
param(
    [string]$XamppPath = 'C:\xampp',
    [string]$DbName    = 'dbs15816600',
    [string]$DbUser    = 'root',
    [string]$DbPass    = '',
    [int]$PuertoApp    = 8080,
    [int]$PuertoWeb    = 8081,
    [int]$PuertoPortal = 8082
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------- utilidades

function Paso  ($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Ok    ($t)     { Write-Host "     OK   $t" -ForegroundColor Green }
function Info  ($t)     { Write-Host "     --   $t" -ForegroundColor Gray }
function Aviso ($t)     { Write-Host "     !!   $t" -ForegroundColor Yellow }
function Fallo ($t)     { Write-Host "     XX   $t" -ForegroundColor Red }

# PHP no tolera un BOM antes de "<?php": se colaria en la salida y romperia el
# JSON de la API. Todo lo que escribamos va en UTF-8 sin BOM.
function Escribir-Texto ([string]$Ruta, [string]$Texto) {
    [System.IO.File]::WriteAllText($Ruta, $Texto, (New-Object System.Text.UTF8Encoding($false)))
}

function Leer-Texto ([string]$Ruta) {
    return [System.IO.File]::ReadAllText($Ruta)
}

# Respalda solo la primera vez, para no pisar el original con nuestra version.
function Respaldar ([string]$Ruta) {
    $bak = "$Ruta.hsdental-bak"
    if ((Test-Path $Ruta) -and -not (Test-Path $bak)) {
        Copy-Item $Ruta $bak
        Info "Copia de seguridad: $bak"
    }
}

$repo    = $PSScriptRoot
$repoFwd = $repo.Replace('\', '/')   # Apache quiere barras normales
$errores = 0

Write-Host ""
Write-Host "  HS Dental - preparacion del entorno local" -ForegroundColor White
Write-Host "  Repo:  $repo" -ForegroundColor DarkGray
Write-Host "  XAMPP: $XamppPath" -ForegroundColor DarkGray

# ------------------------------------------------- 0. comprobaciones previas

Paso 0 'Comprobando XAMPP y el repositorio'

if (-not (Test-Path (Join-Path $repo 'app\api\DB.php'))) {
    Fallo "Este script tiene que vivir en la raiz del repo (junto a app\ y web\)."
    exit 1
}
if (-not (Test-Path $XamppPath)) {
    Fallo "No existe $XamppPath. Instala XAMPP o pasa -XamppPath <ruta>."
    exit 1
}

$phpExe   = Join-Path $XamppPath 'php\php.exe'
$phpIni   = Join-Path $XamppPath 'php\php.ini'
$vhosts   = Join-Path $XamppPath 'apache\conf\extra\httpd-vhosts.conf'
$httpdCnf = Join-Path $XamppPath 'apache\conf\httpd.conf'
$mysqlExe = Join-Path $XamppPath 'mysql\bin\mysql.exe'

foreach ($f in @($phpExe, $phpIni, $vhosts, $httpdCnf, $mysqlExe)) {
    if (-not (Test-Path $f)) {
        Fallo "Falta un archivo de XAMPP: $f"
        exit 1
    }
}

# ¿Podemos escribir en la config de XAMPP? Sin esto no hay nada que hacer.
try {
    $sonda = Join-Path $XamppPath 'apache\conf\extra\.hsdental-sonda'
    New-Item -ItemType File -Path $sonda -Force | Out-Null
    Remove-Item $sonda -Force
} catch {
    Fallo "Sin permisos de escritura en $XamppPath. Abre PowerShell como Administrador."
    exit 1
}

$phpVer = (& $phpExe -r 'echo PHP_VERSION;')
if ([version]($phpVer -replace '[^0-9.].*$', '') -lt [version]'8.0') {
    Fallo "PHP $phpVer. dompdf 3.x necesita PHP 8. Instala un XAMPP con PHP 8.x."
    exit 1
}
Ok "PHP $phpVer"

# Todas estas las trae XAMPP activadas de serie; si falta alguna es que alguien
# ha tocado el php.ini. No lo arreglamos por su cuenta: solo avisamos.
$modulos = (& $phpExe -m) -split "`r?`n" | ForEach-Object { $_.Trim().ToLower() }
foreach ($m in @('mysqli', 'mbstring', 'dom')) {
    if ($modulos -contains $m) { Ok "extension $m" }
    else { Fallo "falta la extension $m en $phpIni (descomenta extension=$m)"; $errores++ }
}
# openssl solo hace falta para el correo por SMTP (PHPMailer): app/api/soporte.php,
# el formulario de web/ y el cron de agenda. El panel funciona sin ella.
if ($modulos -contains 'openssl') {
    Ok 'extension openssl'
} else {
    Aviso 'falta openssl: el panel ira, pero no saldra ningun correo (PHPMailer/SMTP).'
}

# ------------------------------------------------------------- 1. los vhosts

Paso 1 "Configurando vhosts (app -> $PuertoApp, web -> $PuertoWeb)"

$marcaIni = '# === HS Dental - entorno local (setup-local.ps1) INICIO ==='
$marcaFin = '# === HS Dental - entorno local (setup-local.ps1) FIN ==='

# El DocumentRoot apunta a app/ y web/ directamente (no a la raiz del repo):
# todo el front usa rutas absolutas de raiz (/js/..., /api/DB.php, /assets/...),
# asi que servirlo desde un subdirectorio lo rompe. Y AllowOverride All es lo
# que hace que funcione app/.htaccess -> DirectoryIndex api/index.php (login).
# Ojo: hay que entrar por localhost; con cualquier otro host, currentEnv() de
# app/api/db_connect.php devuelve 'prod' y se conectaria a la BD REAL.
$bloque = @"
$marcaIni
# Generado automaticamente. Para regenerarlo, ejecuta setup-local.ps1 de nuevo.
Listen $PuertoApp
Listen $PuertoWeb
Listen $PuertoPortal

<VirtualHost *:$PuertoApp>
    DocumentRoot "$repoFwd/app"
    <Directory "$repoFwd/app">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

<VirtualHost *:$PuertoWeb>
    DocumentRoot "$repoFwd/web"
    <Directory "$repoFwd/web">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

<VirtualHost *:$PuertoPortal>
    DocumentRoot "$repoFwd/portal"
    <Directory "$repoFwd/portal">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
$marcaFin
"@

Respaldar $vhosts
$conf = Leer-Texto $vhosts

$i = $conf.IndexOf($marcaIni)
$j = $conf.IndexOf($marcaFin)
$yaNuestro = ($i -ge 0 -and $j -gt $i)

# Un "Listen" o un vhost duplicado en el mismo puerto impide que Apache
# arranque. Si ya hay config a mano para estos puertos (fuera de nuestro
# bloque), paramos: es mejor eso que dejar el Apache del PC sin arrancar.
$resto = if ($yaNuestro) { $conf.Substring(0, $i) + $conf.Substring($j + $marcaFin.Length) } else { $conf }
$conflicto = $false
foreach ($p in @($PuertoApp, $PuertoWeb, $PuertoPortal)) {
    if ($resto -match "(?m)^\s*Listen\s+$p\s*$" -or $resto -match "(?m)^\s*<VirtualHost\s+[^>]*:$p\s*>") {
        Fallo "httpd-vhosts.conf ya tiene configuracion propia para el puerto $p."
        $conflicto = $true
    }
}
if ($conflicto) {
    Info "Quita a mano esas lineas (o usa -PuertoApp/-PuertoWeb con otros puertos) y repite."
    Info "Tienes el original intacto en $vhosts.hsdental-bak"
    exit 1
}

if ($yaNuestro) {
    $conf = $conf.Substring(0, $i) + $bloque + $conf.Substring($j + $marcaFin.Length)
    Ok 'Bloque de vhosts actualizado'
} else {
    $conf = $conf.TrimEnd() + "`r`n`r`n" + $bloque + "`r`n"
    Ok 'Bloque de vhosts anadido'
}
Escribir-Texto $vhosts $conf

# Lo mismo, pero en httpd.conf (ahi solo avisamos: no es nuestro archivo).
$httpd = Leer-Texto $httpdCnf
foreach ($p in @($PuertoApp, $PuertoWeb, $PuertoPortal)) {
    if ($httpd -match "(?m)^\s*Listen\s+$p\s*$") {
        Aviso "httpd.conf ya tiene 'Listen $p'. Quitalo de ahi o Apache no arrancara."
    }
}

# Y avisamos si otro programa ocupa los puertos (Apache mismo no cuenta).
foreach ($p in @($PuertoApp, $PuertoWeb, $PuertoPortal)) {
    $con = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($con) {
        $proc = (Get-Process -Id $con.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        if ($proc -and $proc -ne 'httpd') {
            Aviso "El puerto $p ya lo usa '$proc'. Cierralo o ejecuta con -PuertoApp/-PuertoWeb."
        }
    }
}

# -------------------------------------------------- 2. config.secret.php

Paso 2 'Creando config.secret.php'

$secreto  = Join-Path $repo 'config.secret.php'
$plantilla = Join-Path $repo 'config.secret.example.php'

if (Test-Path $secreto) {
    Ok 'Ya existe, no se toca (puede tener credenciales reales)'
} elseif (-not (Test-Path $plantilla)) {
    Fallo "Falta $plantilla"; $errores++
} else {
    $txt = Leer-Texto $plantilla

    # Bloque local: en 'local', getConnection() ignora la clinica y usa esta BD.
    $passPhp    = $DbPass.Replace('\', '\\').Replace("'", "\'")
    $lineaLocal = "        'local' => ['host' => 'localhost', 'user' => '$DbUser', 'pass' => '$passPhp', 'db' => '$DbName'],"
    $txt = [regex]::Replace($txt, "(?m)^\s*'local'\s*=>.*$",
           [System.Text.RegularExpressions.MatchEvaluator] { param($m) $lineaLocal })

    # Token para los cron de agenda; aqui solo hace falta uno cualquiera.
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $token = ($bytes | ForEach-Object { $_.ToString('x2') }) -join ''
    $txt = $txt.Replace("'cron_token' => ''", "'cron_token' => '$token'")

    Escribir-Texto $secreto $txt
    Ok "Creado con el bloque 'local' -> BD '$DbName'"
    Info "Los bloques prod/pre quedan vacios (no hacen falta para trabajar en local)."
}

# ------------------------------------------------------ 3. carpetas de subida

# DB.php ya las crea solas con mkdir recursivo la primera vez que subes algo;
# las hacemos aqui solo para que el arbol se parezca al del servidor desde el
# minuto cero y no sorprenda ver app/uploads vacia.
Paso 3 'Creando carpetas de uploads'

foreach ($sub in @('uploads\pacientes', 'uploads\facturas')) {
    $ruta = Join-Path $repo "app\$sub"
    if (Test-Path $ruta) {
        Ok "$sub ya existe"
    } else {
        New-Item -ItemType Directory -Path $ruta -Force | Out-Null
        Ok "$sub creada"
    }
}
Info 'Los archivos de pacientes que ya existen en el servidor no estan aqui: es normal.'

# -------------------------------------------------------- 4. base de datos

Paso 4 "Comprobando la base de datos '$DbName'"

# Construimos los argumentos comunes del cliente de MariaDB.
$myArgs = @('-h', '127.0.0.1', '-u', $DbUser, '--batch', '--skip-column-names')
if ($DbPass) { $myArgs += "-p$DbPass" }

function Consulta ([string]$sql) {
    $r = & $mysqlExe @myArgs -e $sql
    if ($LASTEXITCODE -ne 0) { return $null }
    return ($r | Select-Object -First 1)
}

# Ojo al distinguir los dos fallos: una consulta sin filas y una conexion rota
# devuelven las dos vacio. Por eso primero un ping, y luego un COUNT (que
# siempre devuelve fila) para saber si la BD esta.
$ping = Consulta 'SELECT 1;'

if ($ping -ne '1') {
    Fallo 'No se puede conectar a MySQL. Arranca MySQL en el panel de XAMPP y repite.'
    Info  'Si root tiene contrasena, ejecuta el script con -DbPass <clave>.'
    $errores++
} elseif ([int](Consulta "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DbName';") -eq 0) {
    Fallo "La BD '$DbName' no existe todavia."
    Info  "Creala en phpMyAdmin (cotejamiento utf8mb4_general_ci) e importa el dump."
    Info  "Recuerda: el dump lleva 'USE ``dbs15816600``;' -> la BD debe llamarse asi,"
    Info  "o cambias esa linea del .sql y pasas -DbName <nombre> a este script."
    $errores++
} else {
    $tablas = [int](Consulta "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DbName';")
    if ($tablas -lt 11) {
        Aviso "La BD existe pero solo tiene $tablas tablas (se esperan 11). ¿Importaste el dump?"
    } else {
        Ok "$tablas tablas"
    }

    $usuarios = [int](Consulta "SELECT COUNT(*) FROM ``$DbName``.users;")
    if ($usuarios -gt 0) {
        Ok "$usuarios usuario(s) en 'users' (login disponible)"
    } else {
        Aviso "La tabla 'users' esta vacia: no podras entrar. Inserta un usuario o reimporta."
    }

    # db/migrations/001: el dump es anterior a la migracion y no trae el indice.
    # Si anades migraciones nuevas, replica aqui la comprobacion (no hay runner).
    $idx = [int](Consulta @"
SELECT COUNT(*) FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA='$DbName' AND TABLE_NAME='appointments' AND INDEX_NAME='idx_appointments_fecha';
"@)
    if ($idx -gt 0) {
        Ok 'Migracion 001 (indice appointments.fecha) ya aplicada'
    } else {
        $null = Consulta "CREATE INDEX idx_appointments_fecha ON ``$DbName``.appointments (fecha);"
        if ($LASTEXITCODE -eq 0) { Ok 'Migracion 001 aplicada (indice appointments.fecha)' }
        else { Aviso 'No se pudo crear el indice de la migracion 001; aplicalo a mano.' }
    }
}

# ---------------------------------------------------------- 5. verificacion

Paso 5 'Verificando que la app responde'

Write-Host ""
Write-Host "     >> REINICIA Apache desde el Panel de Control de XAMPP (Stop y Start)." -ForegroundColor White
Write-Host "        Esperando a que responda http://localhost:$PuertoApp ..." -ForegroundColor DarkGray

$listo = $false
foreach ($intento in 1..30) {   # ~90 s de margen para el reinicio manual
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$PuertoApp/" -UseBasicParsing -TimeoutSec 3
        if ($r.Content -match 'Selecciona tu') {
            # Que salga el selector prueba las dos cosas de golpe: el vhost apunta
            # bien y .htaccess (DirectoryIndex api/index.php) se esta aplicando.
            Write-Host ""
            Ok "http://localhost:$PuertoApp sirve el selector de clinica"
            $listo = $true
            break
        } else {
            Write-Host ""
            Aviso 'Apache responde pero no sale el selector de clinica.'
            Info  'Suele ser AllowOverride: sin el, .htaccess no se aplica y se sirve index.html.'
            break
        }
    } catch {
        Start-Sleep -Seconds 3
        Write-Host '.' -NoNewline -ForegroundColor DarkGray
    }
}

if (-not $listo -and $intento -ge 30) {
    Write-Host ""
    Aviso "Nadie responde en el puerto $PuertoApp."
    Info  "Mira el log: $XamppPath\apache\logs\error.log"
}

# ------------------------------------------------------------------ resumen

Write-Host ""
if ($errores -eq 0 -and $listo) {
    Write-Host "  Listo. Entra en http://localhost:$PuertoApp y elige clinica." -ForegroundColor Green
    Write-Host "  La web publica esta en http://localhost:$PuertoWeb" -ForegroundColor DarkGray
    Write-Host "  El portal de pacientes esta en http://localhost:$PuertoPortal" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "  Si no sabes la contrasena del panel, ponte una en local:" -ForegroundColor DarkGray
    Write-Host "    UPDATE users SET password = SHA2('loquesea', 256) WHERE username = 'alcrcnHS';" -ForegroundColor DarkGray
} else {
    Write-Host "  Terminado con avisos: repasa las lineas marcadas con !! o XX." -ForegroundColor Yellow
}
Write-Host ""
