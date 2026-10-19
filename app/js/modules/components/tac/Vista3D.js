// modules/components/tac/Vista3D.js
// Vista 3D del volumen con vtk.js (global `vtk`, cargado por <script> en
// visor.html, como el resto de librerías de terceros del panel).
//
// Es "volume rendering" en la tarjeta gráfica: se pinta el volumen de grises
// directamente, sin generar una malla. Por eso cambiar el umbral es instantáneo
// y se conserva la densidad del hueso. (Una malla tipo STL solo haría falta
// para exportar o imprimir, no para ver.)
//
// Ratón (lo da vtk.js): arrastrar = girar · rueda = zoom · Mayús + arrastrar = desplazar.

// Puntos de color a lo largo de la rampa de opacidad: [inicio, medio, final].
export const PRESETS_3D = {
    hueso: {
        titulo: "Hueso",
        umbral: (e) => e.umbralHueso,
        opacidad: 0.85,
        colores: [[0.62, 0.45, 0.36], [0.93, 0.86, 0.76], [1, 0.99, 0.95]],
    },
    dientes: {
        titulo: "Dientes",
        umbral: (e) => e.umbralDientes,
        opacidad: 0.9,
        colores: [[0.80, 0.74, 0.62], [0.97, 0.95, 0.88], [1, 1, 1]],
    },
    piel: {
        titulo: "Piel",
        umbral: (e) => e.umbralTejido,
        opacidad: 0.45,
        colores: [[0.55, 0.32, 0.27], [0.86, 0.66, 0.56], [0.95, 0.83, 0.75]],
    },
};

export default class Vista3D {
    /**
     * @param {HTMLElement} contenedor
     * @param {{datos, dims, espaciado}} volumen - normalmente el reducido para 3D
     * @param {Object} estadisticas - percentiles y umbrales del estudio (lector)
     */
    constructor(contenedor, volumen, estadisticas) {
        this.estadisticas = estadisticas;
        this.volumen = volumen;

        this.ventana = vtk.Rendering.Misc.vtkGenericRenderWindow.newInstance({
            background: [0.04, 0.06, 0.09],
            listenWindowResize: false,
        });
        this.ventana.setContainer(contenedor);
        this.ventana.resize();
        this.renderer = this.ventana.getRenderer();
        this.renderWindow = this.ventana.getRenderWindow();

        const imagen = vtk.Common.DataModel.vtkImageData.newInstance();
        imagen.setDimensions(...volumen.dims);
        imagen.setSpacing(...volumen.espaciado);
        imagen.setOrigin(0, 0, 0);
        imagen.getPointData().setScalars(vtk.Common.Core.vtkDataArray.newInstance({
            name: "Scalars",
            numberOfComponents: 1,
            values: volumen.datos,
        }));

        const mapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        mapper.setInputData(imagen);
        mapper.setSampleDistance(Math.min(...volumen.espaciado) * 0.7);

        this.color = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        this.opacidad = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

        const actor = vtk.Rendering.Core.vtkVolume.newInstance();
        actor.setMapper(mapper);
        const propiedad = actor.getProperty();
        propiedad.setRGBTransferFunction(0, this.color);
        propiedad.setScalarOpacity(0, this.opacidad);
        propiedad.setInterpolationTypeToLinear();
        propiedad.setShade(true);
        propiedad.setAmbient(0.25);
        propiedad.setDiffuse(0.75);
        propiedad.setSpecular(0.25);
        propiedad.setSpecularPower(12);
        // Texturas de 16 bits en la GPU en vez de 32: la mitad de memoria gráfica.
        // (En vtk.js >= 37 vive en la propiedad del volumen, no en el mapper.)
        propiedad.setPreferSizeOverAccuracy?.(true);
        this.renderer.addVolume(actor);

        this.cubo = crearCuboOrientacion(this.ventana.getInteractor());

        // Oculto (otra disposición) mide 0: no se redimensiona a 0, que WebGL se queja.
        this.observador = new ResizeObserver(() => {
            if (!contenedor.clientWidth || !contenedor.clientHeight) return;
            this.ventana.resize();
            this.cubo?.updateViewport();
            this.renderWindow.render();
        });
        this.observador.observe(contenedor);

        this.aplicarPreset("hueso");
        this.restablecerCamara();
    }

