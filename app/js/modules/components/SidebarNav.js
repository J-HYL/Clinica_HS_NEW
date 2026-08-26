// SidebarNav.js — Sidebar/navbar del panel como COMPONENTE ÚNICO.
//
// Antes el <nav class="sidebar"> estaba duplicado a mano en ~17 páginas. Ahora el
// markup vive SOLO aquí: cada página tiene un <nav id="sidebar"></nav> vacío (o
// ninguno) y este componente lo rellena, marca la sección activa según la URL, y
// cablea abrir/cerrar (móvil) + el plegado en pantallas bajas.
//
// Se autoinicializa al importarse (patrón de Soporte.js / Notificaciones.js) y
// exporta openSidebar/closeSidebar/toggleTabIndex para quien los necesite
// (p. ej. vistaDiaria.js). Consultan #sidebar en tiempo de llamada, no al importar.

// Fuente ÚNICA de las secciones del panel. Cambiar aquí = cambiar en todas las páginas.
const NAV = [
  { href: "/index.html",                        icon: "ri-dashboard-fill",         label: "Principal",    match: ["/index.html"] },
  { href: "/pages/citas/control.html",          icon: "ri-calendar-schedule-fill", label: "Citas",        match: ["/pages/citas/"] },
  { href: "/pages/clientes/control.html",       icon: "ri-group-fill",             label: "Pacientes",    match: ["/pages/clientes/"] },
  { href: "/pages/visitas/control.html",        icon: "ri-calendar-check-fill",    label: "Visitas",      match: ["/pages/visitas/"] },
  { href: "/pages/Presupuestos/presupuesto.html", icon: "ri-file-text-fill",       label: "Presupuestos", match: ["/pages/presupuestos/"] },
  { href: "/pages/facturas/facturas.html",      icon: "ri-receipt-fill",           label: "Facturas",     match: ["/pages/facturas/"] },
  { href: "/pages/inventario/control.html",     icon: "ri-archive-drawer-fill",    label: "Inventario",   match: ["/pages/inventario/"] },
  { href: "/pages/admin/login_facturas.php",    icon: "ri-admin-fill",             label: "Admin",        match: ["/pages/admin/"] },
];

/** Índice de la sección activa según la URL (Principal por defecto). */
function activeIndex() {
  const p = location.pathname.toLowerCase();
  for (let i = 0; i < NAV.length; i++) {
    for (const pref of NAV[i].match) {
      const m = pref.toLowerCase();
      if (m === "/index.html") { if (p === "/" || p.endsWith("/index.html")) return i; }
      else if (p.includes(m)) return i;
    }
  }
  return 0;
}

function itemHtml(item, activo) {
  return `
    <li class="sidebar__item ${activo ? "sidebar__item--selected" : ""}">
      <a href="${item.href}" aria-label="Ir a ${item.label}">
        <i class="${item.icon}"></i>
        <div class="item__hide">
          <p class="item__name">${item.label}</p>
          <i class="ri-arrow-right-s-line item__chevron"></i>
        </div>
      </a>
    </li>`;
}

function render() {
  const act = activeIndex();
  return `
    <button type="button" class="sidebar__close" aria-label="Cerrar el menú"><i class="ri-close-large-fill"></i></button>
    <div class="sidebar__content">
      <div class="sidebar__logo">
        <div class="sidebar__logo-clip"></div>
      </div>
      <ul class="sidebar__links">
        ${NAV.map((it, i) => itemHtml(it, i === act)).join("")}
      </ul>
    </div>`;
}

// --- API pública (consulta #sidebar en tiempo de llamada) ---

export function openSidebar() {
  const nav = document.getElementById("sidebar");
  if (!nav) return;
  nav.classList.add("open");
  toggleTabIndex();
}

export function closeSidebar() {
  const nav = document.getElementById("sidebar");
  if (!nav) return;
  nav.classList.remove("open");
  toggleTabIndex();
}

/** En móvil, los enlaces del sidebar cerrado no deben ser tabulables. */
export function toggleTabIndex() {
  if (window.innerWidth >= 744) return;
  const nav = document.getElementById("sidebar");
  if (!nav) return;
  const abierto = nav.classList.contains("open");
  nav.querySelectorAll("a").forEach((a) => (a.tabIndex = abierto ? "0" : "-1"));
}

function wire(nav) {
  const openBtn = document.querySelector(".header__menu");
  if (openBtn) openBtn.addEventListener("click", openSidebar);
  nav.querySelector(".sidebar__close")?.addEventListener("click", closeSidebar);

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSidebar(); });
  // Click fuera (móvil): cerrar. Se excluye el propio botón que abre.
  document.addEventListener("click", (e) => {
    if (nav.classList.contains("open") && !nav.contains(e.target) && !(openBtn && openBtn.contains(e.target))) {
      closeSidebar();
    }
  });
}

function init() {
  let nav = document.getElementById("sidebar");
  if (!nav) {
    nav = document.createElement("nav");
    nav.id = "sidebar";
    document.body.insertBefore(nav, document.body.firstChild);
  }
  nav.classList.add("sidebar");
  nav.innerHTML = render();
  wire(nav);
  toggleTabIndex();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
