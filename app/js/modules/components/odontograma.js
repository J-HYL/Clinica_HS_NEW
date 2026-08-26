/**
 * odontograma.js — COMPONENTE UNICO y REUTILIZABLE del odontograma (window.Odontograma).
 *
 * Dibuja las 32 piezas (numeracion FDI) como line-art anatomico: coronas con
 * cuspides segun el tipo de diente y raices conicas (multiples y abiertas en
 * molares), en dos arcadas enfrentadas. SVG puro, nitido a cualquier tamano y
 * sin depender de imagenes.
 *
 * Se carga como script CLASICO (igual que clinica.js) y expone window.Odontograma,
 * para poder usarlo tanto desde presupuestos.js (script clasico) como desde el
 * modulo de tratamientos. Cada diente lleva `data-tooth="<FDI>"` para que la
 * pagina que quiera interactividad enganche sus propios listeners.
 *
 *   Odontograma.svg(seleccionadas, opts)
 *     - seleccionadas: Set o array de numeros de pieza (se resaltan).
 *     - opts.colorFor(n): opcional; devuelve {fill,stroke,detail,num,numW} para
 *       pintar la pieza n con un estado propio (p.ej. rojo pendiente / verde
 *       hecho en tratamientos). Si devuelve null, usa el estilo por defecto.
 */
