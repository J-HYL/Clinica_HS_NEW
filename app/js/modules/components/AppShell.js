// AppShell.js — Marco COMUN del panel: menu lateral + barra superior.
//
// Es la UNICA fuente del marco y la comparten las dos clinicas: la sede no
// cambia la interfaz, solo el nombre que se enseña, que sale de la SESION via
// Clinica.actual() (nunca de la URL). Cada pagina trae un <nav id="sidebar">
// vacio y un .wrapper con su <h1 class="page-title">; este componente rellena
// el menu, marca la seccion activa segun la URL y pone la barra superior al
// principio de .wrapper. Se autoinicializa al importarse (desde main.js).
//
// Exporta:
//   openSidebar / closeSidebar  abrir y cerrar el menu en movil
//   marcarContador(clave, n)    numero junto a una seccion (0 lo oculta)
//   obtenerSede()               promesa con los datos de la sede de la sesion
//                               (una sola peticion compartida por toda la pagina)

import "./clinica.js"; // define window.Clinica (datos de sede, fuente unica)

// Fuente UNICA de las secciones. Cambiar aqui = cambiar en todas las paginas.
const GRUPOS = [
  {
    titulo: "Gestión clínica",
    items: [
      { clave: "resumen",      href: "/index.html",                          icon: "ri-dashboard-line",       label: "Resumen",      match: ["/index.html"] },
      { clave: "citas",        href: "/pages/citas/control.html",            icon: "ri-calendar-line",        label: "Citas",        match: ["/pages/citas/"] },
      { clave: "pacientes",    href: "/pages/clientes/control.html",         icon: "ri-group-line",           label: "Pacientes",    match: ["/pages/clientes/"] },
      { clave: "visitas",      href: "/pages/visitas/control.html",          icon: "ri-calendar-check-line",  label: "Visitas",      match: ["/pages/visitas/"] },
      // soloEscritorio: el visor TAC no funciona en movil/tablet (memoria y raton); shell.css lo oculta alli.
      { clave: "tac",          href: "/pages/tac/control.html",              icon: "ri-body-scan-line",       label: "TAC",          match: ["/pages/tac/"], soloEscritorio: true },
    ],
  },
  {
    titulo: "Facturación",
    items: [
      { clave: "presupuestos", href: "/pages/Presupuestos/presupuesto.html", icon: "ri-file-list-3-line",     label: "Presupuestos", match: ["/pages/presupuestos/"] },
      { clave: "facturas",     href: "/pages/facturas/facturas.html",        icon: "ri-receipt-line",         label: "Facturas",     match: ["/pages/facturas/"] },
    ],
  },
  {
    titulo: "Clínica",
    items: [
      { clave: "inventario",   href: "/pages/inventario/control.html",       icon: "ri-archive-drawer-line",  label: "Inventario",   match: ["/pages/inventario/"] },
      { clave: "admin",        href: "/pages/admin/login_facturas.php",      icon: "ri-shield-user-line",     label: "Admin",        match: ["/pages/admin/"] },
    ],
  },
];

const LOGO = "/assets/images/logoCompleto.svg";

let sedePromesa = null;

/** Datos de la sede de la sesion ({ ciudad, direccion, ... }) o null. */
export function obtenerSede() {
  if (!sedePromesa) sedePromesa = window.Clinica.actual();
  return sedePromesa;
}

/** Clave de la seccion activa segun la URL (null si la pagina no esta en el menu, p. ej. Servicios). */
function claveActiva() {
  const ruta = location.pathname.toLowerCase();
  for (const grupo of GRUPOS) {
    for (const item of grupo.items) {
      for (const prefijo of item.match) {
        const m = prefijo.toLowerCase();
        if (m === "/index.html") {
          if (ruta === "/" || ruta.endsWith("/index.html")) return item.clave;
        } else if (ruta.includes(m)) {
          return item.clave;
        }
      }
    }
  }
  return null;
}

function itemHtml(item, activa) {
  const actual = item.clave === activa ? ' aria-current="page"' : "";
  return `
    <li${item.soloEscritorio ? ' class="sidebar__item--escritorio"' : ""}>
      <a class="sidebar__enlace" href="${item.href}"${actual}>
        <i class="${item.icon}" aria-hidden="true"></i>
        <span>${item.label}</span>
        <span class="sidebar__contador" data-contador="${item.clave}" hidden></span>
      </a>
    </li>`;
}

