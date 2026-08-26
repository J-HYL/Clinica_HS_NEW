// portal/js/api.js
// Cliente de la API del portal. Mismo origen (pacientes.hsdental.es), asi que la
// cookie de sesion viaja sola y no hay CORS. Rutas absolutas de raiz (/api/...),
// que funcionan igual en local, pre y prod (el docroot del subdominio es /portal).

const BASE = "/api";

async function req(method, path, body) {
  const opts = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch (e) {
    throw new Error("Sin conexión. Revisa tu internet e inténtalo de nuevo.");
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* respuesta no-JSON */ }
  if (res.status === 401) {
    // Sesion caducada: avisa al shell (que redirige al login) y ademas lanza.
    try { window.dispatchEvent(new CustomEvent("portal:unauth")); } catch (e) { /* no-DOM */ }
    const err = new Error(data.error || "Sesión no válida.");
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data.error || `Error (${res.status}).`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  sesion:          ()               => req("GET",  "/auth.php?accion=sesion"),
  login:           (email, password)=> req("POST", "/auth.php?accion=login", { email, password }),
  logout:          ()               => req("POST", "/auth.php?accion=logout", {}),
  activar:         (token, password)=> req("POST", "/auth.php?accion=activar", { token, password }),
  solicitarReset:  (email)          => req("POST", "/auth.php?accion=solicitar-reset", { email }),
  reset:           (token, password)=> req("POST", "/auth.php?accion=reset", { token, password }),

  inicio:          ()               => req("GET",  "/datos.php?recurso=inicio"),
  tratamientos:    ()               => req("GET",  "/datos.php?recurso=tratamientos"),
  citas:           ()               => req("GET",  "/datos.php?recurso=citas"),
  perfil:          ()               => req("GET",  "/datos.php?recurso=perfil"),
  guardarPerfil:   (data)           => req("PUT",  "/datos.php?recurso=perfil", data),

  // Fase 2: pedir cita + notificaciones
  huecos:          (fecha)          => req("GET",  "/solicitudes.php?accion=huecos&fecha=" + encodeURIComponent(fecha)),
  crearSolicitud:  (data)           => req("POST", "/solicitudes.php?accion=crear", data),
  notificaciones:  ()               => req("GET",  "/solicitudes.php?accion=notificaciones"),
  marcarLeidas:    ()               => req("POST", "/solicitudes.php?accion=marcar-leidas", {}),
  responderContraoferta: (id, acepta) => req("POST", "/solicitudes.php?accion=responder-contraoferta", { solicitud_id: id, acepta }),

  // Facturas: el paciente pide la factura de un pago concreto.
  solicitarFactura: (payment_id)    => req("POST", "/facturas.php?accion=solicitar", { payment_id }),
  // URL de descarga del PDF (para window.open; el servidor la valida por sesion).
  facturaUrl:       (payment_id)    => `${BASE}/facturas.php?accion=descargar&payment_id=${encodeURIComponent(payment_id)}`,
};
