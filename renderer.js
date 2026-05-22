const { ipcRenderer } = require('electron');

let handLandmarker;
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

// Interaction state
let lastVideoTime = -1;
let isPinching = false;
let isMenuOpen = false;
let isDemoMode = false;

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
let isListening = false;
let textToolsTimeout = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'es-ES';

    recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
            .map(result => result[0])
            .map(result => result.transcript)
            .join('');
        
        if (event.results[0].isFinal) {
            ipcRenderer.send('type-string', event.results[event.results.length - 1][0].transcript + ' ');
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech Recognition Error:', event.error);
        stopListening();
    };
}

// Smoothing (LERP)
let currentPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let targetPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let currentLerpFactor = 0.15;
const NORMAL_LERP = 0.15;
const PRECISION_LERP = 0.04;
const margin = 0.15;

// i18n Translations
const translations = {
    es: {
        settings_title: "Configuración",
        language_label: "Idioma",
        camera_label: "Cámara de Entrada",
        mic_label: "Micrófono",
        sensitivity_label: "Sensibilidad del Cursor",
        save_btn: "Guardar y Cerrar",
        status_searching: "Buscando manos...",
        status_active: "Control activo",
        status_listening: "Escuchando...",
        status_scroll: "Modo Scroll",
        status_precision: "Modo Precisión",
        status_menu: "Menú",
        settings_btn: "Configuración",
        demo_btn: "Demostración",
        exit_btn: "Salir de la App",
        continue_btn: "Continuar",
        precision_label: "Precisión",
        menu_hint: "Cierra ambos puños para el menú"
    },
    en: {
        settings_title: "Settings",
        language_label: "Language",
        camera_label: "Input Camera",
        mic_label: "Microphone",
        sensitivity_label: "Cursor Sensitivity",
        save_btn: "Save and Close",
        status_searching: "Searching for hands...",
        status_active: "Control active",
        status_listening: "Listening...",
        status_scroll: "Scroll Mode",
        status_precision: "Precision Mode",
        status_menu: "Menu",
        settings_btn: "Settings",
        demo_btn: "Demo Mode",
        exit_btn: "Exit App",
        continue_btn: "Continue",
        precision_label: "Precision",
        menu_hint: "Close both fists for menu"
    }
};

let currentLanguage = 'es';

function updateLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[lang][key]) {
            el.innerText = translations[lang][key];
        }
    });
    
    // Update non-data-i18n elements
    document.getElementById('settings-btn').innerText = translations[lang].settings_btn;
    document.getElementById('demo-btn').innerText = translations[lang].demo_btn;
    document.getElementById('menu-exit-btn').innerText = translations[lang].exit_btn;
    document.getElementById('resume-btn').innerText = translations[lang].continue_btn;
    document.getElementById('menu-hint').innerText = translations[lang].menu_hint;
    
    // Update Recognition language
    if (recognition) {
        recognition.lang = lang === 'es' ? 'es-ES' : 'en-US';
    }
}

// Device Selection Logic
async function enumerateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameraSelect = document.getElementById('camera-select');
    const micSelect = document.getElementById('mic-select');
    
    cameraSelect.innerHTML = '';
    micSelect.innerHTML = '';
    
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `${device.kind} ${cameraSelect.length + 1}`;
        
        if (device.kind === 'videoinput') {
            cameraSelect.appendChild(option);
        } else if (device.kind === 'audioinput') {
            micSelect.appendChild(option);
        }
    });
}

// Waveform Visualizer
let audioContext;
let analyser;
let dataArray;
let animationId;
const voiceVisualizer = document.getElementById('voice-visualizer');
const waveformCanvas = document.getElementById('waveform-canvas');
const waveformCtx = waveformCanvas.getContext('2d');

async function startWaveform() {
    try {
        const micId = document.getElementById('mic-select').value;
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: { deviceId: micId ? { exact: micId } : undefined } 
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        voiceVisualizer.classList.remove('hidden');
        drawWaveform();
    } catch (err) {
        console.error("Error starting waveform:", err);
    }
}

