# CLAUDE.md — HS Dental

Guia para futuras sesiones de Claude Code en este repositorio. Lee siempre los archivos reales antes de cambiar algo; aqui se resume como encaja todo y donde estan las trampas.

> **⚠️ REGLA DE ORO — TODO CAMBIO DEBE FUNCIONAR EN PRE Y EN PRODUCCION.**
> Cualquier cambio que se pida tiene que funcionar **igual** en `pre.hsdental.es` (preproduccion) y en `app.hsdental.es` / `hsdental.es` (produccion), **sin ajustes manuales por entorno**. El codigo debe ser **agnostico del entorno**, y hay que **hacer lo necesario** para que asi sea:
> - Detectar el entorno por host con `currentEnv()` (`pre.*` -> pre, resto -> prod, `localhost` -> local). **Nunca** hardcodear valores/URLs de un solo entorno.
> - URLs **relativas / mismo-origen** en el JS (nada de `https://app.hsdental.es/...` fijo).
> - Credenciales y BD **siempre** desde `config.secret.php`, por entorno (bloques `prod`/`pre`/`local`).
> - Rutas de archivos de pacientes **aisladas por clinica** (`uploads/pacientes/clinica{id}/...`).
> - El logo del PDF va en **base64 server-side** (no depende del host).
>
> Antes de dar por terminado cualquier cambio: **verifica que no rompe ni pre ni produccion** (ni local). Si algo necesita config especifica por entorno, se resuelve por `config.secret.php` o deteccion por host, jamas hardcodeando un solo entorno.

---

## 1. Resumen del proyecto y stack

**HS Dental** es el portal de una clinica dental con dos sedes (Alcorcon y Mostoles), alojado en un webspace de IONOS. Son **DOS aplicaciones PHP independientes** en el mismo hosting:

- **`app/`** — Aplicacion de gestion interna (panel). Login por clinica; gestiona citas, clientes/pacientes, tratamientos, pagos, piezas (odontograma), imagenes/PDF adjuntos, visitas y facturas. Genera PDFs de factura con dompdf.
- **`web/`** — Web publica (landing): pagina de marketing, formulario de contacto (PHPMailer/SMTP), banner de cookies (inactivo) y paginas legales.

**Stack:** PHP (sin framework) + MySQL 8.0 (InnoDB, utf8mb4) + JavaScript vanilla con **modulos ES nativos** (sin bundler, sin npm). Librerias de terceros por CDN/vendorizadas (SweetAlert2, DataTables+jQuery, FullCalendar, Notyf, RemixIcon, dompdf, PHPMailer). Hosting IONOS, despliegue por SFTP.

**Idioma del codigo:** espanol (con restos de ingles en nombres antiguos de columnas/funciones).

---

## 2. Arquitectura general

### Mapeo dominio -> carpeta (docroots)

| Dominio | Docroot | Carpeta repo |
|---|---|---|
| `app.hsdental.es` | `/app` | `app/` |
| `hsdental.es` (+ `www`) | `/web` | `web/` |
| `pre.hsdental.es` | `/pre/app` (replica) | `app/` desplegado bajo `/pre` |
| raiz webspace `/` | — | `config.secret.php` (FUERA de docroot) |

### Diagrama (texto)

```
                          Webspace IONOS
  /  (raiz, NO web-accesible)
  |-- config.secret.php          <- credenciales app/ (gitignored)
  |
  |-- /app  (app.hsdental.es)    APP DE GESTION
  |     index.php (DirectoryIndex via api/index.php)  -> elige clinica
  |     api/index.php  -> set $_SESSION['clinic_id']  -> api/login.php
  |     api/login.php  -> hash sha256 vs users        -> set logged_in -> index.html
  |     index.html (panel estatico)
  |        \-- js/*.js (modulos ES) --fetch credentials:include--> api/DB.php
  |     api/DB.php   -> guard auth (401) + CORS + CRUD + PDF facturas (dompdf)
  |     api/db_connect.php -> currentEnv() + getConnection() (BD por clinica)
  |
  |-- /web  (hsdental.es)        WEB PUBLICA
  |     index.html (landing) -> script.js
  |        \-- POST /api/contacto.php (JSON)
  |     api/contacto.php -> INSERT contactos + 2 emails (PHPMailer SMTP)
  |     api/db_connect_public.php -> getConnectionByClinic() [CREDENCIALES HARDCODEADAS]
  |
  |-- /pre  (pre.hsdental.es)    copia de preproduccion (replica /app y /web)

  MySQL: UNA BD POR CLINICA Y ENTORNO (no hay columna clinic_id en las tablas).
```

