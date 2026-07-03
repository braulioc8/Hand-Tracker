const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

let handLandmarker;
let HandLandmarkerClass;
let drawingUtils;
let video = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

// UI Elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const kinectHand = document.getElementById('kinect-hand');
const statusIndicator = document.getElementById('status-indicator');
const appMenu = document.getElementById('app-menu');
const resumeBtn = document.getElementById('resume-btn');
const demoBtn = document.getElementById('demo-btn');
const demoContainer = document.getElementById('demo-container');
const menuExitBtn = document.getElementById('menu-exit-btn');
const scrollOverlay = document.getElementById('scroll-overlay');
const textTools = document.getElementById('text-tools');
const deleteBtn = document.getElementById('delete-btn');
const micBtn = document.getElementById('mic-btn');
const scrollBarFill = document.getElementById('scroll-bar-fill');
const scrollValueText = document.getElementById('scroll-value-text');

// Vosk Bridge (Local Logic)
const Vosk = require('vosk-browser');
let voskModel = null;
let voskRecognizer = null;
let audioContextMain = null;
let analyserMain = null;
let dataArrayMain = null;
let animationIdMain = null;
let processorSTT = null;
let isModelLoading = false;

// Interaction state
let lastVideoTime = -1;
let isPinching = false;
let isMenuOpen = false;
let isDemoMode = false;
let isVoiceVisualizerEnabled = true;

// Click Dwell Timer
let clickTimer = null;
const DWELL_TIME = 500; 

// Continuous Scroll
let isScrolling = false;
let scrollBaseY = 0;
let scrollVelocity = 0;
let lastScrollTime = 0;
const SCROLL_SPEED_LIMITER = 10; 

// Precision Mode
let isPrecisionMode = false;
let velocityBuffer = [];
const VELOCITY_WINDOW = 10;
const PRECISION_VELOCITY_THRESHOLD = 0.004;

// Still Hand Detection (Menu)
let stillFrameCount = 0;
const STILL_THRESHOLD = 0.01; 
const FRAMES_TO_OPEN = 45; 
let lastPalmPositions = [];

// Text Tools Logic
let deleteInterval = null;
let deleteDwellTimer = null;
let micDwellTimer = null;
let micLeaveTimeout = null;
let isListening = false;
let textToolsTimeout = null;
const TOOLS_DISMISS_DIST = 150;
const TOOLS_EXPAND_DIST = 80;

// Lógica de Dictado (Estado y Resultados)
let lastTypedTranscript = '';

// Smoothing (LERP)
let currentPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let targetPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let currentLerpFactor = 0.15;
const NORMAL_LERP = 0.15;
const PRECISION_LERP = 0.04;
const margin = 0.15;

// i18n
const translations = {
    es: {
        settings_title: "Configuración", language_label: "Idioma", camera_label: "Cámara de Entrada", mic_label: "Micrófono",
        sensitivity_label: "Sensibilidad del Cursor", save_btn: "Guardar y Cerrar", status_searching: "Buscando manos...",
        status_active: "Control activo", status_listening: "Escuchando...", status_scroll: "Modo Scroll",
        status_precision: "Modo Precisión", status_menu: "Menú", settings_btn: "Configuración", demo_btn: "Demostración",
        exit_btn: "Salir de la App", continue_btn: "Continuar", precision_label: "Precisión", menu_hint: "Cierra ambos puños para el menú",
        show_demo_label: "Mostrar Vista de Seguimiento", show_voice_label: "Mostrar Visualizador de Voz"
    },
    en: {
        settings_title: "Settings", language_label: "Language", camera_label: "Input Camera", mic_label: "Microphone",
        sensitivity_label: "Cursor Sensitivity", save_btn: "Save and Close", status_searching: "Searching for hands...",
        status_active: "Control active", status_listening: "Listening...", status_scroll: "Scroll Mode",
        status_precision: "Precision Mode", status_menu: "Menu", settings_btn: "Settings", demo_btn: "Demo Mode",
        exit_btn: "Exit App", continue_btn: "Continue", precision_label: "Precision", menu_hint: "Close both fists for menu",
        show_demo_label: "Show Tracking View", show_voice_label: "Show Voice Visualizer"
    }
};

let currentLanguage = 'es';

const DEFAULT_SETTINGS = {
    language: 'es',
    sensitivity: 0.15,
    showStatusText: false,
    showDemoView: false,
    showVoiceVisualizer: true,
    cameraDevice: '',
    micDevice: ''
};