function stopWaveform() {
    if (animationId) cancelAnimationFrame(animationId);
    if (audioContext) audioContext.close();
    voiceVisualizer.classList.add('hidden');
}

function drawWaveform() {
    animationId = requestAnimationFrame(drawWaveform);
    analyser.getByteTimeDomainData(dataArray);
    
    waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = '#00ff88';
    waveformCtx.beginPath();
    
    const sliceWidth = waveformCanvas.width / dataArray.length;
    let x = 0;
    
    for (let i = 0; i < dataArray.length; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * waveformCanvas.height / 2;
        
        if (i === 0) waveformCtx.moveTo(x, y);
        else waveformCtx.lineTo(x, y);
        
        x += sliceWidth;
    }
    
    waveformCtx.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
    waveformCtx.stroke();
}

async function init() {
    console.log("Renderer: Iniciando Overlay...");
    try {
        updateLanguage('es');
        await enumerateDevices();
        await setupHandTracking();
        setupWebcam();
        setupEventListeners();
        
        // Resize waveform canvas
        waveformCanvas.width = voiceVisualizer.offsetWidth;
        waveformCanvas.height = voiceVisualizer.offsetHeight;

    } catch (error) {
        console.error("Renderer Error:", error);
    }
}

// UI Elements - New
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const sensitivityRange = document.getElementById('sensitivity-range');
const scrollRange = document.getElementById('scroll-range');
const saveSettings = document.getElementById('save-settings');

function setupEventListeners() {
    const interactiveElements = [kinectHand, statusIndicator, appMenu, textTools, settingsModal];
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => ipcRenderer.send('set-ignore-mouse-events', false));
        el.addEventListener('mouseleave', () => {
            if (!isMenuOpen && !isListening && settingsModal.classList.contains('hidden')) {
                ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
            }
        });
    });

    resumeBtn.addEventListener('click', () => toggleMenu(false));
    
    // Settings Listeners
    settingsBtn.addEventListener('click', () => {
        enumerateDevices();
        settingsModal.classList.remove('hidden');
    });
    
    document.getElementById('language-select').addEventListener('change', (e) => {
        updateLanguage(e.target.value);
    });

    saveSettings.addEventListener('click', () => {
        currentLerpFactor = parseFloat(sensitivityRange.value);
        const selectedCamera = document.getElementById('camera-select').value;
        setupWebcam(selectedCamera);
        settingsModal.classList.add('hidden');
    });

    demoBtn.addEventListener('click', () => {
        isDemoMode = !isDemoMode;
        demoContainer.classList.toggle('active', isDemoMode);
        demoBtn.innerText = isDemoMode ? 'Ocultar Demo' : 'Demostración';
        toggleMenu(false);
    });
    menuExitBtn.addEventListener('click', () => window.close());

    // Borrado
    deleteBtn.addEventListener('mousedown', () => {
        resetTextToolsTimeout();
        ipcRenderer.send('key-tap', 'backspace');
        deleteInterval = setInterval(() => {
            ipcRenderer.send('key-tap', 'backspace');
        }, 100);
    });
    deleteBtn.addEventListener('mouseup', () => clearInterval(deleteInterval));
    deleteBtn.addEventListener('mouseleave', () => clearInterval(deleteInterval));

    // Micrófono (Hold to Activate)
    micBtn.addEventListener('mouseenter', () => {
        resetTextToolsTimeout();
        if (!isListening) startListening();
    });
    micBtn.addEventListener('mouseleave', () => {
        if (isListening) stopListening();
    });

    // Reset timeout if user moves over tools
    textTools.addEventListener('mousemove', resetTextToolsTimeout);

    // Permitir clics físicos si el mouse real se mueve sobre ellos
    textTools.addEventListener('mouseenter', () => ipcRenderer.send('set-ignore-mouse-events', false));
    textTools.addEventListener('mouseleave', () => {
        if (!isMenuOpen && !isListening && textTools.classList.contains('collapsed')) {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        }
    });
}