La **identidad de clinica nunca viaja en URL ni query** en `app/`: se guarda solo en `$_SESSION['clinic_id']` (1=Alcorcon, 2=Mostoles) y `db_connect.php` la usa server-side para elegir la BD.

---

## 3. Entornos y configuracion

### `currentEnv()` (deteccion por host)

En `app/api/db_connect.php`, lee `$_SERVER['SERVER_NAME']`:

- `localhost` / `127.0.0.1` -> `'local'`
- host que **empieza por `pre.`** -> `'pre'`
- cualquier otro (`app.hsdental.es`, `hsdental.es`) -> `'prod'`

El entorno **no se configura por variable ni archivo**: se deriva del host en runtime.

### `config.secret.php` (solo lo usa `app/`)

- Plantilla versionada **sin secretos**: `config.secret.example.php` (raiz).
- El real `config.secret.php` esta en la **raiz del proyecto, FUERA de los docroots, gitignored y NO web-accesible**.
- Se incluye con `require __DIR__ . '/../../config.secret.php'` (desde `app/api/` sube dos niveles a la raiz).
- Estructura:
  ```php
  return [
    'db' => [
      'prod'  => ['alcorcon' => [host,user,pass,db], 'mostoles' => [...]],
      'pre'   => ['alcorcon' => [...], 'mostoles' => [...]],
      'local' => [host,user,pass,db],   // PLANO, sin nivel de clinica
    ],
    'smtp' => ['host'=>'smtp.ionos.es', 'user'=>..., 'pass'=>..., 'port'=>587],
  ];
  ```
- **Nota de estructura:** `db['prod']`/`db['pre']` tienen nivel de clinica; `db['local']` es plano.

### `getConnection()` (seleccion de BD)

- En `'local'`: usa `db['local']` directo, sin exigir clinica.
- En `'pre'`/`'prod'`: exige `$_SESSION['clinic_id']`; mapea `[1=>'alcorcon', 2=>'mostoles']` y toma `db[$env][$clinicKey]`. Si no hay clinica seleccionada o la clinica no existe en ese entorno, hace `die(json_encode(["error"=>...]))`.
- Devuelve un `mysqli`. **Importante:** ese `die()` devuelve JSON crudo con HTTP 200 (no fija codigo de error), asi que el cliente puede recibir 200 con `{"error":...}`.

### BD por clinica / entorno

Una BD fisica por clinica, **mismo esquema en todas**. PRE es una copia independiente (`dbs15816600`) con **solo Alcorcon habilitada** por ahora. Si la sesion trae `clinic_id=2` en PRE -> `getConnection()` muere con "Clinica no disponible en este entorno (pre)".

---

## 4. La app de gestion (`app/`)

### Flujo de login (paginas PHP server-side, NO SPA)

1. **`app/.htaccess`**: `DirectoryIndex api/index.php` — la raiz del docroot ejecuta `api/index.php`, **no** `index.html`. (El `Redirect 301` esta comentado.)
2. **`app/api/index.php`**: con `?clinic=alcorcon|mostoles` setea `$_SESSION['clinic_id']` (1/2) y redirige a `api/login.php`. Sin parametro muestra dos botones de seleccion de clinica.
3. **`app/api/login.php`**: el usuario es **fijo segun clinica** (`alcrcnHS` para 1, `mstlsHS` para 2); solo pide contrasena. Compara `hash("sha256", $password) === trim($user["password"])` contra `users.password`. Si OK -> `$_SESSION['logged_in']=true`, `$_SESSION['user']=username` y redirige a `../index.html`. Inyecta `window.CLINIC` (`clinic1`/`clinic2`) — **pero esa variable NO es la fuente de verdad** de autorizacion ni de BD (eso es la sesion).
4. **`app/index.html`**: panel/dashboard estatico (sin PHP, **sin guardia de login propia**). Carga `js/main.js` (sidebar) y un script de pagina como modulos ES.

La proteccion real esta en la API: `DB.php` devuelve **401** si falta `logged_in` o `clinic_id`. `index.html` se sirve igual sin login, pero las cargas de datos fallan con 401 y se ve una alerta de error (no hay redireccion al login, ni logout, ni expiracion gestionados aqui).

