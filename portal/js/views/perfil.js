// portal/js/views/perfil.js — datos del paciente + edicion (telefono/edad/alergias).
import { api } from "../api.js";
import { fmtDateShort, escapeHtml, initials, spinnerHtml, toast } from "../util.js";
import { ICON } from "../icons.js";

export async function render(root, ctx) {
  root.innerHTML = `<h1 class="view__title">Perfil</h1><div id="pf-body">${spinnerHtml}</div>`;
  const body = root.querySelector("#pf-body");
  try {
    const { perfil } = await api.perfil();
    if (ctx.cliente) ctx.cliente.nombre = perfil.nombre; // refresca el saludo del shell
    body.innerHTML = bodyHtml(perfil);
    body.querySelector("[data-edit]").onclick = () => openEditor(perfil, () => render(root, ctx));
    body.querySelector("[data-install]").onclick = () => ctx.openInstall();
    body.querySelector("[data-logout]").onclick = () => ctx.logout();
  } catch (e) {
    body.innerHTML = `<div class="card"><p style="color:var(--danger)">${escapeHtml(e.message)}</p></div>`;
  }
}

const sinCompletar = '<span style="color:var(--text-3)">Sin completar</span>';
const show = (v) => (v && v !== "No proporcionado" ? escapeHtml(v) : sinCompletar);
const limpio = (v) => (v && v !== "No proporcionado" ? v : "");

function bodyHtml(p) {
  const edad = p.edad != null ? p.edad + " años" : sinCompletar;
  return `
    <div class="avatar">${escapeHtml(initials(p.nombre))}</div>
    <div class="profile-name">${escapeHtml(p.nombre || "")}</div>
    <div class="profile-mail">${escapeHtml(p.email || "")}</div>

    <div class="list" style="margin-bottom:14px">
      <div class="list__row"><span class="list__key">Teléfono</span><span class="list__val">${show(p.telefono)}</span></div>
      <div class="list__row"><span class="list__key">Edad</span><span class="list__val">${edad}</span></div>
      <div class="list__row"><span class="list__key">Alergias</span><span class="list__val">${show(p.alergias)}</span></div>
    </div>
    <button class="btn" data-edit style="margin-bottom:20px">${ICON.edit}<span>Completar / editar mis datos</span></button>

    <div class="list" style="margin-bottom:14px">
      <div class="list__row"><span class="list__key">Email de acceso</span><span class="list__val" style="font-weight:600">${escapeHtml(p.email || "")}</span></div>
      <div class="list__row"><span class="list__key">Paciente desde</span><span class="list__val">${escapeHtml(fmtDateShort(p.alta) || "—")}</span></div>
    </div>

    <div class="list" style="margin-bottom:14px">
      <button class="list__row list__row--btn" data-install>${ICON.share}<span style="margin-left:8px">Instalar la app en mi móvil</span></button>
    </div>

    <div class="list">
      <button class="list__row list__row--danger" data-logout>Cerrar sesión</button>
    </div>
    <p style="text-align:center;color:var(--text-3);font-size:12px;margin:16px 6px 0">Para cambiar tu email de acceso o tu nombre, contacta con la clínica.</p>`;
}

function openEditor(p, onSaved) {
  const dlg = document.createElement("dialog");
  dlg.className = "sheet";
  dlg.innerHTML = `
    <div class="sheet__grab"></div>
    <div class="sheet__title">Editar mis datos</div>
    <form novalidate>
      <div class="field"><label>Teléfono</label><input class="input" name="telefono" type="tel" inputmode="numeric" value="${escapeHtml(limpio(p.telefono))}" placeholder="600123456"></div>
      <div class="field"><label>Edad</label><input class="input" name="edad" type="number" min="0" max="120" value="${p.edad != null ? p.edad : ""}" placeholder="Años"></div>
      <div class="field"><label>Alergias</label><input class="input" name="alergias" maxlength="100" value="${escapeHtml(limpio(p.alergias))}" placeholder="Ninguna conocida"></div>
      <div class="auth__msg" data-msg></div>
      <button class="btn btn--block" type="submit" data-save style="margin-top:6px"><span>Guardar</span></button>
      <button class="btn btn--ghost btn--block" type="button" data-cancel style="margin-top:4px">Cancelar</button>
    </form>`;
  document.body.appendChild(dlg);
  dlg.showModal();

  const close = () => { dlg.close(); dlg.remove(); };
  dlg.querySelector("[data-cancel]").onclick = close;
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });

  dlg.querySelector("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = dlg.querySelector("[data-msg]");
    const btn = dlg.querySelector("[data-save]");
    const form = e.target;
    const payload = {
      telefono: (form.telefono.value || "").trim(),
      edad: (form.edad.value || "").trim(),
      alergias: (form.alergias.value || "").trim(),
    };
    if (payload.telefono && !/^\d{7,15}$/.test(payload.telefono)) {
      msg.className = "auth__msg auth__msg--error";
      msg.textContent = "El teléfono debe tener entre 7 y 15 dígitos.";
      return;
    }
    if (!payload.telefono) delete payload.telefono; // columna NOT NULL: no la vaciamos
    btn.disabled = true; btn.innerHTML = spinnerHtml;
    try {
      await api.guardarPerfil(payload);
      close();
      toast("Datos actualizados ✓");
      onSaved();
    } catch (err) {
      btn.disabled = false; btn.innerHTML = "<span>Guardar</span>";
      msg.className = "auth__msg auth__msg--error";
      msg.textContent = err.message;
    }
  });
}
