# CLAUDE.md — Portal de Pacientes (`portal/`)

Guia de la **tercera app** del proyecto HS Dental: el **Portal de Pacientes**
(`pacientes.hsdental.es`). Hermana de `app/` (panel) y `web/` (landing). Lee
primero el `CLAUDE.md` de la raiz (regla de oro: agnostico del entorno, URLs
mismo-origen, secretos por `config.secret.php`). Aqui se resume SOLO lo propio
del portal.

> **Estado:** Fase 1 IMPLEMENTADA (login + ver tratamientos/pagos/citas + perfil
> + PWA + invitacion desde el panel). Fase 2 (pedir cita) diseñada pero SIN
> implementar — ver §7 "Cables sueltos". Las migraciones 004 y 005 estan
> **pendientes de aplicar** en pre y prod.

---

## 1. Que es y donde vive

Portal de cara al paciente: entra con **email + contraseña** y ve **sus**
tratamientos, pagos, deuda y citas, edita sus datos de contacto, y (Fase 2)
pide cita. Es **una app PHP independiente**, con su propio docroot/subdominio y
su **propia autenticacion** (NO comparte sesion ni codigo de auth con el panel:
es otra frontera de seguridad, de cara al publico).

| Dominio | Docroot | Entorno (`currentEnv()`) |
|---|---|---|
| `pacientes.hsdental.es` | `/portal` | prod |
| `pre-pacientes.hsdental.es` | `/pre/portal` | pre (empieza por `pre-`) |
| `localhost:8082` (vhost local) | `portal/` | local |

**Reutiliza** de la raiz: `config.secret.php` (mismos bloques de BD por clinica),
la deteccion de entorno por host, PHPMailer vendorizado en `app/api/PHPMailer`
(ver §6), y los patrones de front del panel (modulos ES, `escapeHtml`, `<dialog>`
con `margin:auto`). La API del portal esta en su MISMO origen -> **sin CORS**.

---

## 2. Mapa de archivos

```
portal/
  index.html          app shell (tab bar). Gate de sesion via JS -> si no, /login.html
  login.html          acceso (email + password)
  activar.html        el paciente crea su contraseña desde el enlace de invitacion
  reset.html          DOBLE: sin ?token= pide email; con ?token= fija nueva contraseña
  .htaccess           DirectoryIndex + cabeceras de seguridad + Service-Worker-Allowed
  manifest.webmanifest  PWA (iconos, standalone, theme)
  sw.js               service worker (cachea SOLO el shell; NUNCA /api)
  assets/             icon.svg + icon-180/192/512.png (monograma "HS")
  css/portal.css      sistema de diseño iOS (mobile-first, tarjetas, tab bar, sheets)
  js/
    api.js            cliente fetch (mismo origen, credentials same-origin)
    util.js           escapeHtml, formato es-ES (dinero/fechas), toast, iniciales
    icons.js          iconos SVG inline (sin CDN)
    install.js        instalacion PWA (Android beforeinstallprompt / guia iOS)
    auth-pages.js     logica de login/activar/reset (segun <body data-auth>)
    app.js            orquestador del shell (gate de sesion, tabs, carga de vistas)
    views/
      inicio.js       resumen: proxima cita + deuda + accesos
      tratamientos.js tarjetas con progreso de pago (sin DataTables)
      citas.js        timeline (proximas / historial)
      perfil.js       datos + hoja de edicion (telefono/edad/alergias) + logout + instalar
  api/
    db_connect.php    currentEnv + getConnection (sesion) + getConnectionByClinic (login) + portalBaseUrl
    session.php       arranque de sesion endurecida (cookie propia PORTALSESSID)
    helpers.php       cabeceras, JSON, body, require_login, tokens, portal_buscar
    mailer.php        envio de email (reusa PHPMailer del panel) — reset de contraseña
    auth.php          ?accion=login|logout|sesion|activar|solicitar-reset|reset
    datos.php         ?recurso=inicio|tratamientos|citas|perfil (GET/PUT)
```

Panel (`app/`), añadido para la invitacion:
- `app/api/invitar_portal.php` — crea/actualiza `portal_users` (invitado + token) y manda el email de activacion. Mismo guard/CORS/PHPMailer que `soporte.php`.
- Boton **"Invitar al portal"** por cliente: `app/js/modules/components/Datatables.js` (bloque `objectStore === "clients"`, clase `table__btn--invite`) + handler `invitarPortal()` en `app/js/modules/funciones.js`.

---

## 3. Autenticacion y seguridad (lo NO negociable)

- **Contraseñas** con `password_hash()`/`password_verify()` (bcrypt). **Nunca** el
  SHA-256 sin sal del panel.
- **Cuenta por INVITACION** desde la clinica (no auto-registro). El email de login
  se captura/verifica en la invitacion (no se hereda de `clients.email`, que es
  nullable y trae `'No proporcionado'` en datos reales).
- **Tokens** de invitacion y reset: aleatorios (`random_bytes(32)`), **hasheados
  en reposo** (SHA-256), de un solo uso y **caducables** (invitacion 72 h, reset 1 h).
  El token en claro solo viaja en el email.
