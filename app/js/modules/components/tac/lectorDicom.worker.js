// lectorDicom.worker.js — Lee un estudio DICOM (TAC/CBCT) desde un .zip, fuera
// del hilo principal para que la página no se congele.
//
// Worker CLÁSICO (no módulo) a propósito: así fflate y dicom-parser se cargan con
// importScripts desde el CDN como globales, igual que el resto de librerías de
// terceros del panel. No se usa directamente: se lanza desde LectorDicom.js.
//
// Dos trabajos:
//  - "analizar" (antes de subir): valida el zip, encuentra la serie volumétrica,
//    saca los datos del estudio y una vista previa, y si el zip trae algo más que
//    esa serie (DICOMDIR, otras series, el visor de Romexis...) lo reempaqueta
//    solo con ella. Devuelve también la huella sha256 de lo que hay que subir.
//  - "volumen" (en el visor): monta el volumen completo, con los cortes ordenados
//    por su posición real y los grises ya en las unidades del equipo.
//
// Memoria: un CBCT descomprimido ocupa 200-1000 MB. El zip se descomprime por
// lotes y el volumen se reserva UNA vez y se rellena directamente; guardar cada
// corte y juntarlos al final duplicaría el pico de memoria.

"use strict";

importScripts(
    "https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js",
    "https://cdn.jsdelivr.net/npm/dicom-parser@1.8.21/dist/dicomParser.min.js"
);

const LOTE = 24;            // ficheros que se descomprimen de una vez
const MIN_CORTES = 20;      // por debajo de esto no es un volumen
const DIMENSION_3D = 320;   // tamaño máximo por eje del volumen que se pinta en 3D

// Formatos sin compresión (los únicos que se leen de momento). Romexis exporta
// así por defecto; si llega uno comprimido, el error dice cuál para añadirlo.
const SINTAXIS_ADMITIDAS = new Set([
    "1.2.840.10008.1.2",        // Implicit VR Little Endian
    "1.2.840.10008.1.2.1",      // Explicit VR Little Endian
    "1.2.840.10008.1.2.1.99",   // Deflated Explicit VR Little Endian
]);

self.onmessage = async (evento) => {
    const { tipo, zip } = evento.data;
    try {
        const datos = new Uint8Array(zip);
        const resultado = tipo === "analizar" ? await analizar(datos) : montar(datos);
        self.postMessage({ tipo: "resultado", resultado }, transferibles(resultado));
    } catch (error) {
        self.postMessage({ tipo: "error", mensaje: error?.message || String(error) });
    }
};

function progreso(fase, hechos, total) {
    self.postMessage({ tipo: "progreso", fase, hechos, total });
}

/** Buffers del resultado que se pasan sin copiar al hilo principal. */
function transferibles(resultado) {
    const buffers = [
        resultado.zip,
        resultado.vistaPrevia?.rgba?.buffer,
        resultado.volumen?.datos?.buffer,
        resultado.volumen3D?.datos?.buffer,
    ].filter(Boolean);
    return [...new Set(buffers)];
}

// --- trabajos ---------------------------------------------------------------

