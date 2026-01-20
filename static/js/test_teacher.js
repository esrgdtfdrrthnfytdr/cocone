// static/js/test_teacher.js

let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let bgmGainNode = null;
let osc = null;
let isScanning = false;
let nextSignalTimer = null;
let isBgmOn = true;

// --- 設定 ---
const BGM_URL = '/static/sounds/bgm.wav';

// 周波数設定（test_student.jsと完全に一致させる）
const FREQ_START = 19000; // スタート信号
const FREQ_BIT_0 = 19300; // ビット0
const FREQ_BIT_1 = 19700; // ビット1

// ★超安全策：1ビットの長さを「1.0秒」にする
const BIT_DURATION = 1.0; 
const LOOP_GAP_SEC = 3.0;   // 次の送信までの休憩も長めに
const BGM_VOLUME = 0.4;

// --- UI要素 ---
const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select'); 
const errorMessage = document.getElementById('error-message');
const volSlider = document.getElementById('signal-volume');
const volDisplay = document.getElementById('vol-display');
const bgmToggleBtn = document.getElementById('bgm-toggle-btn');

if (volSlider && volDisplay) {
    volSlider.addEventListener('input', (e) => {
        volDisplay.textContent = e.target.value;
    });
}

if (bgmToggleBtn) {
    bgmToggleBtn.addEventListener('click', () => {
        isBgmOn = !isBgmOn;
        if (isBgmOn) {
            bgmToggleBtn.textContent = "🎵 BGM: ON";
            bgmToggleBtn.style.backgroundColor = "#63D2B0";
        } else {
            bgmToggleBtn.textContent = "🔇 BGM: OFF";
            bgmToggleBtn.style.backgroundColor = "#95A5A6";
        }
        if (bgmGainNode) {
            bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
        }
    });
}

window.addEventListener('load', async () => {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        const response = await fetch(BGM_URL);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("BGM Ready");
    } catch (e) { console.error(e); }
});

if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) { stopSound(); return; }
        if (audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        if(errorMessage) { errorMessage.textContent = ''; errorMessage.classList.remove('show'); }

        try {
            const res = await fetch('/api/generate_otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}) 
            });
            if (!res.ok) throw new Error("Server Error");
            const data = await res.json();
            startScanningUI();
            playMixedSoundLoop(data.otp_binary);
        } catch(e) {
            console.error(e);
            alert("通信エラー");
            stopSound();
        }
    });
}

function startScanningUI() {
    isScanning = true;
    submitBtn.textContent = '停止する';
    submitBtn.classList.add('is-processing');
    if(classSelect) classSelect.disabled = true;
}

function stopScanningUI() {
    isScanning = false;
    submitBtn.textContent = '出席確認';
    submitBtn.classList.remove('is-processing');
    if(classSelect) classSelect.disabled = false;
}

function playMixedSoundLoop(binaryStr) {
    if (!audioCtx) return;
    if (bgmBuffer) {
        bgmSource = audioCtx.createBufferSource();
        bgmSource.buffer = bgmBuffer;
        bgmSource.loop = true;
        bgmGainNode = audioCtx.createGain();
        bgmGainNode.gain.value = isBgmOn ? BGM_VOLUME : 0;
        bgmSource.connect(bgmGainNode);
        bgmGainNode.connect(audioCtx.destination);
        bgmSource.start(0);
    }
    playSignalRecursive(binaryStr);
}

function playSignalRecursive(binaryStr) {
    if (!isScanning || !audioCtx) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol;

    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 1. スタートマーカー (19000Hz)
    osc.frequency.setValueAtTime(FREQ_START, startTime);

    // 2. データビット (19300Hz / 19700Hz)
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_BIT_1 : FREQ_BIT_0), time);
    }

    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    osc.start(startTime);
    osc.stop(endTime);

    osc.onended = () => {
        osc = null;
        if (isScanning) {
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

function stopSound() {
    isScanning = false;
    if (nextSignalTimer) { clearTimeout(nextSignalTimer); nextSignalTimer = null; }
    if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
    if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
    bgmGainNode = null;
    stopScanningUI();
}