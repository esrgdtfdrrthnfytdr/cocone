let audioCtx;
let bgmBuffer = null;
let bgmSource = null;
let osc = null;
let isScanning = false;
let nextSignalTimer = null;

// 設定
const BGM_URL = '/static/sounds/bgm.wav'; 
const FREQ_START = 21000;
const FREQ_1 = 20000;
const FREQ_0 = 19000;
const BIT_DURATION = 1.0;
const LOOP_GAP_SEC = 2.0;

// UI要素
const submitBtn = document.getElementById('submit-btn');
const classSelect = document.getElementById('class-select');
const errorMessage = document.getElementById('error-message');
const volSlider = document.getElementById('signal-volume'); // スライダー
const volDisplay = document.getElementById('vol-display'); // 数値表示

// スライダーの数値を表示に反映
if (volSlider && volDisplay) {
    volSlider.addEventListener('input', (e) => {
        volDisplay.textContent = e.target.value;
    });
}

// BGM読み込み
window.addEventListener('load', async () => {
    try {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        const response = await fetch(BGM_URL);
        const arrayBuffer = await response.arrayBuffer();
        bgmBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        console.log("BGM Ready");
    } catch (e) {
        console.error("BGM Load Error:", e);
    }
});

if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
        if (isScanning) {
            stopSound();
            return;
        }
        
        const selectedValue = classSelect.value;
        if (!selectedValue) {
            if(errorMessage) {
                errorMessage.textContent = 'クラスを選択してください';
                errorMessage.classList.add('show');
            }
            return;
        }
        if(errorMessage) {
            errorMessage.textContent = '';
            errorMessage.classList.remove('show');
        }

        if (audioCtx && audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        try {
            const res = await fetch('/api/generate_otp', { method: 'POST' });
            const data = await res.json();
            
            startScanningUI();
            playMixedSoundLoop(data.otp_binary);
        } catch(e) {
            alert("通信エラー");
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
    if (!bgmBuffer) return;

    // BGM再生
    bgmSource = audioCtx.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    const bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.4; // BGM音量
    bgmSource.connect(bgmGain);
    bgmGain.connect(audioCtx.destination);
    bgmSource.start(0);

    // 信号ループ開始
    playSignalRecursive(binaryStr);
}

function playSignalRecursive(binaryStr) {
    if (!isScanning) return;

    osc = audioCtx.createOscillator();
    const oscGain = audioCtx.createGain();
    
    const currentVol = volSlider ? parseFloat(volSlider.value) : 0.1;
    oscGain.gain.value = currentVol; 
    
    osc.connect(oscGain);
    oscGain.connect(audioCtx.destination);

    const startTime = audioCtx.currentTime;

    // 信号生成
    osc.frequency.setValueAtTime(FREQ_START, startTime);
    for (let i = 0; i < binaryStr.length; i++) {
        const bit = binaryStr[i];
        const time = startTime + BIT_DURATION + (i * BIT_DURATION);
        osc.frequency.setValueAtTime((bit === '1' ? FREQ_1 : FREQ_0), time);
    }

    const totalDuration = BIT_DURATION + (binaryStr.length * BIT_DURATION);
    const endTime = startTime + totalDuration;

    osc.start(startTime);
    osc.stop(endTime);
    
    osc.onended = () => {
        osc = null;
        if (isScanning) {
            // 次のループ予約
            nextSignalTimer = setTimeout(() => {
                playSignalRecursive(binaryStr);
            }, LOOP_GAP_SEC * 1000);
        }
    };
}

function stopSound() {
    isScanning = false;
    if (nextSignalTimer) {
        clearTimeout(nextSignalTimer);
        nextSignalTimer = null;
    }
    if(osc) { try{ osc.stop(); }catch(e){} osc = null; }
    if(bgmSource) { try{ bgmSource.stop(); }catch(e){} bgmSource = null; }
    stopScanningUI();
}