let appSettings = { ...DEFAULT_SETTINGS };

function loadSettings() {
    try {
        const saved = localStorage.getItem('gesto_settings');
        if (saved) {
            appSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('Failed to load settings', e);
    }
    
    currentLanguage = appSettings.language;
    currentLerpFactor = appSettings.sensitivity;
    isDemoMode = appSettings.showDemoView;
    isVoiceVisualizerEnabled = appSettings.showVoiceVisualizer;
    
    updateLanguage(currentLanguage);
    document.getElementById('language-select').value = currentLanguage;
    document.getElementById('sensitivity-range').value = currentLerpFactor;
    document.getElementById('show-status-text').checked = appSettings.showStatusText;
    document.getElementById('show-demo-view').checked = isDemoMode;
    document.getElementById('show-voice-visualizer').checked = isVoiceVisualizerEnabled;
    
    if (appSettings.showStatusText) statusText.classList.add('visible'); 
    else if (!isListening) statusText.classList.remove('visible');
    
    demoContainer.classList.toggle('active', isDemoMode);
    demoBtn.innerText = isDemoMode ? (currentLanguage === 'es' ? 'Ocultar Demo' : 'Hide Demo') : (currentLanguage === 'es' ? 'Demostración' : 'Demo Mode');
}

function saveAppSettings() {
    appSettings.language = document.getElementById('language-select').value;
    appSettings.sensitivity = parseFloat(document.getElementById('sensitivity-range').value);
    appSettings.showStatusText = document.getElementById('show-status-text').checked;
    appSettings.showDemoView = document.getElementById('show-demo-view').checked;
    appSettings.showVoiceVisualizer = document.getElementById('show-voice-visualizer').checked;
    appSettings.cameraDevice = document.getElementById('camera-select').value;
    appSettings.micDevice = document.getElementById('mic-select').value;
    
    try {
        localStorage.setItem('gesto_settings', JSON.stringify(appSettings));
    } catch (e) {
        console.error('Failed to save settings', e);
    }
    
    currentLanguage = appSettings.language;
    currentLerpFactor = appSettings.sensitivity;
    isDemoMode = appSettings.showDemoView;
    isVoiceVisualizerEnabled = appSettings.showVoiceVisualizer;
    
    if (appSettings.showStatusText) statusText.classList.add('visible'); 
    else if (!isListening) statusText.classList.remove('visible');
    
    demoContainer.classList.toggle('active', isDemoMode);
    demoBtn.innerText = isDemoMode ? (currentLanguage === 'es' ? 'Ocultar Demo' : 'Hide Demo') : (currentLanguage === 'es' ? 'Demostración' : 'Demo Mode');
    
    setupWebcam(appSettings.cameraDevice);
}

function updateLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) el.innerText = translations[lang][key];
    });
    document.getElementById('settings-btn').innerText = translations[lang].settings_btn;
    document.getElementById('demo-btn').innerText = translations[lang].demo_btn;
    document.getElementById('menu-exit-btn').innerText = translations[lang].exit_btn;
    document.getElementById('resume-btn').innerText = translations[lang].continue_btn;
    document.getElementById('menu-hint').innerText = translations[lang].menu_hint;
}

async function enumerateDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameraSelect = document.getElementById('camera-select');
        const micSelect = document.getElementById('mic-select');
        cameraSelect.innerHTML = ''; micSelect.innerHTML = '';
        let videoDevicesCount = 0;
        devices.forEach(device => {
            if (device.kind === 'videoinput') {
                const option = document.createElement('option');
                option.value = device.deviceId; option.text = device.label || `Cámara ${cameraSelect.length + 1}`;
                cameraSelect.appendChild(option); videoDevicesCount++;
            } else if (device.kind === 'audioinput') {
                const option = document.createElement('option');
                option.value = device.deviceId; option.text = device.label || `Micrófono ${micSelect.length + 1}`;
                micSelect.appendChild(option);
            }
        });
        if (videoDevicesCount === 0) showCameraError();
        
        if (appSettings.cameraDevice) {
            cameraSelect.value = appSettings.cameraDevice;
        }
        if (appSettings.micDevice) {
            micSelect.value = appSettings.micDevice;
        }
    } catch (err) { console.error(err); showCameraError(); }
}

function showCameraError() {
    const errorModal = document.getElementById('camera-error-modal');
    if (errorModal) { errorModal.classList.remove('hidden'); ipcRenderer.send('set-ignore-mouse-events', false); }
}