// Text Tools Interaction Constants
const TOOLS_EXPAND_DIST = 100; // Distancia para expandir (px)
const TOOLS_DISMISS_DIST = 350; // Distancia para desaparecer (px)
let toolsCenter = { x: 0, y: 0 };

function resetTextToolsTimeout() {
    if (textToolsTimeout) clearTimeout(textToolsTimeout);
    textToolsTimeout = setTimeout(() => {
        if (!isListening && !deleteInterval) {
            hideTextTools();
        }
    }, 5000); 
}

function hideTextTools() {
    textTools.classList.add('hidden');
    textTools.classList.add('collapsed');
}

function startListening() {
    if (!recognition) return;
    isListening = true;
    micBtn.classList.add('listening');
    statusText.innerText = translations[currentLanguage].status_listening;
    recognition.start();
    startWaveform();
    ipcRenderer.send('set-ignore-mouse-events', false);
    resetTextToolsTimeout();
}

function stopListening() {
    if (!recognition) return;
    isListening = false;
    micBtn.classList.remove('listening');
    statusText.innerText = translations[currentLanguage].status_active;
    recognition.stop();
    stopWaveform();
    ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    resetTextToolsTimeout();
}

function showTextTools(x, y) {
    if (textToolsTimeout) clearTimeout(textToolsTimeout);
    
    // Posición: Directamente bajo el cursor
    const offsetY = 50;
    toolsCenter = { x, y: y + offsetY };
    
    textTools.style.left = `${x - 22}px`; 
    textTools.style.top = `${y + offsetY - 22}px`;
    textTools.classList.remove('hidden');
    textTools.classList.add('collapsed');
    
    // Habilitar clics inmediatamente para poder interactuar
    ipcRenderer.send('set-ignore-mouse-events', false);
    
    resetTextToolsTimeout();
}

function toggleMenu(show) {
    isMenuOpen = show;
    if (show) {
        appMenu.classList.add('active');
        ipcRenderer.send('set-ignore-mouse-events', false);
        isScrolling = false;
        scrollOverlay.classList.add('hidden');
        textTools.classList.add('hidden');
    } else {
        appMenu.classList.remove('active');
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
}

async function setupHandTracking() {
    const { HandLandmarker, FilesetResolver, DrawingUtils } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.js");
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
    
    drawingUtils = new DrawingUtils(canvasCtx);
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6, // Ajuste para evitar fantasmas sin perder detección
        minTrackingConfidence: 0.6
    });
}

function setupWebcam(deviceId = null) {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        };
        navigator.mediaDevices.getUserMedia(constraints)
            .then(stream => {
                video.srcObject = stream;
                video.onloadedmetadata = () => { 
                    video.play(); 
                    canvasElement.width = video.videoWidth;
                    canvasElement.height = video.videoHeight;
                    animate(); 
                };
            })
            .catch(err => {
                console.error("Webcam Error:", err);
                statusText.innerText = translations[currentLanguage].status_error || "Error";
            });
    }
}

let lastInferenceTime = 0;
const INFERENCE_INTERVAL = 33; // ~30 FPS para evitar saturar el procesador

function animate() {
    const now = performance.now();
    
    // Inferencia controlada
    if (handLandmarker && video.readyState >= 2 && (now - lastInferenceTime) >= INFERENCE_INTERVAL) {
        if (video.currentTime !== lastVideoTime) {
            try {
                const detections = handLandmarker.detectForVideo(video, now);
                handleInteractions(detections);
                
                if (isDemoMode && drawingUtils) {
                    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                    for (const landmarks of detections.landmarks) {
                        drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                            color: "#00FF88",
                            lineWidth: 5
                        });
                        drawingUtils.drawLandmarks(landmarks, { color: "#FF0000", lineWidth: 2 });
                    }
                }
                
                lastVideoTime = video.currentTime;
                lastInferenceTime = now;
            } catch (error) {
                console.error("Detection Error:", error);
            }
        }
    }

    // El renderizado visual (LERP) sigue a 60 FPS para suavidad
    if (!isScrolling && !isMenuOpen) {
        currentPos.x += (targetPos.x - currentPos.x) * currentLerpFactor;
        currentPos.y += (targetPos.y - currentPos.y) * currentLerpFactor;
        updateKinectIconVisual(currentPos.x, currentPos.y);
    }

    if (isScrolling && Math.abs(scrollVelocity) > 0.5 && !isMenuOpen) {
        if (now - lastScrollTime > 50) {
            ipcRenderer.send('scroll-mouse', Math.round(scrollVelocity));
            lastScrollTime = now;
        }
    }
    requestAnimationFrame(animate);
}

