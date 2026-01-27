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

// キャリブレーション用
let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let signalBaseVolume = 0; 
let startSignalCount = 0;
const START_SIGNAL_THRESHOLD = 6; 

// UI要素
const registerBtn = document.getElementById('register-btn'); 
const statusMsg = document.getElementById('status-msg');

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
    
    // スマホのスリープ対策
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

            console.log(`START: ${Math.round(freq)}Hz`);
            if(statusMsg) statusMsg.textContent = "信号受信中...";
            
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
        if (waitTime > 0) await sleep(waitTime); // ★ここでエラーが出ていました

        const bit = await sampleBit();
        
        if (bit === "ERROR") {
            console.warn("Signal Lost");
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
        await sleep(interval); // ★ここでも使います
    }

    if (validSamples < 4) return "ERROR";
    if (score1 > score0 + 1) return "1";
    if (score0 > score1 + 1) return "0";
    return "ERROR";
}

async function handleResult(isAborted, resultBits) {
    if (isAborted) {
        if(statusMsg) statusMsg.textContent = "信号が不明瞭でした。再受信します...";
        state = "COOLDOWN";
        await sleep(2000);
        state = "IDLE";
    } else {
        console.log("Bits:", resultBits);
        await submitAttendance(resultBits);
        
        state = "IDLE";
        isListening = false;
        if(audioCtx) audioCtx.close(); 
        cancelAnimationFrame(animationId);
        registerBtn.classList.remove('is-processing');
        registerBtn.textContent = '出席登録';
    }
}

async function submitAttendance(bits) {
    const otpVal = parseInt(bits, 2);
    // student_idはサーバー側のセッションから取得します
    
    try {
        const response = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                otp_value: otpVal  // ★修正済み: キー名をサーバーに合わせています
            })
        });
        
        const result = await response.json();
        if (result.status === 'success') {
            alert("出席登録が完了しました！");
            if(statusMsg) statusMsg.textContent = "登録完了";
        } else {
            alert("エラー: " + result.message);
            if(statusMsg) statusMsg.textContent = "登録失敗: " + result.message;
        }
    } catch (e) {
        alert("通信エラー: " + e);
    }
}

// ★★★ ここが消えていたためエラーになっていました ★★★
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}