/**
 * clinica.js  —  COMPONENTE UNICO de clinica (fuente de verdad reutilizable).
 *
 * Objetivo (ver REGLA DE ORO del CLAUDE.md): NO duplicar los datos de clinica ni la
 * deteccion. Cualquier pantalla que necesite "en que clinica estoy" o los datos
 * fiscales/de contacto de la clinica DEBE usar esto, no reimplementarlo.
 *
 * Se carga como script CLASICO (los consumidores facturas.js/presupuestos.js lo son,
 * por sus onclick inline) y expone un global `window.Clinica`.
 *
 * La clinica se detecta SIEMPRE desde la SESION (server-side) via /api/DB.php?table=clinica,
 * asi funciona igual en pre y en produccion (mismo-origen), sin depender de window.CLINIC.
 */
window.Clinica = (function () {
  // Datos por clinica. Clave = 'alcorcon' | 'mostoles' (coincide con lo que devuelve el server).
  const DATOS = {
    alcorcon: {
      key: "alcorcon",
      clinicId: 1,
      inicial: "A",
      nombre: "HS Dental - Alcorcón",
      nif: "B21866850",
      direccion: "Calle Mayor 65, 1ºB — 28921 Madrid",
      telefono: "916 43 12 12 / 641 26 59 85",
      ciudad: "Alcorcón",
      email: "hsdental00@gmail.com"
    },
    mostoles: {
      key: "mostoles",
      clinicId: 2,
      inicial: "M",
      nombre: "HS Dental - Móstoles",
      nif: "B21866850",
      direccion: "C/ Pintor el Greco 2, Bajo D — 28933 Madrid",
      telefono: "916 18 24 24 / 678 48 45 39",
      ciudad: "Móstoles",
      email: "hsdental00@gmail.com"
    }
  };

  /**
   * Devuelve los datos de la clinica de la SESION actual (o null si no se puede detectar).
   * @returns {Promise<object|null>}
   */
  async function actual() {
    try {
      const res = await fetch("/api/DB.php?table=clinica", { credentials: "include" });
      const data = await res.json();
      return DATOS[data.clinic] || null;
    } catch (e) {
      console.error("Clinica.actual(): no se pudo detectar la clinica de la sesion:", e);
      return null;
    }
  }

  return { DATOS, actual };
})();
