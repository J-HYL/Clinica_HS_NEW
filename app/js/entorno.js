// entorno.js
// Marquesina de aviso de ENTORNO DE PRUEBAS. Se autoinyecta SOLO si el host es
// de preproduccion (pre.*), detectando por host igual que currentEnv() en el
// servidor (pre.* -> pre; app.*/apex -> prod; localhost -> local). Agnostico
// del entorno: en produccion y en local no hace absolutamente nada.
//
// Se carga desde main.js (todas las paginas del panel, via import de efecto)
// y desde login.php (pagina de entrada, via <script>). El guard evita que se
// pinte dos veces si una pagina la cargara por ambas vias.

(function () {
    const host = (location.hostname || "").toLowerCase();
    if (!host.startsWith("pre.")) return; // solo preproduccion

    const MSG = "⚠ ENTORNO DE PRUEBAS · pre.hsdental.es · Los datos son de prueba — NO trabajar aqui";

    const inject = () => {
        if (document.getElementById("pre-env-banner")) return; // ya inyectada

        const style = document.createElement("style");
        style.textContent = `
            #pre-env-banner{
                position:fixed; left:0; right:0; bottom:0; z-index:2147483647;
                height:34px; overflow:hidden; pointer-events:none;
                background:repeating-linear-gradient(45deg,#f59e0b 0 22px,#111827 22px 44px);
                border-top:2px solid #111827;
                font-family:Arial,Helvetica,sans-serif;
            }
            #pre-env-banner .peb-track{
                display:inline-block; white-space:nowrap; will-change:transform;
                animation:peb-marquee 24s linear infinite;
            }
            #pre-env-banner .peb-track span{
                display:inline-block; line-height:34px; margin:0 26px;
                font-size:13px; font-weight:800; letter-spacing:.04em; color:#111827;
                background:#f59e0b; padding:0 8px;
            }
            @keyframes peb-marquee{ from{transform:translateX(0)} to{transform:translateX(-50%)} }
            @media (prefers-reduced-motion:reduce){
                #pre-env-banner .peb-track{ animation:none; }
            }
        `;
        document.head.appendChild(style);

        // El contenido se duplica: la animacion mueve -50% (una copia exacta),
        // logrando un bucle continuo sin salto.
        const uno = `<span>${MSG}</span><span>${MSG}</span><span>${MSG}</span>`;
        const bar = document.createElement("div");
        bar.id = "pre-env-banner";
        bar.setAttribute("role", "alert");
        bar.innerHTML = `<div class="peb-track">${uno}${uno}</div>`;
        document.body.appendChild(bar);
    };

    if (document.body) inject();
    else document.addEventListener("DOMContentLoaded", inject);
})();