function hideCameraError() {
    const errorModal = document.getElementById('camera-error-modal');
    if (errorModal) { errorModal.classList.add('hidden'); if (!isMenuOpen) ipcRenderer.send('set-ignore-mouse-events', true, { forward: true }); }
}

const voiceVisualizer = document.getElementById('voice-visualizer');
const waveformCanvas = document.getElementById('waveform-canvas');
const waveformCtx = waveformCanvas.getContext('2d');

const micWaveCanvas = document.getElementById('mic-wave-canvas');
const micWaveCtx = micWaveCanvas.getContext('2d');

async function initVosk() {
    if (voskModel || isModelLoading) return;
    isModelLoading = true;
    try {
        console.log('Renderer [DEBUG]: initVosk() triggered - Blob Strategy');
        statusText.innerText = "CARGANDO MOTOR...";
        statusText.classList.add('visible');

        // En Electron Renderer, __dirname puede fallar. Usamos process.cwd() o '.'
        const zipPath = path.join(process.cwd(), 'models', 'model.zip');
        console.log('Renderer [DEBUG]: Reading ZIP from:', zipPath);

        if (!fs.existsSync(zipPath)) {
            throw new Error(`Archivo no encontrado: ${zipPath}`);
        }

        // Leer el archivo físicamente (Bypasseamos fetch)
        const buffer = fs.readFileSync(zipPath);
        const blob = new Blob([buffer], { type: 'application/zip' });
        const modelUrl = URL.createObjectURL(blob);
        
        console.log('Renderer [DEBUG]: ZIP converted to Blob URL. Starting Vosk creation...');
        
        // Timeout de seguridad de 15 segundos
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout al cargar el motor")), 15000)
        );

        voskModel = await Promise.race([
            Vosk.createModel(modelUrl),
            timeoutPromise
        ]); 
        
        console.log('Renderer [DEBUG]: Vosk loaded successfully');
        statusText.innerText = "MOTOR LISTO";
        
        // Liberar el Blob URL para ahorrar memoria
        URL.revokeObjectURL(modelUrl);

        setTimeout(() => { if (!isListening) statusText.classList.remove('visible'); }, 2000);
    } catch (err) {
        console.error('Renderer [ERROR]: Fallo crítico en initVosk:', err);
        statusText.innerText = "ERROR MOTOR VOZ";
        isModelLoading = false;
        // Si falla el Blob, el usuario verá el error en el status
    } finally {
        isModelLoading = false;
    }
}

async function init() {
    try {
        console.log('Renderer [DEBUG]: Starting init()...');
        loadSettings(); 
        await enumerateDevices(); 
        await setupHandTracking(); 
        setupWebcam(appSettings.cameraDevice || null); 
        setupEventListeners();

        console.log('Renderer [DEBUG]: Pre-loading STT Motor...');
        initVosk().catch(err => {
            console.error('Renderer [ERROR]: initVosk silent failure:', err);
        });

        const retryBtn = document.getElementById('retry-camera-btn');
        if (retryBtn) retryBtn.onclick = () => { hideCameraError(); init(); };
    } catch (error) { 
        console.error('Renderer [CRITICAL ERROR] in init:', error); 
        window.onerror(error.message, 'renderer.js', 0, 0, error);
        showCameraError(); 
    }
}

const sensitivityRange = document.getElementById('sensitivity-range');
const saveSettings = document.getElementById('save-settings');
const showDemoViewCheckbox = document.getElementById('show-demo-view');
const showVoiceVisualizerCheckbox = document.getElementById('show-voice-visualizer');