- **Sesion** con cookie `HttpOnly` + `Secure` (en prod/pre) + `SameSite=Lax`,
  nombre propio `PORTALSESSID`. `session_regenerate_id(true)` al iniciar sesion.
- **Rate-limit** de login: `intentos_fallidos` + `bloqueado_hasta` (5 intentos ->
  bloqueo 15 min).
- **TODO dato se scopea SERVER-SIDE al `client_id` de la sesion** (`require_login()`
  lo devuelve). NUNCA se acepta un id de paciente del cliente. Es el riesgo #1
  (un paciente viendo datos de otro); el panel arrastra IDOR (ver raiz §8) y el
  portal NO puede repetirlo.
- `Cache-Control: no-store, private` + `nosniff` en toda respuesta de `/api`.
- El SW **jamas cachea `/api`** (PII medica) — solo el shell estatico.
- Se exponen SOLO los campos que el paciente debe ver: de las citas, solo `fecha`
  y `estado` (NO `servicio`/`cliente`/`medico`, que llevan nombre/notas internas);
  de los pagos, sin `notas`.

**Login multi-sede:** como son 2 BD (una por clinica) sin `clinic_id` compartido,
el login busca el email en las BD de todas las sedes del entorno (`portalSedes()`);
la que lo tenga fija `$_SESSION['portal_sede']`. Barato (son 2). El email es UNIQUE
por BD; el caso raro "misma persona en las dos sedes con el mismo email" queda
pendiente de politica (elegir sede / la mas reciente).

---

## 4. Base de datos (migraciones 004 y 005 — PENDIENTES)

Por clinica, mismo esquema en todas (ver `db/migrations/`):

- **`portal_users`** (`004_portal_users.sql`): cuentas de paciente. `client_id`
  (FK UNIQUE -> clients), `sede` enum, `email` UNIQUE (login), `password_hash`
  (null hasta activar), `estado` (invitado/activo/bloqueado), tokens de
  invitacion/reset hasheados + caducidad, rate-limit, `ultimo_acceso`.
- **`appointments.client_id`** (`005_appointments_client_id.sql`): FK nullable ->
  clients. Enlaza cada cita con su paciente (antes NO habia forma fiable: `cliente`
  es texto libre y el nombre va en `servicio`). "Mis citas" = `appointments WHERE
  client_id = <paciente>`. Las citas viejas quedan NULL (no se muestran); las
  nuevas deben rellenarlo.

> **Pendiente de wiring:** el panel debe rellenar `appointments.client_id` al crear
> citas para que "mis citas" se pueble. Hoy el panel crea citas sin ese campo. Es
> parte de la Fase 2 (§7).

---

## 5. Flujo de invitacion / activacion (Fase 1)

1. Personal en el panel -> ficha de clientes -> boton **"Invitar al portal"** (icono
   sobre cada cliente). Requiere que el cliente tenga email valido.
2. `app/api/invitar_portal.php`: valida, comprueba que el email no lo use otro
   paciente (UNIQUE), crea/actualiza `portal_users` (estado `invitado`, token 72 h)
   y envia el email con enlace `pacientes.hsdental.es/activar.html?token=...`.
3. El paciente abre el enlace -> `activar.html` -> elige contraseña -> `auth.php
   ?accion=activar` marca `activo` e inicia sesion. Ya esta dentro.
4. Reset de contraseña: `reset.html` sin token pide email (`solicitar-reset`, siempre
   responde OK, no revela si existe) y manda enlace; con token fija la nueva.

---

## 6. Notas de implementacion / gotchas

- **PHPMailer:** el portal NO vendoriza su propia copia; reusa la del panel via
  `app/api/PHPMailer` (`portal/api/mailer.php`, constante `PHPMAILER_DIR`). Funciona
  porque `app/` y `portal/` son hermanas en el mismo webspace en local/pre/prod. Si
  se mueve PHPMailer, actualizar esa constante.
- **`portalBaseUrl()`** (en `portal/api/db_connect.php`) mapea entorno -> host del
  portal para los enlaces de email. El panel replica ese mapeo en `invitar_portal.php`
  (no puede usar su propio host, que es el del panel).
- **`currentEnv()` ya reconoce los hosts del portal** sin cambios: `pacientes.*`
  -> prod, `pre-pacientes.hsdental.es` -> pre (empieza por `pre-`). Se ajustó
  `currentEnv()` del portal para aceptar el prefijo `pre-` (con guion).
- **Local multisede (recomendado, sin implementar aun):** hoy `db['local']` es una
  sola BD plana y `getConnection()`/`getConnectionByClinic()` del portal ya soportan
  AMBOS formatos (plano y split por sede). Para reflejar de verdad las 2 sedes en
  local: pasar `db['local']` a `['alcorcon'=>..., 'mostoles'=>...]` e importar el
  dump en dos BD (`clinicahs_alcorcon`, `clinicahs_mostoles`), y actualizar
  `setup-local.ps1` para crear un vhost del portal (`localhost:8082`) e importar las
  dos BD. Mientras no se haga, en local ambas sedes resuelven a la unica BD (dev ok).