### API servidor: `app/api/DB.php`

Unico endpoint REST del panel. Un solo script PHP que enruta por `?table=<tabla>` y metodo HTTP con **dos switch anidados** (metodo -> tabla). Siempre responde JSON.

- **Guard de auth:** `if (empty($_SESSION['logged_in']) || empty($_SESSION['clinic_id']))` -> 401 y exit.
- **CORS:** allowlist `['https://app.hsdental.es','https://pre.hsdental.es']`; si el Origin no esta, cae por defecto a `https://app.hsdental.es`. `Allow-Credentials: true`. Un dominio/subdominio nuevo requiere actualizar `$allowedOrigins`.
- **Entrada:** `$table`, `$id`, `$start`, `$end` (lineas ~26-29); filtros extra (`client_id`, `treatment_id`, `tratamiento_id`) ad-hoc desde `$_GET`. El body POST/PUT se lee con `json_decode(file_get_contents("php://input"))`, **excepto** `table=images` (POST multipart `$_POST`+`$_FILES`) y `table=facturas` (POST lee `$_POST`: `nombre_paciente`, `html`).
- **Metodos:** POST (crear), GET (leer), PUT (actualizar, requiere `?id`), DELETE (borrar, requiere `?id`), OPTIONS (204 preflight), default (405).
- **PUT dinamico:** construye el `UPDATE` solo con las columnas presentes en el body; los casos sencillos comparten un bloque comun al final que responde `{"success", "rows_affected"}`.
- **Transacciones** (`begin_transaction`/`commit`/`rollback`): `payments` (crear/editar/borrar recalcula el tratamiento) y `treatments` DELETE (cascada manual: pieces, payments, imagenes BD + ficheros + carpeta).
- **Estado del tratamiento** (derivado de la deuda, logica DUPLICADA en POST/PUT/DELETE de payments): `deuda==0 -> 'pagado'`, `monto_pagado==0 -> 'pendiente'`, si no `'parcial'`.
- **Ficheros de paciente:** `uploads/pacientes/<client_id>/<treatment_id>/`; ids sanitizados con `preg_replace('/[^a-zA-Z0-9_\-.]/','',...)`.

**Generacion de PDF de facturas** (POST `table=facturas`, ~lineas 425-484): prefijo de numero leyendo `users.username` de `id=1` (`mstlsHS`->`M`, `alcrcnHS`->`A`, si no `GEN`); `numero_factura = MAX+1`. Crea `uploads/facturas/factura_HSD-<inicial>-<numero>.pdf`. Dompdf con `isRemoteEnabled=true`, A4 portrait. **Inyeccion del logo en base64** (lineas ~456-466): lee `assets/images/logoCompleto.jpg` de disco, lo codifica como `data:image/jpeg;base64,...` y con `preg_replace_callback` sustituye cualquier `src="...logoCompleto.jpg"` del HTML. Asi dompdf (que renderiza en servidor sin base href ni red) no depende del host. Registra en `facturas` y responde `{"success":true,"numero","ruta"}`.

**Formas de respuesta JSON (NO hay envoltura unica):**
- Listados GET -> array plano.
- GET por id -> objeto (o `(object)[]` vacio).
- `visits` -> **siempre** `{"data": ...}`.
- `facturas` GET -> `{"success":true,"facturas":[...],"ultimoNumero":n}`.
- Creaciones POST -> `{"success":true,"id":...}`.
- PUT/DELETE -> `{"success":true,"rows_affected":n}`.
- Errores -> HTTP 4xx/5xx + `{"error":"..."}`.

### Frontend JS (`app/js/**`)

