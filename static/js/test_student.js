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

// ★椅子の音対策: 範囲は狭いまま維持 (誤検知防止の要)
const START_RANGE = 400; 
const STRICT_RANGE = 400; 

let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let signalBaseVolume = 0; 

// ★修正1: スタート検知の閾値を緩和
// 15回(0.25s)だと遅すぎるため、6回(0.1s)程度に戻す
// 範囲(START_RANGE)を狭めているので、これでも誤検知は防げます
const START_SIGNAL_THRESHOLD = 6; 
let startSignalCount = 0;

// 正解定義
const TARGET_BINARY_1 = "1111";
const TARGET_BINARY_0 = "0000";

// UI要素
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

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

    registerBtn.textContent = '信号待機中...';
    registerBtn.classList.add('is-processing');
    updateStatus("マイク起動: 信号を待っています", "black");
    if(debugBits) debugBits.innerText = "";

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // iOS/Androidスリープ対策
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
    
    // 高精度設定
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
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    const freq = maxIndex * nyquist / dataArray.length;
    return { freq, vol: maxVal };
}

function updateLoop() {
    if (!isListening) return;
    animationId = requestAnimationFrame(updateLoop);
    
    const { freq, vol } = getDominantFreqAndVol();
    
    if (debugFreq) {
        if (vol < 10) {
            debugFreq.innerText = "---";
            debugFreq.style.color = "#ccc";
        } else {
            debugFreq.innerText = `${Math.round(freq)} Hz (Lv:${vol})`;
            if (Math.abs(freq - targetStart) < STRICT_RANGE) debugFreq.style.color = "green";
            else if (Math.abs(freq - target1) < STRICT_RANGE) debugFreq.style.color = "red";
            else if (Math.abs(freq - target0) < STRICT_RANGE) debugFreq.style.color = "blue";
            else debugFreq.style.color = "#333";
        }
    }

    // --- IDLE状態 ---
    if (state === "IDLE") {
        // スタート検知
        if (vol > 15 && Math.abs(freq - BASE_START) < START_RANGE) {
            startSignalCount++;
        } else {
            startSignalCount = 0;
        }

        if (startSignalCount > START_SIGNAL_THRESHOLD) {
            // キャリブレーション
            const offset = freq - BASE_START;
            targetStart = freq;
            target0     = BASE_0 + offset;
            target1     = BASE_1 + offset;
            signalBaseVolume = vol; 

            console.log(`🚀 START LOCKED: ${Math.round(freq)}Hz (Offset: ${Math.round(offset)})`);
            updateStatus(`受信開始...`, "green");
            
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
    
    // ★修正2: 最初のビットまでの待機時間を短縮
    // Start音(0.5s)の終わりから、Bit0の中心(0.25s)までは合計0.75s。
    // しかし検知までに約0.15s経過しているため、残り待機時間は 0.6s (600ms) 弱が適切。
    // マージンを見て 550ms に設定します。
    const firstBitOffset = 550; 

    for (let i = 1; i <= 4; i++) {
        // 次のターゲット時刻
        const targetTime = startTime + firstBitOffset + ((i - 1) * 500);
        const waitTime = targetTime - performance.now();
        
        if (waitTime > 0) await sleep(waitTime);

        const bit = await sampleBit();
        
        if (bit === "ERROR") {
            console.warn(`Bit ${i} Lost. Aborting.`);
            handleResult(true, detectedBits); // エラー時は途中経過を渡す
            return;
        }

        detectedBits += bit;
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
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
        
        // 相対音量チェック
        if (vol > 10 && vol > (signalBaseVolume * 0.3)) {
            const dist0 = Math.abs(freq - target0);
            const dist1 = Math.abs(freq - target1);

            if (dist0 < dist1 && dist0 < STRICT_RANGE) { 
                score0++; validSamples++; 
            }
            else if (dist1 < dist0 && dist1 < STRICT_RANGE) { 
                score1++; validSamples++; 
            }
        }
        await sleep(interval);
    }

    console.log(`Sampled: 1=${score1}, 0=${score0}, Valid=${validSamples}`);

    if (validSamples < 4) return "ERROR";
    if (score1 > score0 + 1) return "1";
    if (score0 > score1 + 1) return "0";
    return "ERROR";
}

async function handleResult(isAborted, resultBits) {
    if (isAborted) {
        // エラー中断時の表示
        updateStatus(`信号ロスト(受信:${resultBits})...`, "red");
        state = "COOLDOWN";
        await sleep(2000);
    } else {
        console.log("Result:", resultBits);
        
        if (resultBits === TARGET_BINARY_1 || resultBits === TARGET_BINARY_0) {
            alert(`【テスト成功】\n受信成功: ${resultBits}`);
            updateStatus(`受信成功: ${resultBits}`, "green");
            if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
            
            state = "IDLE";
            isListening = false;
            if(audioCtx) audioCtx.close(); 
            cancelAnimationFrame(animationId);
            registerBtn.classList.remove('is-processing');
            registerBtn.textContent = '出席登録(テスト)';
            return;
        } else {
            updateStatus(`不一致: ${resultBits}`, "red");
            state = "COOLDOWN";
            await sleep(3000);
        }
    }

    updateStatus("信号待機中...", "black");
    state = "IDLE"; 
    startSignalCount = 0;
    if(debugBits) debugBits.innerText = "";
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