function sidebarHtml() {
  const activa = claveActiva();
  const grupos = GRUPOS.map((g) => `
    <div class="sidebar__grupo">
      <p class="sidebar__grupo-titulo">${g.titulo}</p>
      <ul class="sidebar__lista">${g.items.map((it) => itemHtml(it, activa)).join("")}</ul>
    </div>`).join("");

  return `
    <div class="sidebar__cabecera">
      <a class="sidebar__marca" href="/index.html">
        <img class="sidebar__logo" src="${LOGO}" alt="HS Dental" width="75" height="36">
        <span class="sidebar__sede" data-shell="sede-marca"></span>
      </a>
      <button type="button" class="sidebar__cerrar boton boton--icono boton--fantasma" aria-label="Cerrar el menú">
        <i class="ri-close-line" aria-hidden="true"></i>
      </button>
    </div>
    <div class="sidebar__nav">${grupos}</div>
    <div class="sidebar__pie" data-shell="pie" hidden>
      <span class="sidebar__pie-icono" aria-hidden="true"><i class="ri-map-pin-2-line"></i></span>
      <div class="sidebar__pie-texto">
        <p class="sidebar__pie-nombre" data-shell="sede-nombre"></p>
        <p class="sidebar__pie-detalle" data-shell="sede-direccion"></p>
      </div>
    </div>`;
}

function topbarHtml() {
  const hoy = new Date();
  const fecha = hoy.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  return `
    <header class="topbar">
      <div class="topbar__inicio">
        <button type="button" class="topbar__menu" aria-label="Abrir el menú" aria-controls="sidebar" aria-expanded="false">
          <i class="ri-menu-line" aria-hidden="true"></i>
        </button>
        <p class="topbar__estado">
          <span class="topbar__punto" aria-hidden="true"></span>
          <span data-shell="sede-barra">HS Dental</span>
          <span class="topbar__separador" aria-hidden="true">·</span>
          <time class="topbar__fecha" datetime="${iso}">${fecha}</time>
        </p>
      </div>
      <div class="topbar__fin">
        <form class="topbar__buscador" role="search" action="/pages/clientes/control.html" method="get">
          <i class="ri-search-line" aria-hidden="true"></i>
          <input type="search" name="search" placeholder="Buscar paciente…" aria-label="Buscar paciente" autocomplete="off">
        </form>
        <div class="topbar__acciones" id="topbar-acciones"></div>
      </div>
    </header>`;
}

// --- Abrir / cerrar (movil). En escritorio el menu esta siempre visible. ---

function partes() {
  return {
    nav: document.getElementById("sidebar"),
    velo: document.querySelector(".shell-velo"),
    boton: document.querySelector(".topbar__menu"),
  };
}

export function openSidebar() {
  const { nav, velo, boton } = partes();
  if (!nav) return;
  nav.classList.add("open");
  velo?.classList.add("visible");
  boton?.setAttribute("aria-expanded", "true");
  nav.querySelector(".sidebar__enlace")?.focus();
}

export function closeSidebar() {
  const { nav, velo, boton } = partes();
  if (!nav || !nav.classList.contains("open")) return;
  nav.classList.remove("open");
  velo?.classList.remove("visible");
  boton?.setAttribute("aria-expanded", "false");
  boton?.focus();
}

/** Numero junto a una seccion del menu (p. ej. citas pendientes de hoy). */
export function marcarContador(clave, n) {
  const el = document.querySelector(`.sidebar__contador[data-contador="${clave}"]`);
  if (!el) return;
  const valor = Number(n) || 0;
  el.textContent = valor > 99 ? "99+" : String(valor);
  el.hidden = valor === 0;
}

async function pintarSede(nav) {
  const sede = await obtenerSede();
  if (!sede) return; // sin sesion: el marco se queda con "HS Dental"
  const direccion = (sede.direccion || "").split("—")[0].trim();
  const poner = (raiz, nombre, texto) => {
    const el = raiz.querySelector(`[data-shell="${nombre}"]`);
    if (el) el.textContent = texto;
  };
  poner(nav, "sede-marca", `Clínica de ${sede.ciudad}`);
  poner(nav, "sede-nombre", `Sede ${sede.ciudad}`);
  poner(nav, "sede-direccion", direccion);
  nav.querySelector('[data-shell="pie"]')?.removeAttribute("hidden");
  poner(document, "sede-barra", `HS Dental ${sede.ciudad}`);
}

function montarBarra() {
  const wrapper = document.querySelector("body > .wrapper");
  if (!wrapper || wrapper.querySelector(":scope > .topbar")) return;
  wrapper.insertAdjacentHTML("afterbegin", topbarHtml());
}

function init() {
  let nav = document.getElementById("sidebar");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "sidebar";
    document.body.prepend(nav);
  }
  nav.classList.add("sidebar");
  nav.setAttribute("aria-label", "Menú principal");
  nav.innerHTML = sidebarHtml();

  const velo = document.createElement("div");
  velo.className = "shell-velo";
  document.body.appendChild(velo);

  montarBarra();

  document.querySelector(".topbar__menu")?.addEventListener("click", openSidebar);
  nav.querySelector(".sidebar__cerrar")?.addEventListener("click", closeSidebar);
  velo.addEventListener("click", closeSidebar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });

  pintarSede(nav);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