async function analizar(datos) {
    const nombres = listarZip(datos);
    const { cortes, series, noImagen } = leerCabeceras(datos, nombres);
    const { principal, avisos } = elegirSerie(cortes, series);
    const geo = geometria(principal);
    comprobarFormato(geo.ordenados[0]);

    const meta = series.get(principal[0].serie);
    const central = geo.ordenados[Math.floor(geo.ordenados.length / 2)];
    const vistaPrevia = generarVistaPrevia(datos, central, geo, meta.ventana);

    // Solo se reempaqueta si sobra algo: así lo normal (un zip con la serie y
    // nada más) se sube tal cual, sin gastar tiempo en volver a comprimir.
    const ficherosSerie = [...new Set(principal.map(c => c.fichero))];
    const sobran = nombres.length - ficherosSerie.length;
    let zip = null;
    if (sobran > 0) {
        if (noImagen === 1) avisos.push("Se ha descartado 1 archivo que no es una imagen del estudio.");
        else if (noImagen > 1) avisos.push(`Se han descartado ${noImagen} archivos que no son imágenes del estudio.`);
        progreso("empaquetando", 0, 1);
        const ficheros = descomprimir(datos, ficherosSerie);
        const empaquetado = fflate.zipSync(ficheros, { level: 1 });
        zip = empaquetado.byteLength === empaquetado.buffer.byteLength
            ? empaquetado.buffer
            : empaquetado.slice().buffer;
    }

    progreso("verificando", 0, 1);
    const final = zip ? new Uint8Array(zip) : datos;
    const sha256 = await huella(final);

    return {
        paciente: meta.paciente,
        estudio: { fecha: meta.fecha, descripcion: meta.descripcion, equipo: meta.equipo },
        geometria: {
            ancho: geo.dims[0], alto: geo.dims[1], cortes: geo.dims[2],
            voxel: geo.espaciado.map(v => Math.round(v * 10000) / 10000),
        },
        avisos: [...avisos, ...geo.avisos],
        vistaPrevia,
        sha256,
        tamano: final.byteLength,
        zip,
    };
}

function montar(datos) {
    const nombres = listarZip(datos);
    const { cortes, series } = leerCabeceras(datos, nombres);
    const { principal, avisos } = elegirSerie(cortes, series);
    const geo = geometria(principal);
    comprobarFormato(geo.ordenados[0]);

    const enteros = geo.ordenados.every(c => Number.isInteger(c.pendiente) && Number.isInteger(c.interseccion));
    // Int16 ocupa la mitad que Float32. Si algún valor no cabe (raro), se repite en Float32.
    const volumen = (enteros && rellenarVolumen(datos, geo, Int16Array)) || rellenarVolumen(datos, geo, Float32Array);

    progreso("calculando", 0, 1);
    const estadisticas = calcularEstadisticas(volumen);
    const meta = series.get(principal[0].serie);
    const ventana = meta.ventana || {
        centro: (estadisticas.p1 + estadisticas.p995) / 2,
        ancho: Math.max(1, estadisticas.p995 - estadisticas.p1),
    };

    return {
        volumen: { datos: volumen, dims: geo.dims, espaciado: geo.espaciado },
        volumen3D: reducir(volumen, geo.dims, geo.espaciado),
        estadisticas,
        ventana,
        avisos: [...avisos, ...geo.avisos],
    };
}

// --- zip --------------------------------------------------------------------

/** Nombres de los ficheros del zip (sin descomprimir nada todavía). */
function listarZip(datos) {
    const nombres = [];
    try {
        fflate.unzipSync(datos, {
            filter: (fichero) => {
                if (!fichero.name.endsWith("/")) nombres.push(fichero.name);
                return false;
            },
        });
    } catch {
        throw new Error("El archivo no es un .zip válido o está dañado.");
    }
    if (!nombres.length) throw new Error("El zip está vacío.");
    return nombres;
}

/** Descomprime solo los ficheros indicados. */
function descomprimir(datos, nombres) {
    const buscados = new Set(nombres);
    return fflate.unzipSync(datos, { filter: (fichero) => buscados.has(fichero.name) });
}