function setupEventListeners() {
    const interactiveElements = [kinectHand, statusIndicator, appMenu, textTools, document.getElementById('settings-modal')];
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => ipcRenderer.send('set-ignore-mouse-events', false));
        el.addEventListener('mouseleave', () => {
            if (!isMenuOpen && !isListening && document.getElementById('settings-modal').classList.contains('hidden')) {
                ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
            }
        });
    });

    resumeBtn.addEventListener('click', () => toggleMenu(false));
    document.getElementById('settings-btn').addEventListener('click', () => { 
        enumerateDevices(); 
        document.getElementById('show-demo-view').checked = isDemoMode;
        document.getElementById('show-voice-visualizer').checked = isVoiceVisualizerEnabled;
        document.getElementById('settings-modal').classList.remove('hidden'); 
    });
    document.getElementById('language-select').addEventListener('change', (e) => updateLanguage(e.target.value));

    saveSettings.addEventListener('click', () => {
        saveAppSettings();
        document.getElementById('settings-modal').classList.add('hidden');
    });

    demoBtn.addEventListener('click', () => { 
        isDemoMode = !isDemoMode; 
        demoContainer.classList.toggle('active', isDemoMode); 
        demoBtn.innerText = isDemoMode ? (currentLanguage === 'es' ? 'Ocultar Demo' : 'Hide Demo') : (currentLanguage === 'es' ? 'Demostración' : 'Demo Mode'); 
        appSettings.showDemoView = isDemoMode;
        try { localStorage.setItem('gesto_settings', JSON.stringify(appSettings)); } catch(e){}
        toggleMenu(false); 
    });
    menuExitBtn.addEventListener('click', () => window.close());

    deleteBtn.addEventListener('mouseenter', () => {
        resetTextToolsTimeout(); deleteBtn.classList.add('dwell-active');
        deleteDwellTimer = setTimeout(() => { ipcRenderer.send('key-tap', 'backspace'); deleteInterval = setInterval(() => ipcRenderer.send('key-tap', 'backspace'), 100); }, 800);
    });
    deleteBtn.addEventListener('mouseleave', () => { deleteBtn.classList.remove('dwell-active'); clearTimeout(deleteDwellTimer); clearInterval(deleteInterval); deleteDwellTimer = null; deleteInterval = null; });

    micBtn.addEventListener('mouseenter', () => {
        if (micLeaveTimeout) { clearTimeout(micLeaveTimeout); micLeaveTimeout = null; }
        resetTextToolsTimeout();
        if (!isListening && !micDwellTimer) {
            micBtn.classList.add('dwell-active');
            micDwellTimer = setTimeout(() => { startListening(); micBtn.classList.remove('dwell-active'); micDwellTimer = null; }, 1000);
        }
    });
    micBtn.addEventListener('mouseleave', () => {
        micLeaveTimeout = setTimeout(() => {
            if (micDwellTimer) { clearTimeout(micDwellTimer); micDwellTimer = null; }
            micBtn.classList.remove('dwell-active'); if (isListening) stopListening(); micLeaveTimeout = null;
        }, 200);
    });

    textTools.addEventListener('mousemove', resetTextToolsTimeout);
    textTools.addEventListener('mouseenter', () => ipcRenderer.send('set-ignore-mouse-events', false));
    textTools.addEventListener('mouseleave', () => { if (!isMenuOpen && !isListening && textTools.classList.contains('collapsed')) ipcRenderer.send('set-ignore-mouse-events', true, { forward: true }); });
}

let toolsCenter = { x: 0, y: 0 };
function resetTextToolsTimeout() {
    if (textToolsTimeout) clearTimeout(textToolsTimeout);
    textToolsTimeout = setTimeout(() => { if (!isListening && !deleteInterval) hideTextTools(); }, 5000); 
}
function hideTextTools() { textTools.classList.add('hidden'); textTools.classList.add('collapsed'); }