function handleInteractions(results) {
    const hands = results.landmarks;
    updateStatus(hands.length);

    if (hands.length === 0) {
        cancelClick();
        isScrolling = false;
        isPrecisionMode = false;
        scrollOverlay.classList.add('hidden');
        return;
    }

    // --- LÓGICA DE TEXT TOOLS (PROXIMIDAD) ---
    if (!textTools.classList.contains('hidden')) {
        const hand = hands[0];
        const indexPos = { 
            x: scaleCoordinate(hand[8].x, window.innerWidth),
            y: scaleCoordinate(hand[8].y, window.innerHeight)
        };
        
        const distToTools = Math.sqrt(
            Math.pow(indexPos.x - toolsCenter.x, 2) + 
            Math.pow(indexPos.y - toolsCenter.y, 2)
        );

        // Si se aleja mucho, desaparece inmediatamente
        if (distToTools > TOOLS_DISMISS_DIST) {
            hideTextTools();
            if (!isMenuOpen && !isListening) ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        } 
        // Si se acerca, se expande y reinicia el timer
        else if (distToTools < TOOLS_EXPAND_DIST) {
            if (textTools.classList.contains('collapsed')) {
                textTools.classList.remove('collapsed');
                // Ajustar posición para que se vea centrado al expandir
                textTools.style.left = `${toolsCenter.x - 75}px`;
                textTools.style.top = `${toolsCenter.y - 45}px`;
                ipcRenderer.send('set-ignore-mouse-events', false); // Habilitar clics al expandir
            }
            resetTextToolsTimeout(); // Reiniciar timer por proximidad
            ipcRenderer.send('set-ignore-mouse-events', false); // Mantener clics habilitados mientras estemos cerca
        }
    }

    // --- MENÚ (PUÑOS CERRADOS) ---
    if (hands.length === 2 && !isMenuOpen) {
        const h1 = hands[0];
        const h2 = hands[1];
        if (h1[8].y > h1[5].y && h2[8].y > h2[5].y) {
            const currentPosMean = (h1[0].x + h2[0].x) / 2;
            if (lastPalmPositions.length > 0) {
                if (Math.abs(currentPosMean - lastPalmPositions[lastPalmPositions.length - 1]) < STILL_THRESHOLD) {
                    stillFrameCount++;
                    if (stillFrameCount > FRAMES_TO_OPEN) { toggleMenu(true); stillFrameCount = 0; }
                } else { stillFrameCount = 0; }
            }
            lastPalmPositions.push(currentPosMean);
            if (lastPalmPositions.length > 10) lastPalmPositions.shift();
        } else { stillFrameCount = 0; }
    } else { stillFrameCount = 0; }

    if (isMenuOpen) return;

    // --- SCROLL ---
    if (hands.length === 2) {
        cancelClick();
        const currentMidY = (hands[0][0].y + hands[1][0].y) / 2;
        if (!isScrolling) {
            scrollBaseY = currentMidY;
            isScrolling = true;
            scrollOverlay.classList.remove('hidden');
            kinectHand.classList.add('hidden');
            textTools.classList.add('hidden');
        }
        const offset = currentMidY - scrollBaseY;
        scrollVelocity = Math.abs(offset) > 0.05 ? offset * SCROLL_SPEED_LIMITER : 0;
        return; 
    }

    // --- PUNTERO ---
    if (isScrolling) {
        isScrolling = false;
        scrollOverlay.classList.add('hidden');
        kinectHand.classList.remove('hidden');
    }

    const hand = hands[0];
    const indexTip = hand[8];
    const thumbTip = hand[4];

    const newTargetX = scaleCoordinate(indexTip.x, window.innerWidth);
    const newTargetY = scaleCoordinate(indexTip.y, window.innerHeight);
    
    const dx = newTargetX - targetPos.x;
    const dy = newTargetY - targetPos.y;
    const velocity = Math.sqrt(dx*dx + dy*dy) / window.innerWidth;

    velocityBuffer.push(velocity);
    if (velocityBuffer.length > VELOCITY_WINDOW) velocityBuffer.shift();
    const avgVelocity = velocityBuffer.reduce((a, b) => a + b, 0) / velocityBuffer.length;

    if (avgVelocity < PRECISION_VELOCITY_THRESHOLD && !isPinching) {
        if (!isPrecisionMode) {
            isPrecisionMode = true;
            kinectHand.classList.add('precision-active');
            currentLerpFactor = PRECISION_LERP;
        }
    } else if (avgVelocity > PRECISION_VELOCITY_THRESHOLD * 2.5) {
        if (isPrecisionMode) {
            isPrecisionMode = false;
            kinectHand.classList.remove('precision-active');
            currentLerpFactor = NORMAL_LERP;
        }
    }

    targetPos.x = newTargetX;
    targetPos.y = newTargetY;

    // --- LÓGICA DE CLIC ---
    const dist = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));
    const isPalmUp = hand[4].x < hand[20].x; // Gesto de palma hacia arriba

    if (dist < 0.05) {
        if (!isPinching) startClickTimer('left');
    } else if (isPalmUp && !isPinching) {
        const isRotated = thumbTip.x > indexTip.x + 0.05; 
        if (isRotated) {
            startClickTimer('right');
        } else {
            cancelClick();
        }
    } else {
        cancelClick();
    }

    ipcRenderer.send('move-mouse', Math.round(currentPos.x), Math.round(currentPos.y));
}