- Cada HTML carga `<script src="/js/main.js" type="module">` + un script de pagina `type=module`. Rutas absolutas `/js/...` funcionan porque el docroot es `/app`.
- **`main.js`**: solo cablea el sidebar (open/close + tabIndex).
- **`modules/classes/DB_API.js`**: clase `DB` singleton (`export default new DB()`). `baseUrl='/api/DB.php'`, todas las llamadas con `credentials:'include'`. CRUD generico: `getRecords`, `getRecord`, `addRegister` (POST JSON), `editRecord` (PUT JSON), `deleteRecord`. Helpers: `getRecordsP` (anade `&treatment_id` para payments, `&tratamiento_id` para images), `getMonthlyAppointments`, `getTreatmentsByClientId`, `getPiecesByTreatmentId`, `getPaymentsByTreatmentId`, `getVisitsByClientId`, `createPiece`, `uploadFile` (multipart), `updateState`/`updateMedico`. `_normalizeDateRecord` convierte `'YYYY-MM-DD HH:MM:SS'` -> `'YYYY-MM-DDTHH:MM'` (datetime-local). **Casi toda la red pasa por esta clase** (excepciones: `facturas.js`/`facturasPanel.js` hacen fetch directo).
- **`modules/classes/UI.js`**: singleton, manipulacion del DOM (stats, formularios, modales, render del calendario mensual).
- **`modules/funciones.js`**: orquestador. Validacion (`validateForm`/`sendForm`, config en `variables.js`: `required`, `phone` regex `/^\d{7,12}$/`), `checkFormAction` (create/edit segun `dataset.action` y `?id`), `getFormData`, carga de tablas, `setTableEventsListeners` (delegacion por clases CSS de botones), helpers de fecha, comprobante de pago.
- **`modules/selectores.js`**: `querySelector` ejecutados **al importar**; en paginas sin ese elemento la export es `null`.
- **Componentes** (`modules/components/`): `Datatables.js` (`createTableInstance`, **infiere el objectStore por nombre de archivo HTML** — renombrar el HTML rompe la tabla), `Calendar.js` (calendario mensual propio, NO FullCalendar), `Modal.js` (`<dialog>` nativos + clase `closing`), `Sidebar.js`, `Spinner.js`, `Stats.js`, `Alert.js` (wrapper Swal), `Toast.js` (Notyf), `facturas.js`, `facturasPanel.js`, `presupuestos.js`.
- **Librerias de terceros como GLOBALES** (no import): `Swal`, `$`/`DataTable`, `FullCalendar`, `Notyf`. El codigo asume que ya estan cargadas por `<script>`/CDN.
- **Odontograma:** numeracion FDI; `piece_status` 1 = afectado/pendiente (rojo), 0 = completado (verde); `tooth_number='General'` aplica a todas las piezas. En el detalle (`tratamientos.html`/`tratamientos.js`) los dientes del tratamiento son clicables para alternar pendiente<->completada (llama a `PUT pieces` con `piece_status`).
- **Editar tratamiento:** el modal de `historia-clinica.html` sirve para crear Y editar (boton lapiz `table__btn--edit-treatment` en la fila). En edicion (`historia-clinica.js`, funcion `openEditTreatment`/`guardarEdicionTratamiento`): se editan tipo, observaciones, precio y piezas; el **abonado NO se edita** (solo lectura, se gestiona desde pagos) y la `deuda`/`estado` se recalculan sobre el abonado existente. Las piezas se reconcilian por diff (`reconcilePiezas`), conservando el estado de las que se mantienen; borra piezas via `DELETE table=pieces&id=` (endpoint anadido, borrado individual).

### Modelo de datos (MySQL, 11 tablas, InnoDB / utf8mb4_general_ci)

PK siempre `id` int AUTO_INCREMENT. Importes en `decimal(10,2)`. Volcado de referencia: `db5017933701_hosting-data_io.sql` (dump phpMyAdmin idempotente: `USE dbs15816600`, `FOREIGN_KEY_CHECKS=0`, `DROP TABLE IF EXISTS`).

Nucleo relacional: **`clients` (1) -> `treatments` (N) -> `payments`/`pieces`/`images`/`visits`**.