async function startListening() {
    if (isListening) return;
    try {
        console.log('Renderer [DEBUG]: startListening() init');
        if (!voskModel) {
            console.log('Renderer [DEBUG]: Model not loaded, trying to load...');
            statusText.innerText = "CARGANDO MOTOR...";
            statusText.classList.add('visible');
            await initVosk();
        }
        if (!voskModel) {
            console.error('Renderer [ERROR]: Model still not loaded after attempt');
            throw new Error("Vosk failed to load");
        }

        isListening = true;
        micBtn.classList.add('listening');
        statusText.innerText = "ESCUCHANDO...";
        statusText.classList.add('visible');
        ipcRenderer.send('listening-state', true);
        resetTextToolsTimeout();

        // 1. Obtener stream de audio
        const micId = document.getElementById('mic-select').value;
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                deviceId: micId ? { exact: micId } : undefined,
                echoCancellation: true, 
                noiseSuppression: true, 
                channelCount: 1
            } 
        });

        // 2. Crear AudioContext y detectar SampleRate real
        audioContextMain = new (window.AudioContext || window.webkitAudioContext)();
        const sampleRate = audioContextMain.sampleRate;
        console.log('Renderer [DEBUG]: AudioContext SampleRate:', sampleRate);

        const source = audioContextMain.createMediaStreamSource(stream);

                // 3. Visualización (Barras)
        analyserMain = audioContextMain.createAnalyser();
        analyserMain.fftSize = 64;
        source.connect(analyserMain);
        dataArrayMain = new Uint8Array(analyserMain.frequencyBinCount);
        if (isVoiceVisualizerEnabled) {
            voiceVisualizer.classList.remove('hidden');
            drawMicWaveUnified();
        } else {
            voiceVisualizer.classList.add('hidden');
        }

        // 4. Inicializar Recognizer con el SampleRate REAL del sistema
        console.log('Renderer [DEBUG]: Creating KaldiRecognizer at', sampleRate, 'Hz');
        voskRecognizer = new voskModel.KaldiRecognizer(sampleRate);
        
        voskRecognizer.on("result", (message) => {
            console.log('Renderer [VOSK]: Result Message:', message);
            const text = message.result.text;
            if (text && text.trim()) {
                console.log(`Renderer [VOSK]: Final -> "${text}"`);
                ipcRenderer.send('type-string', text + ' ');
                statusText.innerText = text.toUpperCase().substring(0, 30);
            }
        });

        voskRecognizer.on("partialresult", (message) => {
            const partial = message.result.partial;
            if (partial && partial.trim()) {
                statusText.innerText = partial.toUpperCase().substring(0, 30);
            }
        });

        // 5. Procesador de Audio
        processorSTT = audioContextMain.createScriptProcessor(4096, 1, 1);
        let audioLevelCounter = 0;
        
        processorSTT.onaudioprocess = (event) => { 
            if (isListening && voskRecognizer) {
                const inputData = event.inputBuffer.getChannelData(0);
                
                // Debug de nivel de audio cada ~1 segundo
                if (audioLevelCounter % 10 === 0) {
                    let sum = 0;
                    for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
                    const rms = Math.sqrt(sum/inputData.length);
                    if (rms > 0.001) {
                        // Solo loguear si hay sonido real
                        // console.log('Renderer [DEBUG]: Audio data flowing, level:', rms.toFixed(4));
                    }
                }
                audioLevelCounter++;

                voskRecognizer.acceptWaveform(event.inputBuffer); 
            }
        };

        source.connect(processorSTT);
        processorSTT.connect(audioContextMain.destination); // Importante para que el procesador no se suspenda
        
        console.log('Renderer [DEBUG]: Pipeline de voz completado.');
        ipcRenderer.send('set-ignore-mouse-events', false);

    } catch (err) {
        console.error('Renderer [ERROR] startListening failed:', err);
        statusText.innerText = "ERROR DE AUDIO";
        isListening = false;
        micBtn.classList.remove('listening');
    }
}

function stopListening() {
    isListening = false;
    micBtn.classList.remove('listening');
    statusText.innerText = translations[currentLanguage].status_active;
    if (!document.getElementById('show-status-text').checked) statusText.classList.remove('visible');
    if (processorSTT) { try { processorSTT.disconnect(); } catch(e){} processorSTT = null; }
    if (animationIdMain) cancelAnimationFrame(animationIdMain);
    if (audioContextMain) { try { audioContextMain.close(); } catch(e){} audioContextMain = null; }
    if (voskRecognizer) { try { voskRecognizer.remove(); } catch(e){} voskRecognizer = null; }
    voiceVisualizer.classList.add('hidden');
    ipcRenderer.send('listening-state', false);
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    resetTextToolsTimeout();
}

