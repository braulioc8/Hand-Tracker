const { app, BrowserWindow, screen, ipcMain, Menu } = require('electron');
const path = require('path');
const robot = require('robotjs');

// Ajustes para Linux y Optimización de Rendimiento
app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
// Quitamos la restricción de CPU para el video para permitir aceleración si está disponible
// app.commandLine.appendSwitch('disable-accelerated-video-decode');
// app.commandLine.appendSwitch('disable-accelerated-video-encode');


function createWindow() {
    // Quitar menú superior (File, Edit, etc)
    Menu.setApplicationMenu(null);

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    const win = new BrowserWindow({
        width: width,
        height: height,
        x: 0,
        y: 0,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });

    // Permitir click-through inicial
    win.setIgnoreMouseEvents(true, { forward: true });

    ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.setIgnoreMouseEvents(ignore, options);
    });

    // Control de RobotJS
    ipcMain.on('move-mouse', (event, x, y) => {
        robot.moveMouse(x, y);
    });

    ipcMain.on('mouse-click', (event, action) => {
        if (action === 'down') robot.mouseToggle('down', 'left');
        else if (action === 'up') robot.mouseToggle('up', 'left');
        else if (action === 'right') robot.mouseClick('right');
        else robot.mouseClick('left');
    });

    ipcMain.on('key-tap', (event, key) => {
        robot.keyTap(key);
    });

    ipcMain.on('type-string', (event, text) => {
        robot.typeString(text);
    });

    ipcMain.on('scroll-mouse', (event, amount) => {
        robot.scrollMouse(0, amount);
    });

    // Forzar permisos de cámara
    win.webContents.session.setPermissionCheckHandler(() => true);
    win.webContents.session.setPermissionRequestHandler((wc, p, cb) => cb(true));

    win.loadFile('index.html');
}

app.whenReady().then(() => {
    setTimeout(createWindow, 500);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