- **Perfil:** el paciente edita telefono/edad/alergias. El **email NO se edita** en
  Fase 1 (es el login; cambiarlo exige re-verificacion -> Fase 2). El nombre lo
  gestiona la clinica.
- **Iconos PWA:** monograma "HS" sobre el degradado de marca (`icon.svg` + PNG
  180/192/512, generados con GDI+). Si se rehacen, mantener el cuadrado a sangre
  (full-bleed) para que valga como `maskable`. Al cambiar el shell, **subir la
  version de `CACHE` en `sw.js`** o los clientes veran la version vieja.
- **Sin DataTables** (peticion del usuario): tarjetas apiladas y timeline, mismo
  criterio que el Inventario del panel.

---

## 7. Cables sueltos — Fase 2: PEDIR CITA (decidido, SIN implementar)

Decision del usuario (2026-07-21): **modelo hibrido, SIN reserva directa.** El
paciente elige dia/hora en el portal, pero eso NO crea la cita: crea una
**solicitud** que **la clinica acepta desde el panel**; al aceptar se crea la cita
real y se envia un **email de confirmacion** al paciente.

Idea de flujo (a afinar):
1. **Portal** — el paciente elige dia y ve **huecos orientativos** (libres/ocupados),
   NUNCA el detalle de las citas de otros. Al elegir uno, crea una solicitud.
2. **Panel** — apartado nuevo de **"Solicitudes de cita"** (todavia hay que decidir
   como se ve): la clinica ve las solicitudes y **acepta / propone otra / rechaza**.
3. Al **aceptar** -> se crea la cita en `appointments` (rellenando `client_id`) y se
   manda **email de confirmacion** al paciente. Al rechazar/proponer -> aviso tambien.

Piezas a construir (pendientes de decidir en detalle):
- **Tabla `solicitudes_cita`** (migracion nueva): `id`, `client_id` (FK),
  `fecha_preferida`/`franja`/`hora_preferida`, `servicio`, `notas`, `estado`
  (solicitada/confirmada/rechazada/cancelada), `appointment_id` (nullable, la cita
  creada al aceptar), `created_at`. Tabla aparte para no ensuciar `appointments`
  hasta que la clinica confirme.
- **Huecos orientativos:** requiere definir por sede el **horario laboral**, la
  **duracion de cita** y el **nº de gabinetes** (probablemente `med1`/`med2` = 2
  recursos). "Libre" = hueco de la rejilla con menos citas que gabinetes a esa hora.
  El endpoint devuelve SOLO libre/ocupado (booleano), nunca datos de otras citas.
  **Faltan por confirmar con el cliente** esos parametros (horario, duracion, nº de
  gabinetes por sede) antes de implementar.
- **Portal:** endpoint `POST solicitud` + pantalla "Pedir cita" (hoy el boton
  "Pedir cita" solo muestra un toast "muy pronto" en `app.js` -> `ctx.pedirCita`).
- **Panel:** pantalla de solicitudes + accion aceptar/rechazar + envio de email.
  Al crear la cita, **rellenar `appointments.client_id`** (ver §4) para que aparezca
  en "mis citas".
- **Recordatorios** (roadmap raiz #1): con `appointments.client_id` ya se puede
  cruzar cita->email del paciente; encaja con un cron de recordatorios.

Sin disponibilidad en tiempo real fina (agenda por gabinete/solapes reales): eso
seria un proyecto aparte. El modelo es **solicitud -> confirmacion**, no reserva.

---

## 8. Fase 3 (ideas, no empezadas)

Descargar facturas propias (requiere enlazar `facturas` con `client_id`; hoy solo
`nombre_paciente`), consentimientos informados con firma en `<canvas>` (patron de
`app/js/modules/components/FotoCaptura.js`), notificaciones push (Web Push + VAPID;
en iOS solo con la PWA instalada), y cambio de email de acceso con re-verificacion.

---

## 9. Infra / despliegue

- **No hace falta tocar los workflows:** `deploy-pre.yml`/`deploy-prod.yml` suben
  `./*`, asi que `portal/` se despliega solo a `/pre/portal` y `/portal`
  (`delete_remote_files:false`). La carpeta `db/` esta excluida (migraciones a mano).
- **Accion externa (IONOS):** dar de alta el subdominio `pacientes.hsdental.es`
  apuntando a `/portal` y `pre-pacientes.hsdental.es` a `/pre/portal`, ambos con
  **HTTPS** (el portal fija cookies `Secure`).
- **Aplicar migraciones 004 y 005** en pre (Alcorcon) y prod (Alcorcon + Mostoles)
  antes de usar el portal en cada entorno. Ver `db/migrations/README.md`.
- Si en el futuro el portal sube archivos, añadir `portal/uploads` al `.gitignore`
  y su `.htaccess` que desactive PHP (como hace `app/`).
