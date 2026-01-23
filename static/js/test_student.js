let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; 
let animationId = null; 

// ==========================================
// 1. 設定値
// ==========================================
const BASE_START = 17000;
const BASE_0     = 18000;
const BASE_1     = 19000;
const START_RANGE = 1000; 
const STRICT_RANGE = 400; 

let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;

let startSignalCount = 0;
const START_SIGNAL_THRESHOLD = 3; 

// ★変更点: 正解パターンを "0000" に変更
const TARGET_BINARY = "0000";

// UI要素
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

// --- イベントリスナー ---
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: " + e);
        }
    });
}

// --- 音響処理 ---
async function startMic() {
    if (isListening) {
        cancelAnimationFrame(animationId);
        if (audioCtx) {
            await audioCtx.close();
        }
        isListening = false;
    }

    registerBtn.textContent = '信号待機中...';
    registerBtn.classList.add('is-processing');
    updateStatus(`マイク起動: '${TARGET_BINARY}'を待っています`, "black");
    if(debugBits) debugBits.innerText = "";

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

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(15000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    
    if (maxVal < 10) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    animationId = requestAnimationFrame(updateLoop);
    
    const freq = getDominantFrequency();
    
    if (debugFreq) {
        debugFreq.innerText = Math.round(freq) + " Hz";
        if (Math.abs(freq - targetStart) < STRICT_RANGE) debugFreq.style.color = "green";
        else if (Math.abs(freq - target1) < STRICT_RANGE) debugFreq.style.color = "red";
        else if (Math.abs(freq - target0) < STRICT_RANGE) debugFreq.style.color = "blue";
        else debugFreq.style.color = "#ccc";
    }

    if (state === "IDLE") {
        if (freq > (BASE_START - START_RANGE) && freq < (BASE_START + START_RANGE)) {
            startSignalCount++;
        } else {
            startSignalCount = 0; 
        }

        if (startSignalCount > START_SIGNAL_THRESHOLD) {
            const offset = freq - BASE_START;
            targetStart = freq;
            target0     = BASE_0 + offset;
            target1     = BASE_1 + offset;
            
            console.log(`🚀 START CONFIRMED: ${Math.round(freq)}Hz (Offset: ${Math.round(offset)})`);
            updateStatus(`受信開始 (補正:${Math.round(offset)}Hz)`, "green");
            
            startSignalCount = 0;
            startReceivingSequence();
        }
    }
}

async function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";

    await sleep(800); 

    for (let i = 1; i <= 4; i++) {
        const bit = await sampleBit();
        detectedBits += bit;
        
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
        
        await sleep(200); 
    }

    handleResult();
}

async function sampleBit() {
    let score0 = 0;
    let score1 = 0;
    const samples = 10; 
    const interval = 30; 

    for (let j = 0; j < samples; j++) {
        const freq = getDominantFrequency();
        
        if (freq > 0) { 
            const dist0 = Math.abs(freq - target0);
            const dist1 = Math.abs(freq - target1);

            if (dist0 < dist1 && dist0 < STRICT_RANGE) score0++;
            else if (dist1 < dist0 && dist1 < STRICT_RANGE) score1++;
        }
        await sleep(interval);
    }

    console.log(`Sampling: 1=${score1}, 0=${score0}`);

    if (score1 > score0) return "1";
    if (score0 > score1) return "0";
    
    return (score1 + score0 === 0) ? "?" : "0"; 
}

async function handleResult() {
    const finalBits = detectedBits.slice(0, 4).replace(/\?/g, "0");
    console.log("Final Result:", finalBits);

    if (finalBits === TARGET_BINARY) {
        alert(`【テスト成功】\n正しく '${TARGET_BINARY}' を受信しました！`);
        updateStatus(`受信成功: ${TARGET_BINARY}`, "green");
        if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
        
        state = "IDLE";
        isListening = false;
        if(audioCtx) audioCtx.close(); 
        cancelAnimationFrame(animationId);
        
        registerBtn.classList.remove('is-processing');
        registerBtn.textContent = '出席登録(テスト)';
    } else {
        updateStatus(`不一致: ${finalBits} -> クールダウン(3秒)...`, "red");
        
        state = "COOLDOWN";
        await sleep(3000);
        
        console.log("Cooldown finished. Ready for next.");
        updateStatus("信号待機中...", "black");
        state = "IDLE"; 
        startSignalCount = 0; 
        if(debugBits) debugBits.innerText = "";
    }
}

function updateStatus(text, color) {
    if(statusMsg) {
        statusMsg.innerText = text;
        statusMsg.style.color = color;
        statusMsg.style.fontWeight = "bold";
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}