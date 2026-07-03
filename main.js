const { app, BrowserWindow, screen, ipcMain, Menu, clipboard } = require('electron');
const path = require('path');
const robot = require('robotjs');

// Ajustes específicos por sistema operativo para rendimiento y compatibilidad gráfica
if (process.platform === 'win32') {
    // Modo de compatibilidad en Windows: usar los drivers gráficos nativos Direct3D 11 de Windows vía ANGLE.
    // Esto asegura el máximo rendimiento y estabilidad gráfica evitando traductores OpenGL deficientes.
    app.commandLine.appendSwitch('use-angle', 'd3d11');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-features', 'D3D11VideoDecoder,D3D11VideoProcessor,CanvasOopRasterization');
} else if (process.platform === 'linux') {
    // Optimización máxima de hardware y rendimiento de GPU en Linux
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
    app.commandLine.appendSwitch('enable-native-gpu-memory-buffers');
    
    // Autodetectar el servidor de pantalla (Wayland o X11) para ejecutar la ventana en modo nativo 
    // y reducir la latencia de entrada y los recursos gráficos al evitar la traducción de XWayland.
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    
    // Habilitar la decodificación de vídeo por hardware VA-API y rasterización Out-of-Process (OOP)
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,CanvasOopRasterization,VaapiVideoEncoder');
    
    // Habilitar efectos visuales transparentes acelerados por hardware en gestores de ventanas de Linux
    app.commandLine.appendSwitch('enable-transparent-visuals');
} else {
    // Ajustes por defecto para otros sistemas (como macOS)
    app.commandLine.appendSwitch('ignore-gpu-blacklist');
    app.commandLine.appendSwitch('enable-gpu-rasterization');
    app.commandLine.appendSwitch('enable-zero-copy');
}

app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); 
app.commandLine.appendSwitch('audio-service-quit-timeout-ms', '5184000000'); 

let mainWindow;

function createWindow() {
    Menu.setApplicationMenu(null);
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    mainWindow = new BrowserWindow({
        width: width, height: height, x: 0, y: 0,
        transparent: true, frame: false, alwaysOnTop: true,
        skipTaskbar: true, hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false,
            sandbox: false, webSecurity: false 
        }
    });

    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, options);
    });

    // Control de RobotJS
    ipcMain.on('move-mouse', (event, x, y) => { robot.moveMouse(x, y); });
    ipcMain.on('mouse-click', (event, action) => {
        if (action === 'down') robot.mouseToggle('down', 'left');
        else if (action === 'up') robot.mouseToggle('up', 'left');
        else if (action === 'right') robot.mouseClick('right');
        else robot.mouseClick('left');
    });

    ipcMain.on('type-string', (event, text) => {
        console.log(`Main [DEBUG]: Intentando escribir -> "${text}"`);
        if (!text || text.trim() === "") return;

        try {
            mainWindow.setIgnoreMouseEvents(true, { forward: true });
            mainWindow.blur();
            robot.typeString(text);
        } catch (err) {
            console.error('Main [ERROR]: Fallo crítico al escribir:', err);
        }
    });

    let isListeningInRenderer = false;
    ipcMain.on('listening-state', (event, state) => {
        isListeningInRenderer = state;
    });

    ipcMain.on('scroll-mouse', (event, amount) => { robot.scrollMouse(0, amount); });
    ipcMain.on('key-tap', (event, key, modifier) => { 
        try {
            if (modifier) robot.keyTap(key, modifier);
            else robot.keyTap(key);
        } catch (err) {
            console.error('Main [ERROR]: Fallo en key-tap:', err);
        }
    });

    mainWindow.webContents.session.setPermissionCheckHandler(() => true);
    mainWindow.webContents.session.setPermissionRequestHandler((wc, p, cb) => cb(true));
    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    setTimeout(createWindow, 500);
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
