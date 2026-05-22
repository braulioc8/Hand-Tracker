# Hand Tracker App - Kinect Style

## Descripción
Este proyecto es un seguidor de manos avanzado inspirado en la tecnología Kinect. Utiliza MediaPipe y Three.js (en su versión inicial) para detectar gestos y movimientos, con el objetivo final de controlar la computadora mediante la cámara.

## Objetivos del Proyecto
- **Control de PC:** Implementar un sistema que traduzca gestos manuales en acciones del sistema operativo (clics, scroll, navegación).
- **Superposición (Overlay):** La aplicación debe ejecutarse como una capa transparente sobre el escritorio.
- **Indicador de Estado:** Un widget en la esquina superior derecha que muestre:
  - Activado / Desactivado.
  - Calidad de visión (Buena / Mala).
- **Interfaz Kinect:** Mostrar un ícono interactivo (tipo mano de Kinect) sobre el escritorio cuando se detecte una mano.

## Gestos Definidos
- **Seleccionar:** Cerrar la mano (puño o pellizco).
- **Scroll:** Arrastrar con ambas manos simultáneamente.
- **Navegación:** Movimientos laterales o verticales para mover el cursor.

## Tecnologías Principales
- **Frontend:** HTML5, CSS3, JavaScript (ES6+).
- **Visión Artificial:** MediaPipe Hands.
- **Renderizado 3D/UI:** Three.js (para efectos visuales).
- **Integración de Escritorio:** (Pendiente de implementación) Se sugiere Electron para capacidades de superposición y acceso al sistema.

## Estructura de Archivos
- `index.html`: Estructura base de la interfaz.
- `main.js`: Lógica de detección de manos e interacción.
- `style.css`: Estilos de la aplicación y el overlay.
- `models/`: Modelos 3D utilizados para la representación visual.

## Plan de Evolución: Herramientas de Texto Inteligentes
### Fase 1: Menú de Contexto de Texto
- Implementar un mini-menú flotante que aparezca tras un clic (pinch) prolongado o mediante un botón dedicado cerca del cursor.
- El menú contendrá dos iconos: Borrar (Retroceso) y Micrófono (Dictado).

### Fase 2: Lógica de Borrado Progresivo
- **Tap:** Envía un comando `backspace` al sistema.
- **Hold (Dwell):** Activa un bucle que repite el comando `backspace` cada 100ms hasta que se suelte la mano.

### Fase 3: Dictado por Voz (STT)
- Integrar la **Web Speech API** en el renderer.
- Al activar el micrófono, la app escuchará y convertirá la voz en texto.
- El texto se enviará al sistema operativo mediante `robotjs.typeString()` en tiempo real o al finalizar la frase.

### Fase 4: Diseño de Accesibilidad
- Iconos de alto contraste (Blanco/Negro).
- Feedback visual de "Escuchando..." mediante ondas o cambios de color.
- Temporizadores visuales (anillos) consistentes con el sistema de clics.

## Guía de Desarrollo
- Mantener la latencia baja para una experiencia fluida.
- Asegurar que el overlay no bloquee los clics reales del usuario cuando no se están realizando gestos.
- Priorizar la claridad visual del indicador de estado.