| Tabla | Notas clave |
|---|---|
| `appointments` | `cliente` (texto libre, **NO** FK), `estado` (Pendiente/Completada/Cancelada), `fecha` datetime, `medico` (med1/med2), `servicio`. **Sin FKs.** |
| `clients` | `nombre`, `email`, `telefono`, `Deuda` **varchar(10)** default `'No'` (flag textual, NO importe), `Alta`, `alergias`, `edad`. |
| `contactos` | Web publica. `clinic` **varchar** (unica tabla con noción de clinica embebida), `created_at`. Sin FKs. |
| `facturas` | `numero_factura` int UNIQUE correlativo por BD, `nombre_paciente`, `fecha`, `ruta` (al PDF). Sin FKs. |
| `images` | `tratamiento_id` (en **espanol**), `ruta`, `tipo` enum(imagen,pdf), `fecha_subida`, `nombre_original`. FK -> treatments CASCADE. |
| `payments` | `client_id`, `treatment_id`, `monto`, `fecha_pago`, `metodo_pago`, `notas`. FKs -> clients y treatments, **CASCADE**. |
| `pieces` | `treatment_id`, `tooth_number` varchar, `piece_status` tinyint. FK -> treatments CASCADE. |
| `services` | `descripcion`, `nombre`, `precio`. Catalogo (casi vacio en el dump). |
| `treatments` | `client_id`, `diagnostico`, `observaciones`, `monto_total`, `monto_pagado`, `deuda`, `estado` enum(pendiente,pagado,parcial), fechas. FK -> clients CASCADE. |
| `users` | `username` UNIQUE, `password` (SHA-256 hex, 64 chars), `role`. **Por BD/clinica** (sin tabla compartida). |
| `visits` | `client_id`, `treatment_id`, `fecha`, `doctor`, `pago_de_visita`, `observaciones`. FKs -> clients y treatments **SIN cascade**. |

**FKs con CASCADE:** treatments->clients, payments->clients, payments->treatments, pieces->treatments, images->treatments.
**FKs SIN cascade:** visits->clients, visits->treatments.

**Columnas de fecha por tabla (cuidado al ordenar/filtrar):** appointments `fecha`, payments `fecha_pago`, images `fecha_subida`, visits `fecha`.

---

## 5. La web publica (`web/`)

Landing estatica de una pagina (`web/index.html` + `web/styles.css` + `web/script.js`), sin framework ni build. Unica parte dinamica: el **formulario de contacto**.

**Flujo del formulario:**
1. `#contact-form` en `index.html` (campos `name`, `email`, `clinic` select `mostoles|alcorcon`, `phone`, `service`, `message`, checkbox `#privacy`).
2. `script.js` `initContactForm()`: valida en cliente y hace `fetch('/api/contacto.php', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(...)})` — **URL relativa, mismo-origen**. Considera exito si `result.success` O `result.guardado_bd`. Los errores solo se loguean en consola.
3. `web/api/contacto.php`: CORS abierto (`Access-Control-Allow-Origin: *`), valida JSON, `INSERT` preparado en `contactos`, y envia 2 emails (admin `hsdental00@gmail.com` + confirmacion al usuario) con `sendEmail()` via **PHPMailer/SMTP IONOS** (`smtp.ionos.es:587`, STARTTLS, `From: avisos@hsdental.es`). Responde `{success:true}` o `{success:false, guardado_bd:true, email_errors:{...}}`.
4. `web/api/db_connect_public.php`: `getConnectionByClinic($clinic)` con credenciales **HARDCODEADAS** por clinica (mostoles=`dbs14654471`, alcorcon=`dbs14273934`). Normaliza el nombre (minusculas + sin tildes), fija utf8mb4. **NO usa `config.secret.php` ni `currentEnv()`** — asimetria importante con `app/`.

`web/cookie-banner.js` existe pero **NO esta enlazado en ningun HTML**: no se ejecuta. Los iframes de Google Maps cargan con `src` directo, asi que el consentimiento nunca se aplica (codigo muerto). Paginas legales en `web/pages/` (politica-cookies, politica-privacidad, aviso-legal, terminos-uso).

---

## 6. Despliegue

### SFTP (`.vscode/sftp.json`, extension vscode-sftp)

- Host `access-5017879741.webspace-host.com`, sftp, puerto 22, usuario `a1405365`. **Contrasena en claro** en el archivo (gitignored, pero existe en disco).
- `defaultProfile: 'pre'`.
- Perfil **`pre`**: `remotePath '/pre'`, **`uploadOnSave: true`** (cada guardado sube a preproduccion).
- Perfil **`produccion`**: `remotePath '/'`, `uploadOnSave: false` (subida manual y deliberada).
- `ignore`: `.vscode`, `.git`, `app/uploads`, `appWeb.zip`, `*.log`.

### Ramas git y flujo

- `master` = produccion. `developer` = cambios en curso (rama actual).
- Flujo: trabajar en **`developer`** -> con perfil SFTP `pre` (auto) sube a `pre.hsdental.es` -> validar en PRE -> merge `developer` a `master` -> con perfil `produccion` subir manualmente (`/`) a produccion.

