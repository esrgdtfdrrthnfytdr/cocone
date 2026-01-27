let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; 
let animationId = null; 

// === 設定値 ===
const BASE_START = 17000;
const BASE_0     = 18000;
const BASE_1     = 19000;
const START_RANGE = 400;   
const STRICT_RANGE = 400; 

// キャリブレーション
let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let signalBaseVolume = 0; 
let startSignalCount = 0;
const START_SIGNAL_THRESHOLD = 6; 

// UI要素 (前のバージョンのID名に合わせています)
const registerBtn = document.getElementById('register-btn'); 
// ▼▼▼ ここを変更: HTMLのIDに合わせる ▼▼▼
const modal = document.getElementById('completion-modal');
const closeModalBtn = document.getElementById('modal-close-btn');

// 閉じるボタン
if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        if (modal) modal.classList.remove('active');
        if (registerBtn) {
            registerBtn.textContent = '出席登録';
            registerBtn.classList.remove('is-processing');
        }
    });
}

if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try { await startMic(); } catch (e) { alert("マイクエラー: " + e); }
    });
}

async function startMic() {
    if (isListening) {
        cancelAnimationFrame(animationId);
        if (audioCtx) await audioCtx.close();
        isListening = false;
    }

    registerBtn.textContent = '信号を聞いています...';
    registerBtn.classList.add('is-processing');

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } 
    });
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096; 
    analyser.smoothingTimeConstant = 0; 

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 15000; 
    mediaSource.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    state = "IDLE";
    startSignalCount = 0;
    
    updateLoop();
}

function getDominantFreqAndVol() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(15000 * dataArray.length / nyquist);
    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) { maxVal = dataArray[i]; maxIndex = i; }
    }
    return { freq: maxIndex * nyquist / dataArray.length, vol: maxVal };
}

function updateLoop() {
    if (!isListening) return;
    animationId = requestAnimationFrame(updateLoop);
    const { freq, vol } = getDominantFreqAndVol();

    if (state === "IDLE") {
        if (vol > 15 && Math.abs(freq - BASE_START) < START_RANGE) {
            startSignalCount++;
        } else {
            startSignalCount = 0;
        }

        if (startSignalCount > START_SIGNAL_THRESHOLD) {
            const offset = freq - BASE_START;
            targetStart = freq;
            target0     = BASE_0 + offset;
            target1     = BASE_1 + offset;
            signalBaseVolume = vol;
            startSignalCount = 0;
            startReceivingSequence();
        }
    }
}

async function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";

    const startTime = performance.now(); 
    const firstBitOffset = 550; 

    for (let i = 1; i <= 4; i++) {
        const targetTime = startTime + firstBitOffset + ((i - 1) * 500);
        const waitTime = targetTime - performance.now();
        if (waitTime > 0) await sleep(waitTime);

        const bit = await sampleBit();
        if (bit === "ERROR") {
            handleResult(true, ""); 
            return;
        }
        detectedBits += bit;
    }
    handleResult(false, detectedBits);
}

async function sampleBit() {
    let score0 = 0;
    let score1 = 0;
    let validSamples = 0;
    const samples = 10;
    const interval = 30; 

    for (let j = 0; j < samples; j++) {
        const { freq, vol } = getDominantFreqAndVol();
        if (vol > 10 && vol > (signalBaseVolume * 0.3)) {
            const dist0 = Math.abs(freq - target0);
            const dist1 = Math.abs(freq - target1);
            if (dist0 < dist1 && dist0 < STRICT_RANGE) { score0++; validSamples++; }
            else if (dist1 < dist0 && dist1 < STRICT_RANGE) { score1++; validSamples++; }
        }
        await sleep(interval);
    }
    if (validSamples < 4) return "ERROR";
    if (score1 > score0 + 1) return "1";
    if (score0 > score1 + 1) return "0";
    return "ERROR";
}

async function handleResult(isAborted, resultBits) {
    if (isAborted) {
        state = "COOLDOWN";
        await sleep(2000);
        state = "IDLE";
    } else {
        await submitAttendance(resultBits);
        state = "IDLE";
        isListening = false;
        if(audioCtx) audioCtx.close(); 
        cancelAnimationFrame(animationId);
    }
}

async function submitAttendance(bits) {
    const otpVal = parseInt(bits, 2);
    
    try {
        const response = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: otpVal })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            // ▼▼▼ 成功処理: データを画面に反映 ▼▼▼
            if (modal) {
                // サーバーから返ってきたデータがあればセットする
                if (result.data) {
                    const elNum = document.getElementById('modal-number');
                    const elName = document.getElementById('modal-name');
                    const elDate = document.getElementById('modal-date');
                    const elPeriod = document.getElementById('modal-period');

                    if (elNum) elNum.textContent = result.data.number;
                    if (elName) elName.textContent = result.data.name;
                    if (elDate) elDate.textContent = result.data.date;
                    if (elPeriod) elPeriod.textContent = result.data.period;
                }
                modal.classList.add('active');
            } else {
                alert("出席登録完了！");
            }
        } else {
            alert("エラー: " + result.message);
            registerBtn.classList.remove('is-processing');
            registerBtn.textContent = '出席登録';
        }
    } catch (e) {
        alert("通信エラー: " + e);
        registerBtn.classList.remove('is-processing');
        registerBtn.textContent = '出席登録';
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}