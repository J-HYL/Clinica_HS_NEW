// portal/js/install.js
// Instalacion como app (PWA) en iOS y Android sin pasar por ninguna tienda.
//   - Android/Chrome: capturamos beforeinstallprompt y mostramos boton "Instalar".
//   - iOS/Safari: no existe ese evento -> mostramos la guia "Compartir -> Añadir
//     a pantalla de inicio".
import { ICON } from "./icons.js";

let deferred = null;
const DISMISS_KEY = "portal_install_dismissed";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

const isIOS = () => {
  const ua = navigator.userAgent || "";
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(ua) || iPadOS;
};

export function initInstall() {
  if (isStandalone()) return; // ya esta instalada: nada que ofrecer

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    mostrarBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    ocultarBanner();
  });

  if (isIOS()) mostrarBanner(); // iOS: no hay evento, ofrecemos la guia
}

function mostrarBanner() {
  if (localStorage.getItem(DISMISS_KEY) === "1") return;
  crearBanner().classList.add("install--show");
}
function ocultarBanner() {
  document.getElementById("install")?.classList.remove("install--show");
}

function crearBanner() {
  let el = document.getElementById("install");
  if (el) return el;
  el = document.createElement("div");
  el.id = "install";
  el.className = "install";
  el.innerHTML = `
    <span class="install__icon">${ICON.tooth}</span>
    <div class="install__txt"><b>Instala HS Dental</b><span>Acceso directo en tu pantalla de inicio</span></div>
    <div class="install__actions">
      <button class="install__btn" data-do>Instalar</button>
      <button class="install__close" data-x aria-label="Cerrar">✕</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector("[data-do]").onclick = () => openInstall();
  el.querySelector("[data-x]").onclick = () => { localStorage.setItem(DISMISS_KEY, "1"); ocultarBanner(); };
  return el;
}

export async function openInstall() {
  if (deferred) {
    deferred.prompt();
    try { await deferred.userChoice; } catch (e) { /* usuario cerro */ }
    deferred = null;
    ocultarBanner();
    return;
  }
  guiaManual(!isIOS()); // iOS -> guia Safari ; otros -> guia generica
}

function guiaManual(generic) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  const paso2 = generic
    ? "Abre el <b>menú</b> del navegador"
    : `Pulsa <b>Compartir</b> <span class="ios-share">${ICON.share}</span>`;
  dlg.innerHTML = `
    <div class="sheet__grab"></div>
    <div class="sheet__title">Añadir a la pantalla de inicio</div>
    <ol class="ios-steps">
      <li><span class="n">1</span><span>${generic ? "Abre este portal en tu navegador" : "Abre este portal en <b>Safari</b>"}</span></li>
      <li><span class="n">2</span><span>${paso2}</span></li>
      <li><span class="n">3</span><span>Elige <b>Añadir a pantalla de inicio</b></span></li>
      <li><span class="n">4</span><span>Confirma con <b>Añadir</b> y ¡listo! 🎉</span></li>
    </ol>
    <button class="btn btn--block" data-ok style="margin-top:16px">Entendido</button>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("[data-ok]").onclick = close;
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
}