`.gitignore` excluye: `.vscode/sftp.json`, `config.secret.php`, `app/uploads`, `*.log`, `*.sql`, `appWeb.zip`.

---

## 7. Convenciones importantes

- **RESPETAR LA ARMONIA VISUAL Y NO ROMPER LO CONECTADO.** Antes de tocar estilos o UI, haz el cambio MINIMO que pide el usuario y nada mas: si piden cambiar un color, cambia ese color, no rediseñes ni recolorees sistemas enteros. Manten la paleta, tipografia y espaciado ya existentes (armonia). Los colores/clases suelen estar CONECTADOS a la logica: p.ej. las citas del calendario se pintan por ESTADO (`appointment__pendiente/completada/cancelada` desde `UI.js`), no por otra cosa; cambiarlas rompe ese vinculo. Revisa siempre qué JS/CSS depende de una clase o color antes de modificarlo, y no toques comportamientos que el usuario no pidió cambiar.
- **Identidad de clinica = `$_SESSION['clinic_id']`** (1=Alcorcon, 2=Mostoles) en `app/`. Nunca en URL/query. En `web/` la clinica la decide el campo `clinic` del formulario.
- **URLs SIEMPRE relativas / absolutas-de-raiz (mismo-origen)** en el JS, para funcionar igual en local/pre/prod sin cambios.
- **Prioriza REUTILIZAR y CLEAN CODE (DRY):** antes de escribir algo nuevo, comprueba si ya existe un componente/funcion que lo haga y reutilizalo; no dupliques datos ni logica. Ejemplo canonico: los datos y la deteccion de clinica viven en UN solo sitio, `app/js/modules/components/clinica.js` (`window.Clinica`) — usalo (`Clinica.actual()` para la clinica de la sesion, `Clinica.DATOS` para los datos fiscales), no reimplementes datos de clinica en cada pantalla. Nombres claros, sin codigo muerto, sin hardcode repetido.
- **Logo del PDF de factura: data URI base64** inyectado por `DB.php`, porque dompdf renderiza en servidor sin base href. No relativizar ni convertir a URL.
- **Auth por sesion PHP (cookie)**; login con usuario fijo por clinica y password SHA-256 (comparado con `trim()`).
- **Secretos de `app/` SIEMPRE via `config.secret.php`** en la raiz (incluido con `require __DIR__.'/../../config.secret.php'`). Nunca hardcodear en archivos versionados.
- **Modulos ES nativos sin bundler.** Clases `DB` y `UI` se usan como singletons importados (no se instancian).
- Idioma espanol en UI/mensajes/codigo nuevo.
- **Escapar SIEMPRE datos de la BD antes de meterlos en `innerHTML`.** Usa `escapeHtml()` de `app/js/modules/html.js` (unica fuente de verdad; no dupliques esta funcion en otro archivo). Si vas a interpolar un campo que viene de `DB.getRecord*`/`DB.getRecords*` en un template `` `<div>${...}</div>` `` asignado a `innerHTML`, pasalo por `escapeHtml()`. `textContent`/`el.title` no lo necesitan (no interpretan HTML).
- **Al pintar los datos relacionados de UNA entidad (tratamientos de un paciente, pagos de un tratamiento, etc.), usa el endpoint filtrado por id, no traigas la tabla completa y filtres en el cliente.** Ya existen `DB.getTreatmentsByClientId`, `DB.getPiecesByTreatmentId`, `DB.getPaymentsByTreatmentId`, `DB.getVisitsByClientId` en `DB_API.js`, y `showTreatmentsByClientId()` en `funciones.js` (mismo patron que `showRecords`/`showRecordsP`). `showRecords(objectStore)` sin id trae TODA la tabla de la clinica — solo usarlo para vistas de control/listado, nunca para la ficha de una sola entidad.
- **Respuestas de `app/api/DB.php` van con `Cache-Control: no-store, private`** (ya seteado globalmente al inicio del script) porque casi todas llevan datos de pacientes. No la quites ni la sobrescribas en un endpoint nuevo.
- **Migraciones SQL en `db/migrations/`** (numeradas, `NNN_descripcion.sql`, ver `db/migrations/README.md`). Se aplican a mano (no hay runner); documentar en el README de esa carpeta si ya se aplico en pre/prod. Es la unica excepcion a la regla `*.sql` del `.gitignore`.
- **Flowbite + Tailwind CSS (CDN) disponibles en `app/index.html`** (Tailwind `cdn.tailwindcss.com` + Flowbite CSS/JS `jsdelivr`, v2.5.2). Si el usuario pide un componente UI nuevo que Flowbite ya resuelve (modal, dropdown, accordion, tabs, carousel, tooltip, toast, badge, navbar, etc.) o pide explicitamente usar Tailwind/Flowbite, **usalo automaticamente sin preguntar**: copia el patron HTML de Flowbite (atributos `data-modal-toggle`, `data-dropdown-toggle`, etc. activan el JS solo) y anadelo a la pagina, replicando los `<link>`/`<script>` de `app/index.html` si la pagina destino aun no los tiene. Ver [FLOWBITE_INSTALLATION.md](FLOWBITE_INSTALLATION.md) para ejemplos. **No reescribas componentes existentes que ya funcionan** (SweetAlert2, DataTables, FullCalendar, Modal.js `<dialog>`) solo por migrarlos a Flowbite salvo que el usuario lo pida explicitamente — es aditivo, no un reemplazo forzado.

