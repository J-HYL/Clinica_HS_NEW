// portal/js/auth-pages.js
// Logica compartida de las paginas de autenticacion. La pagina declara su modo
// con <body data-auth="login|activar|reset">. reset es doble: sin ?token= pide
// el email (enviar enlace); con ?token= fija la nueva contrasena.
import { api } from "./api.js";

const mode = document.body.dataset.auth;
const qs = new URLSearchParams(location.search);

function setMsg(el, text, ok = false) {
  el.className = "auth__msg " + (ok ? "auth__msg--ok" : "auth__msg--error");
  el.textContent = text;
}
function busy(btn, on, label) {
  btn.disabled = on;
  btn.innerHTML = on ? '<div class="spinner"></div>' : label;
}
function setHead(title, sub) {
  const t = document.getElementById("title"); if (t) t.textContent = title;
  const s = document.getElementById("sub"); if (s) s.textContent = sub;
}

/** Fuerza 0..4 de la contrasena (longitud + variedad). */
function scorePw(v) {
  let s = 0;
  if (v.length >= 8) s++;
  if (v.length >= 12) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  return Math.min(s, 4);
}
function wirePwMeter(input, bar) {
  const colors = ["#ff3b30", "#ff9f0a", "#ffcc00", "#34c759"];
  const span = bar.firstElementChild;
  input.addEventListener("input", () => {
    const s = scorePw(input.value);
    span.style.transform = `scaleX(${input.value ? Math.max(1, s) / 4 : 0})`;
    span.style.background = colors[Math.max(0, s - 1)];
  });
}

async function redirectIfLogged() {
  try { const s = await api.sesion(); if (s.autenticado) location.replace("/"); } catch (e) { /* sigue en login */ }
}

function initLogin() {
  redirectIfLogged();
  const form = document.getElementById("form");
  const msg = document.getElementById("msg");
  const btn = document.getElementById("submit");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) { setMsg(msg, "Introduce tu email y contraseña."); return; }
    busy(btn, true);
    try {
      await api.login(email, password);
      location.replace("/");
    } catch (err) {
      busy(btn, false, "Entrar");
      setMsg(msg, err.message);
    }
  });
}

function initSetPassword(kind) {
  const token = qs.get("token") || "";
  const form = document.getElementById("form");
  const msg = document.getElementById("msg");
  const btn = document.getElementById("submit");
  const bar = document.getElementById("pwbar");
  const label = kind === "activar" ? "Activar mi cuenta" : "Guardar contraseña";
  if (!token) {
    setMsg(msg, "Enlace no válido: falta el token.");
    form.querySelectorAll("input, button").forEach((x) => (x.disabled = true));
    return;
  }
  if (bar) wirePwMeter(form.password, bar);
  if (kind === "reset") {
    setHead("Nueva contraseña", "Crea una contraseña nueva para tu cuenta");
    document.querySelector('[data-when="request"]')?.remove();
    btn.textContent = label;
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const p1 = form.password.value, p2 = form.password2.value;
    if (p1.length < 8) { setMsg(msg, "La contraseña debe tener al menos 8 caracteres."); return; }
    if (p1 !== p2) { setMsg(msg, "Las contraseñas no coinciden."); return; }
    busy(btn, true);
    try {
      if (kind === "activar") await api.activar(token, p1);
      else await api.reset(token, p1);
      location.replace("/");
    } catch (err) {
      busy(btn, false, label);
      setMsg(msg, err.message);
    }
  });
}

function initRequestReset() {
  const form = document.getElementById("form");
  const msg = document.getElementById("msg");
  const btn = document.getElementById("submit");
  setHead("Recuperar acceso", "Te enviaremos un enlace para crear una nueva contraseña");
  document.querySelector('[data-when="set"]')?.remove();
  btn.textContent = "Enviar enlace";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim();
    if (!email) { setMsg(msg, "Introduce tu email."); return; }
    busy(btn, true);
    try {
      await api.solicitarReset(email);
      setMsg(msg, "Si el email está registrado, te hemos enviado un enlace para restablecer tu contraseña.", true);
      form.email.disabled = true;
      btn.disabled = true;
      btn.textContent = "Enviado ✓";
    } catch (err) {
      busy(btn, false, "Enviar enlace");
      setMsg(msg, err.message);
    }
  });
}

if (mode === "login") initLogin();
else if (mode === "activar") initSetPassword("activar");
else if (mode === "reset") qs.get("token") ? initSetPassword("reset") : initRequestReset();
