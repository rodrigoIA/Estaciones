# Estaciones

Aplicación web educativa sobre el Sol, la Tierra, las estaciones y los horarios solares de Santiago de Chile.

Sitio publicado con GitHub Pages:

https://rodrigoia.github.io/Estaciones/

## Qué incluye

- Gráfico anual de salida y puesta del Sol para Santiago de Chile.
- Franja de duración del día.
- Tabla diaria desde el inicio del otoño astronómico.
- Simulador 3D WebGL del sistema Sol-Tierra.
- Controles para posición orbital anual y rotación diaria.
- Visualización de radiación directa por hemisferio.
- PWA instalable en iPhone, Android y escritorio.
- Funcionamiento offline después de la primera carga.

## Criterio horario

Los horarios se muestran en hora comparable UTC−4. Este criterio evita un salto visual por cambios de horario y permite comparar la evolución anual de forma continua.

## Desarrollo local

Sirve la raíz del proyecto con un servidor HTTP; no abras `index.html` con `file://`.

```bash
python3 -m http.server 8000
```

Luego abre:

```text
http://localhost:8000/
```

## Pruebas básicas

- Confirmar que carga `index.html`.
- Confirmar que carga `manifest.webmanifest`.
- Confirmar que carga `sw.js`.
- Confirmar que no hay errores de sintaxis JavaScript.
- Confirmar que aparece el gráfico anual.
- Confirmar que aparece el simulador WebGL.
- Probar sliders de fecha orbital y rotación diaria.
- Probar botones de vista y animaciones.
- Probar ancho móvil aproximado de 375 px.
- Recargar después de la primera carga para validar caché PWA.

## Nota sobre actualizaciones PWA

El Service Worker usa caché versionada. Si el navegador conserva una versión anterior, recarga una o dos veces la página o elimina los datos del sitio para forzar la nueva versión.