---

## 8. Gotchas y cosas a NO hacer

> Limpieza realizada 2026-07-12 (rama `developer`): se resolvieron varios de los
> gotchas que antes vivian aqui (ver historial de commits de esa fecha). Lo que
> sigue es el estado ACTUAL, no un historial — si algo te suena resuelto,
> confirmalo leyendo el codigo antes de asumir que el gotcha sigue vigente.

**Funcionamiento / bugs latentes (verificar antes de tocar):**
- **`deleteDir()` ya esta definida** en `DB.php` (~linea 33), con validacion de que la ruta quede DENTRO de `uploads/pacientes` (lanza excepcion si se sale). Se usa al borrar `clients` y `treatments`.
- **Borrado en cascada PARCIAL:** `visits` NO tiene `ON DELETE CASCADE`. Borrar un `client` o `treatment` con `visits` asociadas **FALLA por restriccion de FK**. Hay que borrar las visits primero.
- **Inconsistencias de nombres campo cliente<->servidor:** en citas la columna "Paciente" guarda `app.servicio` y "Observaciones" guarda `app.cliente`; en pagos se envia `monto_pagado` en unos sitios y `amount`/`monto` en otros. Revisar siempre que espera `DB.php`.
- **Fall-through del switch POST->GET en `DB.php`:** los cases POST terminan con `break 2`/`exit`. Si anades un case POST y olvidas el `break 2`/`exit`, el flujo cae al bloque GET. Patron fragil.
- **Numeracion de facturas depende de `users.id=1`** con username `mstlsHS`/`alcrcnHS`. Renombrar/borrar ese usuario rompe el prefijo y el login de esa clinica. Ademas, `numero_factura = MAX()+1` se calcula **sin transaccion ni lock** (`DB.php` ~linea 470): dos facturas casi simultaneas pueden pedir el mismo numero. El `UNIQUE KEY` de la tabla evita duplicarlo en BD, pero el segundo request falla sin reintento automatico — pendiente de blindar con `begin_transaction()`+`SELECT ... FOR UPDATE` o reintento.
- `appointments.fecha` admite `'0000-00-00 00:00:00'` en datos reales; cuidado al castear.
- `db_connect.php` tiene `session_start()` comentado: asume que el script que lo incluye ya hizo `session_start()`. Un endpoint nuevo que use `getConnection()` sin sesion fallara el chequeo de `clinic_id`.
- **Escritura de piezas del odontograma es N peticiones secuenciales**: crear/editar un tratamiento hace un `await DB.addRegister("pieces", ...)`/`DELETE` por cada diente marcado, uno detras de otro (`historia-clinica.js`, `reconcilePiezas`). No hay endpoint batch. Funciona pero es lento con muchos dientes; si se toca, valorar `Promise.all` o un endpoint batch en `DB.php`.
- **`clients` sigue sin indices propios** (solo PK) — no urgente mientras el volumen de pacientes sea bajo. `appointments.fecha` **ya tiene indice** (`db/migrations/001_index_appointments_fecha.sql`, aplicado en pre y en ambas BD de produccion el 2026-07-12).

