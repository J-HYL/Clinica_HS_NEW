// portal/js/app.js — orquestador del shell: gate de sesion, tab bar y carga de vistas.
import { api } from "./api.js";
import { toast } from "./util.js";
import { ICON } from "./icons.js";
import { initInstall, openInstall } from "./install.js";
import * as inicio from "./views/inicio.js";
import * as tratamientos from "./views/tratamientos.js";
import * as citas from "./views/citas.js";
import * as perfil from "./views/perfil.js";

const VIEWS = { inicio, tratamientos, citas, perfil };

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
    pedirCita: () => toast("Podrás pedir cita desde aquí muy pronto 🗓️"),
    openInstall,
    logout: hacerLogout,
  };

  construirTabbar();
  document.getElementById("btn-perfil").onclick = () => selectTab("perfil");
  initInstall();
  selectTab("inicio");
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
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("tab--active", b.dataset.tab === tab));
  window.scrollTo(0, 0);
  await VIEWS[tab].render(viewEl, ctx);
}

async function hacerLogout() {
  try { await api.logout(); } catch (e) { /* da igual: limpiamos igual */ }
  location.replace("/login.html");
}

boot();