function startClickTimer(type = 'left') {
    if (clickTimer) return;
    kinectHand.classList.add('timer-active');
    if (type === 'right') kinectHand.classList.add('right-clicking');
    
    clickTimer = setTimeout(() => {
        ipcRenderer.send('mouse-click', type === 'right' ? 'right' : 'down');
        isPinching = true;
        kinectHand.classList.remove('timer-active');
        kinectHand.classList.add('selecting');
        if (type === 'right') kinectHand.classList.add('right-active');
        
        if (type === 'left') showTextTools(currentPos.x, currentPos.y);
    }, DWELL_TIME);
}

function cancelClick() {
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
    if (isPinching) { 
        ipcRenderer.send('mouse-click', 'up'); 
        isPinching = false; 
    }
    kinectHand.classList.remove('timer-active');
    kinectHand.classList.remove('selecting');
    kinectHand.classList.remove('right-clicking');
    kinectHand.classList.remove('right-active');
}

function scaleCoordinate(val, maxDimension) {
    let scaled = (val - margin) / (1 - 2 * margin);
    if (maxDimension === window.innerWidth) scaled = 1 - scaled;
    scaled = Math.max(0, Math.min(1, scaled));
    return scaled * maxDimension;
}

function updateStatus(numHands) {
    if (numHands === 0) {
        statusDot.className = '';
        statusText.innerText = translations[currentLanguage].status_searching;
        kinectHand.classList.add('hidden');
    } else {
        statusDot.className = 'good';
        if (numHands === 2) {
            statusText.innerText = isMenuOpen ? translations[currentLanguage].status_menu : translations[currentLanguage].status_scroll;
        } else {
            kinectHand.classList.remove('hidden');
            statusText.innerText = isListening ? translations[currentLanguage].status_listening : (isPrecisionMode ? translations[currentLanguage].status_precision : translations[currentLanguage].status_active);
        }
    }
}

function updateKinectIconVisual(x, y) {
    const sizeOffset = isPrecisionMode ? 17.5 : 25;
    kinectHand.style.left = `${x - sizeOffset}px`;
    kinectHand.style.top = `${y - sizeOffset}px`;
}

init();