**NO hacer:**
- **NO romper la generacion de PDFs** ni **NO relativizar/cambiar el logo base64** de `DB.php` (perderia independencia del host; el PDF se renderiza server-side sin red). Nota: el logo en `facturas.js` (cliente) SI esta hardcodeado a `https://app.hsdental.es/...` — eso rompe mismo-origen y no carga en pre/local, pero el PDF real lo genera el servidor con el base64, asi que funciona igual.
- **NO versionar `config.secret.php`** ni dejarlo dentro de un docroot (`/app`, `/web`) — quedaria web-accesible y el `require '../../config.secret.php'` apuntaria mal.
- **NO versionar ni subir al webspace ningun `.sql`** salvo lo que vive en `db/migrations/` (dump de referencia con datos de pacientes ignorado por la regla `*.sql`).
- Al reimportar el dump: **cambiar/quitar el `USE \`dbs15816600\`\`** (es la BD de PRE) para no escribir en la BD equivocada.

**Seguridad / deuda tecnica pendiente:**
- **Rotar la contrasena compartida** (SFTP, BD de ambas clinicas, SMTP — la misma en los 3 sitios). Sigue reutilizada en todo el proyecto Y quedo expuesta en texto plano en el historial de git (en los scripts de test que se borraron el 2026-07-12) — borrar el archivo no borra el historial. Esto requiere accion del usuario en IONOS/el panel SMTP, no es algo que se resuelva solo con un cambio de codigo. **No escribir la contrasena real en ningun archivo versionado, ni siquiera para documentar que hay que rotarla.**
- Sin rate limiting en `login.php`: usuario predecible por clinica + SHA-256 sin sal = fuerza bruta viable. Pendiente.
- CORS abierto (`*`) en `contacto.php`, sin CSRF ni rate limiting -> spam de formulario/correos. Pendiente (mitigacion sugerida: Cloudflare u otro WAF delante de `hsdental.es`).
- Subida de `images` en `DB.php` sin whitelist de extension ni validacion MIME real (la extension sale de `pathinfo()` del nombre original). Si `uploads/pacientes` no tiene un `.htaccess` que desactive ejecucion PHP, es RCE potencial para un usuario ya logueado. Verificar ese `.htaccess` en el servidor real.
- Sin verificacion de que `client_id`/`treatment_id` del body pertenezcan entre si antes de leer/escribir en `DB.php` (IDOR entre pacientes de la misma clinica). Pendiente.
- Sesion PHP sin flags `HttpOnly`/`Secure`/`SameSite` explicitos. Pendiente.
- `web/api/db_connect_public.php` y `contacto.php` ya leen de `config.secret.php` (migrado 2026-07-12), pero **siguen sin ser `currentEnv()`-aware**: usan siempre el bloque `prod` sin importar el host. Cambiarlo a environment-aware requiere antes confirmar que la BD de PRE (solo Alcorcon) tiene la tabla `contactos`, si no el formulario publico en `pre.hsdental.es` empezaria a fallar para esa clinica.
- Passwords de usuarios SHA-256 sin sal ni bcrypt (esquema actual debil).
- `error_log`/`console.log` de depuracion repartidos por `DB.php` y el JS — pueden volcar datos de pacientes a logs. No romper, conviene limpiar.

**Infra a tener en cuenta:**
- **`.vscode/sftp.json` tiene su PROPIO `ignore`, independiente de `.gitignore`.** No asumas que lo que esta en `.gitignore` no se sube por SFTP — son dos mecanismos distintos. Ya se corrigio (2026-07-12) para excluir `**/*.sql` y `config.secret.php` (antes un "Sync Local -> Remote" desde la raiz podia subir el dump completo de pacientes o pisar el `config.secret.php` real del servidor). Si añades otro archivo sensible o pesado a la raiz del repo, revisa tambien este `ignore`, no solo el de git.
- **El subdominio `www` puede no tener SSL** configurado igual que el apex; verificar el certificado antes de asumir HTTPS en `www.hsdental.es`.
- **PRE solo tiene Alcorcon**: si una sesion llega con `clinic_id=2` en pre, `getConnection()` muere con error controlado. El bloque correspondiente debe existir en `config.secret.php`.
- Un cambio de dominio/subdominio requiere actualizar `$allowedOrigins` en `DB.php` o las peticiones con credenciales fallaran.
- Los enlaces del sidebar de `index.html` y `baseUrl` de la API son absolutos-de-raiz (`/...`): dependen de que la app este en el docroot raiz del subdominio.
