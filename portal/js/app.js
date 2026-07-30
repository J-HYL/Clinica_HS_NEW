// portal/js/app.js — orquestador del shell: gate de sesion, tab bar y carga de vistas.
import { api } from "./api.js";
import { ICON } from "./icons.js";
import { initInstall, openInstall } from "./install.js";
import * as inicio from "./views/inicio.js";
import * as tratamientos from "./views/tratamientos.js";
import * as citas from "./views/citas.js";
import * as perfil from "./views/perfil.js";
import * as pedirCita from "./views/pedirCita.js";
import * as notificaciones from "./views/notificaciones.js";

// inicio/tratamientos/citas/perfil son pestañas; pedirCita/notificaciones son
// vistas secundarias (se abren desde botones, sin pestaña propia).
const VIEWS = { inicio, tratamientos, citas, perfil, pedirCita, notificaciones };

const viewEl = document.getElementById("view");
let ctx;

// Sesion caducada en cualquier peticion -> al login.
window.addEventListener("portal:unauth", () => location.replace("/login.html"));

async function boot() {
  let sesion;
  try { sesion = await api.sesion(); }
  catch (e) { location.replace("/login.html"); return; }
  if (!sesion.autenticado) { location.replace("/login.html"); return; }

  ctx = {
    cliente: sesion.cliente || {},
    go: (tab) => selectTab(tab),
    pedirCita: () => selectTab("pedirCita"),
    verNotificaciones: () => selectTab("notificaciones"),
    refreshBadge,
    openInstall,
    logout: hacerLogout,
  };

  construirTabbar();
  document.getElementById("btn-perfil").onclick = () => selectTab("perfil");
  document.getElementById("btn-notif").onclick = () => selectTab("notificaciones");
  initInstall();
  selectTab("inicio");
  refreshBadge();
}

function construirTabbar() {
  const bar = document.getElementById("tabbar");
  const tabs = [
    ["inicio", ICON.home, "Inicio"],
    ["tratamientos", ICON.treat, "Tratam."],
    ["citas", ICON.calendar, "Citas"],
    ["perfil", ICON.user, "Perfil"],
  ];
  bar.innerHTML = tabs
    .map(([id, ic, lbl]) => `<button class="tab" data-tab="${id}" aria-label="${lbl}">${ic}<span>${lbl}</span></button>`)
    .join("");
  bar.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => selectTab(b.dataset.tab)));
}

async function selectTab(tab) {
  if (!VIEWS[tab]) return;
  // Resalta la pestaña solo si es una de la barra (las vistas secundarias no).
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("tab--active", b.dataset.tab === tab));
  window.scrollTo(0, 0);
  await VIEWS[tab].render(viewEl, ctx);
}

async function refreshBadge() {
  try {
    const { no_leidas } = await api.notificaciones();
    const dot = document.getElementById("notif-dot");
    const btn = document.getElementById("btn-notif");
    if (!dot) return;
    if (no_leidas > 0) {
      dot.textContent = no_leidas > 9 ? "9+" : String(no_leidas);
      dot.hidden = false;
      if (btn) btn.classList.add("has");
    } else {
      dot.hidden = true;
      if (btn) btn.classList.remove("has");
    }
  } catch (e) { /* silencio: el badge no es crítico */ }
}

async function hacerLogout() {
  try { await api.logout(); } catch (e) { /* da igual: limpiamos igual */ }
  location.replace("/login.html");
}

boot();