    /** PNG de lo que se ve (vtk.js lo captura en el siguiente fotograma). */
    async exportarPNG() {
        const [captura] = this.renderWindow.captureImages("image/png");
        const url = await captura;
        return (await fetch(url)).blob();
    }

    /** Cambia de preset y devuelve el umbral con el que queda. */
    aplicarPreset(nombre) {
        this.preset = PRESETS_3D[nombre];
        this.fijarUmbral(this.preset.umbral(this.estadisticas));
        return this.umbral;
    }

    /**
     * Por debajo del umbral, transparente; por encima, una rampa corta hasta la
     * opacidad del preset (un borde suave queda mejor con la iluminación que un
     * corte seco).
     */
    fijarUmbral(umbral) {
        const { minimo, maximo, p999 } = this.estadisticas;
        this.umbral = Math.max(umbral, minimo + 1e-3);
        const rampa = Math.max((p999 - minimo) * 0.04, 1e-3);
        const { opacidad, colores } = this.preset;

        this.opacidad.removeAllPoints();
        this.opacidad.addPoint(minimo, 0);
        this.opacidad.addPoint(this.umbral, 0);
        this.opacidad.addPoint(this.umbral + rampa, opacidad * 0.7);
        this.opacidad.addPoint(this.umbral + rampa * 3, opacidad);
        this.opacidad.addPoint(Math.max(maximo, this.umbral + rampa * 4), opacidad);

        this.color.removeAllPoints();
        this.color.addRGBPoint(this.umbral, ...colores[0]);
        this.color.addRGBPoint(this.umbral + rampa * 2, ...colores[1]);
        this.color.addRGBPoint(Math.max(maximo, this.umbral + rampa * 4), ...colores[2]);

        this.renderWindow.render();
    }

    /** Vista de frente (como si se mirase la cara del paciente), superior arriba. */
    restablecerCamara() {
        const centro = this.volumen.dims.map((n, eje) => (n * this.volumen.espaciado[eje]) / 2);
        const camara = this.renderer.getActiveCamera();
        // "Arriba" antes de mirar por -Y: si no, coincide un momento con el
        // "arriba" por defecto (+Y) y vtk.js avisa de que lo reinicia.
        camara.setFocalPoint(...centro);
        camara.setViewUp(0, 0, 1);
        camara.setPosition(centro[0], centro[1] - 1, centro[2]);   // anterior = -Y
        this.renderer.resetCamera();
        camara.zoom(1.2);
        this.renderWindow.render();
    }

    destruir() {
        this.observador.disconnect();
        this.cubo?.delete();
        this.ventana.delete();
    }
}

/**
 * Cubo con las letras de orientación en una esquina, que gira con el volumen.
 * Los ejes del volumen ya son LPS (x hacia la izquierda del paciente, y hacia
 * posterior, z hacia superior: ver lectorDicom.worker.js), así que las caras
 * llevan las mismas letras que los cortes. Si esta versión de vtk.js no trae
 * el widget, el 3D sigue igual sin cubo.
 */
function crearCuboOrientacion(interactor) {
    try {
        const cubo = vtk.Rendering.Core.vtkAnnotatedCubeActor.newInstance();
        cubo.setDefaultStyle({
            fontStyle: "bold",
            fontFamily: "Arial",
            fontColor: "#e6e9f0",
            fontSizeScale: (resolucion) => resolucion / 2,
            faceColor: "#1b2230",
            edgeThickness: 0.08,
            edgeColor: "#5b6475",
            resolution: 400,
        });
        cubo.setXPlusFaceProperty({ text: "L" });
        cubo.setXMinusFaceProperty({ text: "R" });
        cubo.setYPlusFaceProperty({ text: "P" });
        cubo.setYMinusFaceProperty({ text: "A" });
        cubo.setZPlusFaceProperty({ text: "S" });
        cubo.setZMinusFaceProperty({ text: "I" });

        const Widget = vtk.Interaction.Widgets.vtkOrientationMarkerWidget;
        const widget = Widget.newInstance({ actor: cubo, interactor });
        widget.setEnabled(true);
        widget.setViewportCorner(Widget.Corners.BOTTOM_RIGHT);
        widget.setViewportSize(0.14);
        widget.setMinPixelSize(64);
        widget.setMaxPixelSize(104);
        return widget;
    } catch (error) {
        console.warn("Cubo de orientación no disponible:", error);
        return null;
    }
}
