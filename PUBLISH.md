# Guía de Publicación en Microsoft Store - Hand Tracker App

Para publicar tu aplicación en la Microsoft Store desde Linux, sigue estos pasos:

## 1. Cuenta de Desarrollador de Microsoft
1. Regístrate en el [Partner Center de Microsoft](https://partner.microsoft.com/dashboard).
2. Paga la cuota única de registro (aprox. $19 USD para individuos).
3. En el panel, selecciona **"Crear una nueva aplicación"** y reserva el nombre **"Hand Tracker App"** (o el que prefieras).

## 2. Configuración de Identidad
Una vez reservado el nombre, ve a **Product Management > Product Identity** y copia los siguientes valores a tu archivo `forge.config.js`:

- **Package Family Name (PFN)** -> `packageName`
- **Package Relative Id** -> `identityName`
- **Publisher Identity** -> `publisher` (Formato: `CN=...`)
- **Publisher Display Name** -> `publisherDisplayName`

## 3. Preparación de Iconos (Assets)
La Microsoft Store requiere iconos específicos en formato PNG. Debes crear una carpeta (ej. `assets/store`) con los siguientes tamaños:
- `Square44x44Logo.png`
- `Square150x150Logo.png`
- `Wide310x150Logo.png`
- `StoreLogo.png` (50x50)
- `BadgeLogo.png` (24x24, blanco y negro/transparente)

También necesitas un archivo `.ico` para el ejecutable principal.

## 4. Empaquetado (Desde Linux)
Como estás en Linux, tienes dos opciones principales:

### Opción A: GitHub Actions (Recomendado)
He preparado una configuración básica para que GitHub compile la aplicación automáticamente cada vez que subas código. Esto evita que necesites instalar Windows o el Windows SDK localmente.

### Opción B: Máquina Virtual o Dual Boot
Necesitarás Windows 10/11 con el **Windows SDK** instalado para ejecutar `npm run make` con el target de AppX.

## 5. Subida al Partner Center
Una vez generado el archivo `.appx` o `.msix`:
1. Ve a tu aplicación en el Partner Center.
2. Crea un nuevo **"Submission"**.
3. Sube el archivo generado.
4. Completa la descripción, capturas de pantalla y clasificación de edad.
5. Envía a revisión.

---
*Nota: Dado que la aplicación usa `robotjs` para controlar el ratón, es posible que Microsoft haga preguntas adicionales sobre seguridad durante la revisión.*