async function huella(bytes) {
    const resumen = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(resumen)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// --- DICOM ------------------------------------------------------------------

/** Dataset DICOM del fichero, o null si no es un DICOM (o no se puede leer). */
function leerDataset(bytes) {
    // Todo DICOM "Part 10" lleva 128 bytes de preámbulo y luego "DICM".
    if (!bytes || bytes.length < 132 || bytes[128] !== 0x44 || bytes[129] !== 0x49 || bytes[130] !== 0x43 || bytes[131] !== 0x4D) {
        return null;
    }
    try {
        return dicomParser.parseDicom(bytes, { inflater: inflar });
    } catch {
        return null;
    }
}

/** Para la sintaxis "Deflated": dicom-parser delega en esto la descompresión. */
function inflar(bytes, posicion) {
    const inflado = fflate.inflateSync(bytes.subarray(posicion));
    const completo = new Uint8Array(posicion + inflado.length);
    completo.set(bytes.subarray(0, posicion), 0);
    completo.set(inflado, posicion);
    return completo;
}

/** Recorre el zip por lotes y saca la descripción de cada imagen (sin píxeles). */
function leerCabeceras(datos, nombres) {
    const cortes = [];
    const series = new Map();
    let noImagen = 0;

    for (let n = 0; n < nombres.length; n += LOTE) {
        const lote = nombres.slice(n, n + LOTE);
        const ficheros = descomprimir(datos, lote);
        for (const nombre of lote) {
            const ds = leerDataset(ficheros[nombre]);
            const nuevos = ds ? cortesDeFichero(nombre, ds) : [];
            if (!nuevos.length) { noImagen++; continue; }
            for (const corte of nuevos) cortes.push(corte);
            if (!series.has(nuevos[0].serie)) series.set(nuevos[0].serie, metadatos(ds));
        }
        progreso("leyendo", Math.min(n + LOTE, nombres.length), nombres.length);
    }

    if (!cortes.length) throw new Error("El zip no contiene imágenes DICOM.");
    return { cortes, series, noImagen };
}

/**
 * Una entrada por imagen. Un fichero normal (single frame) da una; un DICOM
 * "multi-frame" (todo el volumen en un fichero) da una por frame, con su
 * posición sacada de los grupos funcionales por frame.
 */
function cortesDeFichero(nombre, ds) {
    const pixel = ds.elements.x7fe00010;
    const filas = ds.uint16("x00280010");
    const columnas = ds.uint16("x00280011");
    if (!pixel || !filas || !columnas) return [];       // DICOMDIR, informes, etc.
    if ((ds.uint16("x00280002") || 1) !== 1) return []; // color: no es un TAC

    const bits = ds.uint16("x00280100") || 16;
    const comun = {
        fichero: nombre,
        serie: ds.string("x0020000e") || "(sin serie)",
        filas,
        columnas,
        bits,
        bitsGuardados: ds.uint16("x00280101") || bits,
        conSigno: ds.uint16("x00280103") === 1,
        sintaxis: (ds.string("x00020010") || "1.2.840.10008.1.2").replace(/\0/g, "").trim(),
        comprimido: !!pixel.encapsulatedPixelData,
        instancia: ds.intString("x00200013") ?? 0,
    };

    const frames = Math.max(1, ds.intString("x00280008") || 1);
    const cortes = [];
    for (let frame = 0; frame < frames; frame++) {
        const grupos = [
            ds.elements.x52009230?.items?.[frame]?.dataSet,   // por frame
            ds.elements.x52009229?.items?.[0]?.dataSet,       // compartido
        ].filter(Boolean);
        const posicion = deSecuencia(grupos, "x00209113") || ds;
        const orientacion = deSecuencia(grupos, "x00209116") || ds;
        const medidas = deSecuencia(grupos, "x00289110") || ds;
        const escala = deSecuencia(grupos, "x00289145") || ds;

        cortes.push({
            ...comun,
            frame,
            posicion: numeros(posicion, "x00200032", 3),
            orientacion: numeros(orientacion, "x00200037", 6),
            pixel: numeros(medidas, "x00280030", 2),     // [entre filas, entre columnas] en mm
            grosor: medidas.floatString("x00180050") ?? ds.floatString("x00180050"),
            separacion: medidas.floatString("x00180088") ?? ds.floatString("x00180088"),
            pendiente: escala.floatString("x00281053") ?? 1,
            interseccion: escala.floatString("x00281052") ?? 0,
        });
    }
    return cortes;
}

function deSecuencia(grupos, etiqueta) {
    for (const grupo of grupos) {
        const ds = grupo.elements[etiqueta]?.items?.[0]?.dataSet;
        if (ds) return ds;
    }
    return null;
}

/** Valor multivaluado ("a\b\c") como array de números, o null si falta. */
function numeros(ds, etiqueta, cuantos) {
    if (!ds.elements[etiqueta]) return null;
    const valores = [];
    for (let i = 0; i < cuantos; i++) {
        const v = ds.floatString(etiqueta, i);
        if (!Number.isFinite(v)) return null;
        valores.push(v);
    }
    return valores;
}

/** Datos del paciente y del estudio (se leen del primer fichero de cada serie). */
function metadatos(ds) {
    const centro = ds.floatString("x00281050");
    const ancho = ds.floatString("x00281051");
    return {
        paciente: {
            nombre: nombreDicom(ds.string("x00100010")),
            id: ds.string("x00100020") || null,
            nacimiento: fechaDicom(ds.string("x00100030")),
        },
        fecha: fechaDicom(ds.string("x00080020")),
        descripcion: ds.string("x00081030") || ds.string("x0008103e") || null,
        equipo: [ds.string("x00080070"), ds.string("x00081090")].filter(Boolean).join(" ") || null,
        ventana: Number.isFinite(centro) && ancho > 0 ? { centro, ancho } : null,
    };
}

/** "GARCIA LOPEZ^MARIA" -> "GARCIA LOPEZ MARIA". */
function nombreDicom(valor) {
    if (!valor) return null;
    const nombre = valor.split("=")[0].replace(/\^+/g, " ").replace(/\s+/g, " ").trim();
    return nombre || null;
}

/** "20260115" -> "2026-01-15". */
function fechaDicom(valor) {
    const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor || "");
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// --- serie y geometría ------------------------------------------------------

/** La serie con más imágenes del mismo tamaño es el volumen. */
function elegirSerie(cortes) {
    const grupos = new Map();
    for (const corte of cortes) {
        const clave = `${corte.serie}|${corte.filas}x${corte.columnas}`;
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(corte);
    }
    const ordenados = [...grupos.values()].sort((a, b) => b.length - a.length);
    const principal = ordenados[0];

    if (principal.length < MIN_CORTES) {
        throw new Error(`No se ha encontrado un volumen: la serie más grande solo tiene ${principal.length} imagen${principal.length === 1 ? "" : "es"}. ¿Es un TAC exportado como serie DICOM?`);
    }
    const avisos = [];
    if (ordenados.length > 1) {
        avisos.push(`El zip trae ${ordenados.length} series de imágenes: se usa la del volumen (${principal.length} cortes).`);
    }
    return { principal, avisos };
}

function comprobarFormato(corte) {
    if (corte.comprimido || !SINTAXIS_ADMITIDAS.has(corte.sintaxis)) {
        throw new Error(`El estudio viene en un formato DICOM comprimido (${corte.sintaxis}) que el visor aún no lee. Expórtalo desde el software del equipo sin compresión.`);
    }
    if (corte.bits !== 8 && corte.bits !== 16) {
        throw new Error(`Formato de imagen no admitido (${corte.bits} bits por píxel).`);
    }
}

/**
 * Ordena los cortes por su posición REAL en el espacio (no por nombre de fichero
 * ni por número de instancia, que no son de fiar) y calcula el tamaño del vóxel.
 * Además normaliza la orientación de los estudios axiales para que el visor los
 * vea siempre igual: i hacia la izquierda del paciente, j hacia posterior y k
 * hacia superior (convención radiológica: anterior arriba, derecha del paciente
 * a la izquierda de la pantalla).
 */
function geometria(cortes) {
    const avisos = [];
    const orientacion = cortes[0].orientacion || [1, 0, 0, 0, 1, 0];
    const fila = orientacion.slice(0, 3);
    const columna = orientacion.slice(3, 6);
    const normal = cruz(fila, columna);
    const axial = Math.abs(normal[2]) >= Math.abs(normal[0]) && Math.abs(normal[2]) >= Math.abs(normal[1]);
    if (!axial) avisos.push("El estudio no está en cortes axiales: las etiquetas de orientación pueden no corresponder.");

    let ordenados;
    let separacion;
    if (cortes.every(c => c.posicion)) {
        const conDistancia = cortes
            .map(c => ({ c, d: punto(c.posicion, normal) }))
            .sort((a, b) => a.d - b.d);

        // Fuera cortes repetidos en la misma posición (series duplicadas en el zip).
        const unicos = [conDistancia[0]];
        for (let n = 1; n < conDistancia.length; n++) {
            if (conDistancia[n].d - unicos[unicos.length - 1].d > 0.001) unicos.push(conDistancia[n]);
        }
        if (unicos.length < conDistancia.length) {
            avisos.push(`Se han descartado ${conDistancia.length - unicos.length} cortes repetidos.`);
        }

        const pasos = [];
        for (let n = 1; n < unicos.length; n++) pasos.push(unicos[n].d - unicos[n - 1].d);
        separacion = mediana(pasos);
        if (pasos.some(p => Math.abs(p - separacion) > separacion * 0.1)) {
            avisos.push("La separación entre cortes no es uniforme: las vistas coronal y sagital pueden verse algo deformadas.");
        }
        ordenados = unicos.map(u => u.c);
    } else {
        ordenados = [...cortes].sort((a, b) => a.instancia - b.instancia);
        separacion = cortes[0].separacion || cortes[0].grosor || cortes[0].pixel?.[0] || 1;
        avisos.push("Las imágenes no traen su posición: se ordenan por número de imagen.");
    }

    if (axial && normal[2] < 0) ordenados.reverse();

    const pixel = cortes[0].pixel;
    if (!pixel) avisos.push("El estudio no indica el tamaño del píxel: las medidas no serán reales.");

    return {
        ordenados,
        dims: [cortes[0].columnas, cortes[0].filas, ordenados.length],
        espaciado: [pixel ? pixel[1] : 1, pixel ? pixel[0] : 1, separacion > 0 ? separacion : 1],
        invertirI: axial && fila[0] < 0,
        invertirJ: axial && columna[1] < 0,
        avisos,
    };
}

function cruz(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function punto(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function mediana(valores) {
    if (!valores.length) return 0;
    const ordenados = [...valores].sort((a, b) => a - b);
    return ordenados[Math.floor(ordenados.length / 2)];
}

// --- píxeles ----------------------------------------------------------------

/** Valores tal cual vienen en el fichero (antes de aplicar la escala). */
function pixelesCrudos(ds, corte) {
    const pixel = ds.elements.x7fe00010;
    const bytesPorPixel = corte.bits / 8;
    const n = corte.filas * corte.columnas;
    const inicio = pixel.dataOffset + corte.frame * n * bytesPorPixel;
    if (inicio + n * bytesPorPixel > ds.byteArray.length) {
        throw new Error(`La imagen ${corte.fichero} está incompleta.`);
    }

    // slice() copia: alinea los datos para el array tipado y suelta el fichero.
    const copia = ds.byteArray.slice(inicio, inicio + n * bytesPorPixel);
    const enmascarar = corte.bitsGuardados < corte.bits;

    let crudo;
    if (bytesPorPixel === 2) crudo = corte.conSigno && !enmascarar ? new Int16Array(copia.buffer) : new Uint16Array(copia.buffer);
    else crudo = corte.conSigno && !enmascarar ? new Int8Array(copia.buffer) : copia;
    if (!enmascarar) return crudo;

    // Bits Stored < Bits Allocated: los bits de sobra pueden traer basura.
    const mascara = (1 << corte.bitsGuardados) - 1;
    const desplazamiento = 32 - corte.bitsGuardados;
    const limpio = new Int32Array(n);
    for (let p = 0; p < n; p++) {
        const v = crudo[p] & mascara;
        limpio[p] = corte.conSigno ? (v << desplazamiento) >> desplazamiento : v;
    }
    return limpio;
}

/**
 * Copia un corte al volumen en la posición k, aplicando la escala del equipo
 * (valor * pendiente + intersección) y la normalización de orientación.
 * Devuelve false si el volumen es Int16 y algún valor no cabe.
 */
function volcarCorte(crudo, corte, k, volumen, geo) {
    const [nx, ny] = geo.dims;
    const m = corte.pendiente;
    const b = corte.interseccion;
    const entero = volumen instanceof Int16Array;
    const base = k * nx * ny;

    for (let j = 0; j < ny; j++) {
        const origen = j * nx;
        const destino = base + (geo.invertirJ ? ny - 1 - j : j) * nx;
        for (let i = 0; i < nx; i++) {
            const v = crudo[origen + i] * m + b;
            if (entero && (v < -32768 || v > 32767)) return false;
            volumen[destino + (geo.invertirI ? nx - 1 - i : i)] = v;
        }
    }
    return true;
}

function rellenarVolumen(datos, geo, Tipo) {
    const [nx, ny, nz] = geo.dims;
    const volumen = new Tipo(nx * ny * nz);

    const posicion = new Map(geo.ordenados.map((c, k) => [`${c.fichero}#${c.frame}`, k]));
    const porFichero = new Map();
    for (const corte of geo.ordenados) {
        if (!porFichero.has(corte.fichero)) porFichero.set(corte.fichero, []);
        porFichero.get(corte.fichero).push(corte);
    }
    const nombres = [...porFichero.keys()];

    let hechos = 0;
    for (let n = 0; n < nombres.length; n += LOTE) {
        const lote = nombres.slice(n, n + LOTE);
        const ficheros = descomprimir(datos, lote);
        for (const nombre of lote) {
            const ds = leerDataset(ficheros[nombre]);
            if (!ds) throw new Error(`No se pudo releer ${nombre}.`);
            for (const corte of porFichero.get(nombre)) {
                const k = posicion.get(`${corte.fichero}#${corte.frame}`);
                if (!volcarCorte(pixelesCrudos(ds, corte), corte, k, volumen, geo)) return null;
                hechos++;
            }
        }
        progreso("montando", hechos, nz);
    }
    return volumen;
}

/** Corte central en escala de grises, para confirmar el estudio antes de subirlo. */
function generarVistaPrevia(datos, corte, geo, ventanaEstudio) {
    const ds = leerDataset(descomprimir(datos, [corte.fichero])[corte.fichero]);
    const [ancho, alto] = geo.dims;
    const valores = new Float32Array(ancho * alto);
    volcarCorte(pixelesCrudos(ds, corte), corte, 0, valores, geo);

    let ventana = ventanaEstudio;
    if (!ventana) {
        const ordenados = Float32Array.from(valores).sort();
        const bajo = ordenados[Math.floor(ordenados.length * 0.01)];
        const alto99 = ordenados[Math.floor(ordenados.length * 0.995)];
        ventana = { centro: (bajo + alto99) / 2, ancho: Math.max(1, alto99 - bajo) };
    }

    const minimo = ventana.centro - ventana.ancho / 2;
    const escala = 255 / ventana.ancho;
    const rgba = new Uint8ClampedArray(ancho * alto * 4);
    for (let p = 0; p < valores.length; p++) {
        const g = (valores[p] - minimo) * escala;
        rgba[p * 4] = rgba[p * 4 + 1] = rgba[p * 4 + 2] = g;
        rgba[p * 4 + 3] = 255;
    }
    return { ancho, alto, rgba };
}

// --- estadísticas y 3D ------------------------------------------------------

/**
 * Percentiles y umbrales automáticos del estudio. En un CBCT los grises NO son
 * unidades Hounsfield calibradas (cambian con el equipo, el campo de visión y
 * los metales), así que los umbrales de hueso/dientes no pueden ser fijos: se
 * sacan del histograma de cada estudio con Otsu en cascada (aire | tejido
 * blando | hueso | esmalte y metal). Son el punto de partida del visor 3D.
 */
function calcularEstadisticas(volumen) {
    const paso = Math.max(1, Math.floor(volumen.length / 4e6));   // muestra de ~4M vóxeles
    let minimo = Infinity;
    let maximo = -Infinity;
    for (let p = 0; p < volumen.length; p += paso) {
        const v = volumen[p];
        if (v < minimo) minimo = v;
        if (v > maximo) maximo = v;
    }
    if (maximo <= minimo) maximo = minimo + 1;

    const CUBOS = 2048;
    const anchoCubo = (maximo - minimo) / CUBOS;
    const histograma = new Float64Array(CUBOS);
    let total = 0;
    for (let p = 0; p < volumen.length; p += paso) {
        histograma[Math.min(CUBOS - 1, Math.floor((volumen[p] - minimo) / anchoCubo))]++;
        total++;
    }

    const valorDeCubo = (c) => minimo + (c + 0.5) * anchoCubo;
    const percentil = (fraccion) => {
        let acumulado = 0;
        for (let c = 0; c < CUBOS; c++) {
            acumulado += histograma[c];
            if (acumulado >= total * fraccion) return valorDeCubo(c);
        }
        return maximo;
    };

    const t1 = otsu(histograma, 0, CUBOS);
    const t2 = otsu(histograma, t1 + 1, CUBOS);
    const t3 = otsu(histograma, t2 + 1, CUBOS);

    const p99 = percentil(0.99);
    const tejido = valorDeCubo(t1);
    const hueso = t2 > t1 ? valorDeCubo(t2) : percentil(0.9);
    const dientes = t3 > t2 ? valorDeCubo(t3) : p99;

    return {
        minimo,
        maximo,
        p1: percentil(0.01),
        p99,
        p995: percentil(0.995),
        p999: percentil(0.999),
        umbralTejido: tejido,
        umbralHueso: Math.max(hueso, tejido),
        umbralDientes: Math.max(dientes, hueso),
    };
}

/**
 * Umbral de Otsu (el que mejor separa en dos clases) dentro de [desde, hasta).
 * Si entre los dos picos hay un tramo vacío, todo él empata: se devuelve su
 * centro, no su primer cubo (que quedaría pegado al pico de la izquierda).
 */
function otsu(histograma, desde, hasta) {
    let total = 0;
    let suma = 0;
    for (let c = desde; c < hasta; c++) {
        total += histograma[c];
        suma += c * histograma[c];
    }
    if (!total) return desde;

    let pesoFondo = 0;
    let sumaFondo = 0;
    let mejor = desde;
    let mejorHasta = desde;
    let mejorVarianza = -1;
    for (let c = desde; c < hasta; c++) {
        pesoFondo += histograma[c];
        if (!pesoFondo) continue;
        const pesoFrente = total - pesoFondo;
        if (!pesoFrente) break;
        sumaFondo += c * histograma[c];
        const mediaFondo = sumaFondo / pesoFondo;
        const mediaFrente = (suma - sumaFondo) / pesoFrente;
        const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;
        if (varianza > mejorVarianza * (1 + 1e-9)) {
            mejorVarianza = varianza;
            mejor = mejorHasta = c;
        } else if (varianza >= mejorVarianza * (1 - 1e-9)) {
            mejorHasta = c;
        }
    }
    return Math.round((mejor + mejorHasta) / 2);
}

/**
 * Volumen reducido para el 3D (media de bloques de f x f x f vóxeles). En 3D no
 * se aprecia la resolución completa y así el giro va fluido y la tarjeta gráfica
 * no se queda sin memoria. Las vistas 2D siguen usando el volumen completo.
 * Devuelve null si no hace falta reducir (el 3D usa entonces el completo).
 */
function reducir(volumen, dims, espaciado) {
    const [nx, ny, nz] = dims;
    const f = Math.ceil(Math.max(nx, ny, nz) / DIMENSION_3D);
    if (f <= 1) return null;

    progreso("preparando3d", 0, 1);
    const mx = Math.floor(nx / f);
    const my = Math.floor(ny / f);
    const mz = Math.floor(nz / f);
    const suma = new Float32Array(mx * my * mz);
    const mapaI = new Int32Array(mx * f);
    for (let i = 0; i < mapaI.length; i++) mapaI[i] = (i / f) | 0;

    for (let k = 0; k < mz * f; k++) {
        const planoDestino = ((k / f) | 0) * mx * my;
        for (let j = 0; j < my * f; j++) {
            const origen = k * nx * ny + j * nx;
            const destino = planoDestino + ((j / f) | 0) * mx;
            for (let i = 0; i < mx * f; i++) suma[destino + mapaI[i]] += volumen[origen + i];
        }
    }

    const divisor = f * f * f;
    const reducido = new volumen.constructor(suma.length);
    for (let p = 0; p < suma.length; p++) reducido[p] = Math.round(suma[p] / divisor);

    return { datos: reducido, dims: [mx, my, mz], espaciado: espaciado.map(e => e * f) };
}