window.Odontograma = (function () {
  const UPPER = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const LOWER = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];

  const tipoDe = (d) => (d <= 2 ? "incisivo" : d === 3 ? "canino" : d <= 5 ? "premolar" : "molar");

  // Medidas por tipo (nw=cuello, cw=ancho corona, ocw=ancho oclusal, ch=alto
  // corona, rh=alto raiz, N=nº de raices, cusps=cuspides). Molar superior 3
  // raices, inferior 2.
  const params = (d, jaw) => {
    const t = tipoDe(d);
    if (t === "incisivo") return { t, nw: 9,  cw: 13, ocw: 11, ch: 17, rh: 25, N: 1, cusps: 0 };
    if (t === "canino")   return { t, nw: 9,  cw: 12, ocw: 9,  ch: 18, rh: 30, N: 1, cusps: 1 };
    if (t === "premolar") return { t, nw: 11, cw: 15, ocw: 13, ch: 15, rh: 24, N: 1, cusps: 2 };
    return { t, nw: 18, cw: 22, ocw: 20, ch: 14, rh: 21, N: jaw === "upper" ? 3 : 2, cusps: 4 };
  };

  // Borde oclusal (de -ocw/2 a +ocw/2) con las cuspides del tipo.
  const oclusal = (ocw, ch, k, X, Y) => {
    if (k <= 0) return `Q ${X(0)},${Y(ch + 1.3)} ${X(ocw / 2)},${Y(ch)} `;             // incisivo: borde recto suave
    if (k === 1) return `Q ${X(-ocw * 0.16)},${Y(ch + 2)} ${X(0)},${Y(ch + 4.5)} `      // canino: punta
                      + `Q ${X(ocw * 0.16)},${Y(ch + 2)} ${X(ocw / 2)},${Y(ch)} `;
    let s = "", left = -ocw / 2, step = ocw / k;                                        // premolar/molar: k cuspides
    for (let i = 0; i < k; i++) {
      const peakX = left + step * (i + 0.5);
      const endX  = left + step * (i + 1);
      const endY  = i === k - 1 ? ch : ch - 0.9;
      s += `Q ${X(peakX)},${Y(ch + 2.2)} ${X(endX)},${Y(endY)} `;
    }
    return s;
  };

  // Silueta completa del diente (corona + cuello + raices) como UN solo trazo.
  // s = +1 arcada superior (corona hacia abajo), -1 inferior (se invierte la Y).
  const silueta = (p, s) => {
    const Y = (v) => +(s * v).toFixed(2);
    const X = (v) => +v.toFixed(2);
    const { nw, cw, ocw, ch, rh, N, cusps } = p;

    let d = `M ${X(-nw / 2)},${Y(0)} `;
    d += `C ${X(-cw / 2)},${Y(ch * 0.35)} ${X(-ocw / 2)},${Y(ch * 0.7)} ${X(-ocw / 2)},${Y(ch)} `; // lado izq corona
    d += oclusal(ocw, ch, cusps, X, Y);                                                            // borde oclusal
    d += `C ${X(ocw / 2)},${Y(ch * 0.7)} ${X(cw / 2)},${Y(ch * 0.35)} ${X(nw / 2)},${Y(0)} `;      // lado der corona

    const seg = nw / N;
    const xk = (k) => -nw / 2 + k * seg;
    const splay = N === 3 ? 1.7 : N === 2 ? 1.5 : 1;   // apertura de las raices externas
    const fur = rh * 0.42;                             // profundidad de la furcacion (notch entre raices)

    for (let i = N - 1; i >= 0; i--) {
      const ci = (xk(i) + xk(i + 1)) / 2;
      const tipX = ci * splay;
      const trX = i === N - 1 ? nw / 2 : xk(i + 1);
      const trY = i === N - 1 ? 0 : -fur;
      const tlX = i === 0 ? -nw / 2 : xk(i);
      const tlY = i === 0 ? 0 : -fur;
      // baja por el lado derecho de la raiz hasta la punta
      d += `C ${X(trX)},${Y(-rh * 0.4)} ${X(tipX + (trX - tipX) * 0.3)},${Y(-rh * 0.82)} ${X(tipX)},${Y(-rh)} `;
      // sube por el lado izquierdo hasta el cuello / furcacion
      d += `C ${X(tipX + (tlX - tipX) * 0.3)},${Y(-rh * 0.82)} ${X(tlX)},${Y(-rh * 0.4)} ${X(tlX)},${Y(tlY)} `;
    }
    return d + "Z";
  };

  // Linea cervical (cuello) + surco central en molares. Solo trazo.
  const detalle = (p, s, col) => {
    const Y = (v) => +(s * v).toFixed(2);
    const X = (v) => +v.toFixed(2);
    let d = `<path d="M ${X(-p.nw * 0.44)},${Y(0.5)} Q ${X(0)},${Y(2.6)} ${X(p.nw * 0.44)},${Y(0.5)}" fill="none" stroke="${col}" stroke-width="0.8"/>`;
    if (p.t === "molar" || p.t === "premolar")
      d += `<line x1="0" y1="${Y(p.ch * 0.45)}" x2="0" y2="${Y(p.ch * 0.92)}" stroke="${col}" stroke-width="0.8"/>`;
    return d;
  };

  const DEF = { fill: "#ffffff", stroke: "#1f2937", detail: "#cbd5e1", num: "#64748b", numW: "400" };

  function svg(seleccionadas, opts) {
    opts = opts || {};
    const sel = seleccionadas instanceof Set ? seleccionadas : new Set((seleccionadas || []).map(String));
    const colorFor = opts.colorFor || ((n) => sel.has(String(n))
      ? { fill: "#ccfbf1", stroke: "#0d9488", detail: "#14b8a6", num: "#0f766e", numW: "700" }
      : null);

    const cell = 30, gap = 16, x0 = 8;
    const xFor = (i) => x0 + i * cell + cell / 2 + (i >= 8 ? gap : 0);
    const W = xFor(15) + cell / 2 + x0;
    const H = 158;
    const Gu = 60, Gl = 106;                 // lineas de cuello superior / inferior
    const midX = (xFor(7) + xFor(8)) / 2;

    const one = (n, cx, jaw, s, gum, numY) => {
      const c = colorFor(n) || DEF;
      const p = params(n % 10, jaw);
      let g = `<g data-tooth="${n}" transform="translate(${cx},${gum})">`;
      g += `<path d="${silueta(p, s)}" fill="${c.fill || DEF.fill}" stroke="${c.stroke || DEF.stroke}" stroke-width="1.3" stroke-linejoin="round"/>`;
      g += detalle(p, s, c.detail || DEF.detail);
      g += `</g>`;
      g += `<text x="${cx}" y="${numY}" text-anchor="middle" font-size="9" font-family="Arial" font-weight="${c.numW || DEF.numW}" fill="${c.num || DEF.num}">${n}</text>`;
      return g;
    };

    let out = `<svg viewBox="0 0 ${W} ${H}" width="${W}" xmlns="http://www.w3.org/2000/svg">`;
    out += `<line x1="${midX}" y1="18" x2="${midX}" y2="${H - 18}" stroke="#eef1f4" stroke-width="1"/>`;
    UPPER.forEach((n, i) => out += one(n, xFor(i), "upper", 1, Gu, 24));
    LOWER.forEach((n, i) => out += one(n, xFor(i), "lower", -1, Gl, H - 12));
    out += `</svg>`;
    return out;
  }

  return { svg, UPPER, LOWER };
})();