function drawMicWaveUnified() {
    if (!isListening || !analyserMain) return;
    animationIdMain = requestAnimationFrame(drawMicWaveUnified);
    analyserMain.getByteFrequencyData(dataArrayMain);
    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    micWaveCtx.clearRect(0, 0, micWaveCanvas.width, micWaveCanvas.height);
    const barCount = 5; const barWidth = 14; const barGap = 28; const totalWidth = (barCount * barWidth) + ((barCount - 1) * barGap);
    const startX = (waveformCanvas.width - totalWidth) / 2; const centerY = waveformCanvas.height / 2;
    const micBarWidth = 4; const micBarGap = 4; const micTotalWidth = (barCount * micBarWidth) + ((barCount - 1) * micBarGap);
    const micStartX = (micWaveCanvas.width - micTotalWidth) / 2; const micCenterY = micWaveCanvas.height / 2;
    waveformCtx.fillStyle = '#ffffff'; micWaveCtx.fillStyle = '#00ff88';
    for (let i = 0; i < barCount; i++) {
        const centerIdx = Math.floor(barCount / 2); const distFromCenter = Math.abs(i - centerIdx);
        const centerFactor = Math.pow(0.65, distFromCenter * 2); const sampleIndex = distFromCenter * 4; const value = dataArrayMain[sampleIndex] / 255.0;
        const maxHeight = waveformCanvas.height - 4; const barHeight = 8 + (value * maxHeight * centerFactor);
        const x = startX + (i * (barWidth + barGap)); const y = centerY - (barHeight / 2);
        waveformCtx.beginPath(); waveformCtx.roundRect(x, y, barWidth, barHeight, 7); waveformCtx.fill();
        const micMaxHeight = micWaveCanvas.height - 20; const micBarHeight = 4 + (value * micMaxHeight * centerFactor);
        const micX = micStartX + (i * (micBarWidth + micBarGap)); const micY = micCenterY - (micBarHeight / 2);
        micWaveCtx.beginPath(); micWaveCtx.roundRect(micX, micY, micBarWidth, micBarHeight, 2); micWaveCtx.fill();
    }
}

function showTextTools(x, y) {
    if (textToolsTimeout) clearTimeout(textToolsTimeout); const offsetY = 50; toolsCenter = { x, y: y + offsetY };
    textTools.style.left = `${x - 22}px`; textTools.style.top = `${y + offsetY - 22}px`; textTools.classList.remove('hidden'); textTools.classList.add('collapsed');
    ipcRenderer.send('set-ignore-mouse-events', false); resetTextToolsTimeout();
}

function toggleMenu(show) {
    isMenuOpen = show;
    if (show) { appMenu.classList.add('active'); ipcRenderer.send('set-ignore-mouse-events', false); isScrolling = false; scrollOverlay.classList.add('hidden'); textTools.classList.add('hidden'); }
    else { appMenu.classList.remove('active'); ipcRenderer.send('set-ignore-mouse-events', true, { forward: true }); }
}

async function setupHandTracking() {
    const { HandLandmarker, FilesetResolver, DrawingUtils } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js");
    HandLandmarkerClass = HandLandmarker;
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
    drawingUtils = new DrawingUtils(canvasCtx);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`, delegate: "GPU" },
        runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: 0.6, minTrackingConfidence: 0.6
    });
}

function setupWebcam(deviceId = null) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Optimización de rendimiento: reducimos de 1280x720 (ideal) a 640x480.
        // Esto disminuye en un 66% la cantidad de píxeles cargados en GPU cada frame, mejorando
        // sustancialmente la latencia sin perder precisión de captura (MediaPipe escala a 256x256).
        const constraints = { 
            video: { 
                deviceId: deviceId ? { exact: deviceId } : undefined, 
                width: { ideal: 640 }, 
                height: { ideal: 480 },
                frameRate: { ideal: 30, max: 60 }
            } 
        };
        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            video.srcObject = stream;
            video.onloadedmetadata = () => { 
                video.play().then(() => {
                    canvasElement.width = video.videoWidth; canvasElement.height = video.videoHeight;
                    if (!animationStarted) { animationStarted = true; animate(); }
                }).catch(console.error);
            };
        }).catch(err => { if (deviceId) setupWebcam(null); });
    }
}

let animationStarted = false; let lastInferenceTime = 0; const INFERENCE_INTERVAL = 33; 
let fpsCount = 0;
let lastFpsTime = 0;
function animate() {
    const now = performance.now();
    
    fpsCount++;
    if (now - lastFpsTime >= 1000) {
        const fpsElement = document.getElementById('stat-fps');
        if (fpsElement) fpsElement.innerText = fpsCount;
        fpsCount = 0;
        lastFpsTime = now;
    }

    // Tolerancia de jitter (-4ms) para evitar saltos de fotograma por fase de requestAnimationFrame (60Hz vs 30FPS)
    if (handLandmarker && video.readyState >= 2 && (now - lastInferenceTime) >= (INFERENCE_INTERVAL - 4)) {
        if (video.currentTime !== lastVideoTime) {
            try { 
                const t0 = performance.now();
                const detections = handLandmarker.detectForVideo(video, now); 
                const t1 = performance.now();
                const latency = Math.round(t1 - t0);
                const latencyElement = document.getElementById('stat-latency');
                if (latencyElement) latencyElement.innerText = `${latency}ms`;

                handleInteractions(detections); 
                lastVideoTime = video.currentTime; 
                lastInferenceTime = now; 
            } catch (error) { console.error(error); }
        }
    }
    if (!isScrolling && !isMenuOpen) { currentPos.x += (targetPos.x - currentPos.x) * currentLerpFactor; currentPos.y += (targetPos.y - currentPos.y) * currentLerpFactor; updateKinectIconVisual(currentPos.x, currentPos.y); }
    if (isScrolling && Math.abs(scrollVelocity) > 0.5 && !isMenuOpen) { if (now - lastScrollTime > 50) { ipcRenderer.send('scroll-mouse', Math.round(scrollVelocity)); lastScrollTime = now; } }
    
    if (isScrolling) {
        if (scrollBarFill && scrollValueText) {
            const percentage = Math.min(100, Math.max(-100, (scrollVelocity / 3) * 100));
            if (percentage >= 0) {
                scrollBarFill.style.top = '50%';
                scrollBarFill.style.height = `${percentage / 2}%`;
                scrollBarFill.style.background = 'var(--accent)';
            } else {
                scrollBarFill.style.top = `${50 + percentage / 2}%`;
                scrollBarFill.style.height = `${Math.abs(percentage) / 2}%`;
                scrollBarFill.style.background = 'var(--accent-blue)';
            }
            scrollValueText.innerText = `${percentage > 0 ? '+' : ''}${Math.round(percentage)}%`;
        }
    }
    
    requestAnimationFrame(animate);
}

function handleInteractions(results) {
    if (isDemoMode) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        if (results.landmarks && results.landmarks.length > 0 && drawingUtils && HandLandmarkerClass) {
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(landmarks, HandLandmarkerClass.HAND_CONNECTIONS, {
                    color: "#00ff88",
                    lineWidth: 2
                });
                drawingUtils.drawLandmarks(landmarks, { color: "#0088ff", lineWidth: 1.5, radius: 3 });
            }
        }
    }
    const hands = results.landmarks; updateStatus(hands.length);
    if (hands.length === 0) { 
        if (isDemoMode) {
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        }
        cancelClick(); isScrolling = false; isPrecisionMode = false; scrollOverlay.classList.add('hidden'); return; 
    }
    if (!textTools.classList.contains('hidden')) {
        const hand = hands[0]; const indexPos = { x: scaleCoordinate(hand[8].x, window.innerWidth), y: scaleCoordinate(hand[8].y, window.innerHeight) };
        const distToTools = Math.sqrt(Math.pow(indexPos.x - toolsCenter.x, 2) + Math.pow(indexPos.y - toolsCenter.y, 2));
        if (distToTools > TOOLS_DISMISS_DIST) { hideTextTools(); if (!isMenuOpen && !isListening) ipcRenderer.send('set-ignore-mouse-events', true, { forward: true }); } 
        else if (distToTools < TOOLS_EXPAND_DIST) {
            if (textTools.classList.contains('collapsed')) { textTools.classList.remove('collapsed'); textTools.style.left = `${toolsCenter.x - 75}px`; textTools.style.top = `${toolsCenter.y - 45}px`; ipcRenderer.send('set-ignore-mouse-events', false); }
            resetTextToolsTimeout(); ipcRenderer.send('set-ignore-mouse-events', false); 
        }
    }
    if (hands.length === 2 && !isMenuOpen) {
        const h1 = hands[0]; const h2 = hands[1];
        if (h1[8].y > h1[5].y && h2[8].y > h2[5].y) {
            const currentPosMean = (h1[0].x + h2[0].x) / 2;
            if (lastPalmPositions.length > 0) { if (Math.abs(currentPosMean - lastPalmPositions[lastPalmPositions.length - 1]) < STILL_THRESHOLD) { stillFrameCount++; if (stillFrameCount > FRAMES_TO_OPEN) { toggleMenu(true); stillFrameCount = 0; } } else stillFrameCount = 0; }
            lastPalmPositions.push(currentPosMean); if (lastPalmPositions.length > 10) lastPalmPositions.shift();
        } else stillFrameCount = 0;
    } else stillFrameCount = 0;
    if (isMenuOpen) return;
    if (hands.length === 2) {
        cancelClick(); const currentMidY = (hands[0][0].y + hands[1][0].y) / 2;
        if (!isScrolling) { scrollBaseY = currentMidY; isScrolling = true; scrollOverlay.classList.remove('hidden'); kinectHand.classList.add('hidden'); textTools.classList.add('hidden'); }
        const offset = currentMidY - scrollBaseY; scrollVelocity = Math.abs(offset) > 0.05 ? offset * SCROLL_SPEED_LIMITER : 0; return; 
    }
    if (isScrolling) { isScrolling = false; scrollOverlay.classList.add('hidden'); kinectHand.classList.remove('hidden'); }
    const hand = hands[0]; const indexTip = hand[8]; const thumbTip = hand[4];
    const newTargetX = scaleCoordinate(indexTip.x, window.innerWidth); const newTargetY = scaleCoordinate(indexTip.y, window.innerHeight);
    const dx = newTargetX - targetPos.x; const dy = newTargetY - targetPos.y; const velocity = Math.sqrt(dx*dx + dy*dy) / window.innerWidth;
    velocityBuffer.push(velocity); if (velocityBuffer.length > VELOCITY_WINDOW) velocityBuffer.shift();
    const avgVelocity = velocityBuffer.reduce((a, b) => a + b, 0) / velocityBuffer.length;
    if (avgVelocity < PRECISION_VELOCITY_THRESHOLD && !isPinching) { if (!isPrecisionMode) { isPrecisionMode = true; kinectHand.classList.add('precision-active'); currentLerpFactor = PRECISION_LERP; } }
    else if (avgVelocity > PRECISION_VELOCITY_THRESHOLD * 2.5) { if (isPrecisionMode) { isPrecisionMode = false; kinectHand.classList.remove('precision-active'); currentLerpFactor = NORMAL_LERP; } }
    targetPos.x = newTargetX; targetPos.y = newTargetY;
    const dist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
    const isPalmUp = hand[4].x < hand[20].x; 
    if (dist < 0.05) { if (!isPinching) startClickTimer('left'); } 
    else if (isPalmUp && !isPinching) { if (thumbTip.x > indexTip.x + 0.05) startClickTimer('right'); else cancelClick(); } 
    else cancelClick();
    ipcRenderer.send('move-mouse', Math.round(currentPos.x), Math.round(currentPos.y));
}

function startClickTimer(type = 'left') {
    if (clickTimer) return; kinectHand.classList.add('timer-active'); if (type === 'right') kinectHand.classList.add('right-clicking');
    clickTimer = setTimeout(() => {
        ipcRenderer.send('mouse-click', type === 'right' ? 'right' : 'down'); isPinching = true; kinectHand.classList.remove('timer-active'); kinectHand.classList.add('selecting');
        if (type === 'right') kinectHand.classList.add('right-active'); if (type === 'left') showTextTools(currentPos.x, currentPos.y);
    }, DWELL_TIME);
}

function cancelClick() {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    if (isPinching) { ipcRenderer.send('mouse-click', 'up'); isPinching = false; }
    kinectHand.classList.remove('timer-active'); kinectHand.classList.remove('selecting'); kinectHand.classList.remove('right-clicking'); kinectHand.classList.remove('right-active');
}

function scaleCoordinate(val, maxDimension) { let scaled = (val - margin) / (1 - 2 * margin); if (maxDimension === window.innerWidth) scaled = 1 - scaled; scaled = Math.max(0, Math.min(1, scaled)); return scaled * maxDimension; }

function updateStatus(numHands) {
    if (numHands === 0) { 
        statusDot.className = ''; 
        if (!isListening && !isModelLoading) statusText.innerText = translations[currentLanguage].status_searching; 
        kinectHand.classList.add('hidden'); 
    } 
    else {
        statusDot.className = 'good';
        if (numHands === 2) {
            if (!isListening && !isModelLoading) statusText.innerText = isMenuOpen ? translations[currentLanguage].status_menu : translations[currentLanguage].status_scroll;
        } else { 
            kinectHand.classList.remove('hidden'); 
            // PRIORIDAD DE ESTADOS:
            if (isModelLoading) {
                statusText.innerText = "CARGANDO MOTOR...";
                statusText.classList.add('visible');
            } else if (isListening) {
                // No tocamos el texto si estamos escuchando (el motor escribe ahí)
                statusText.classList.add('visible');
            } else {
                statusText.innerText = isPrecisionMode ? translations[currentLanguage].status_precision : translations[currentLanguage].status_active;
            }
        }
    }
}

function updateKinectIconVisual(x, y) { const sizeOffset = isPrecisionMode ? 22.5 : 30; kinectHand.style.left = `${x - sizeOffset}px`; kinectHand.style.top = `${y - sizeOffset}px`; }

init();
