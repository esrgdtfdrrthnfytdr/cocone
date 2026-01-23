let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; 
let animationId = null; 

// ==========================================
// 1. 設定値 (環境に合わせて調整済み)
// ==========================================
const BASE_START = 17000;
const BASE_0     = 18000;
const BASE_1     = 19000;

// ★修正1: スタート待ち受け範囲を狭める (Bit0誤検知防止)
// 以前は1000でしたが、Bit0(18000)と被らないよう 400 に狭めます
const START_RANGE = 400; 

// ビット判定の許容範囲 (キャリブレーション後)
const STRICT_RANGE = 400; 

// キャリブレーション用変数
let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let signalBaseVolume = 0; // 基準となる信号強度

// ★修正2: スタート検知の厳格化 (椅子音対策)
// 3フレーム(約0.05秒) -> 15フレーム(約0.25秒) に変更
// 継続して鳴り続けないと「スタート」と認めない
const START_SIGNAL_THRESHOLD = 15; 
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
    
    // iOS/Androidのスリープ防止用ハック (無音再生)
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
            echoCancellation: false, 
            noiseSuppression: false, // ノイズ抑制はOFF推奨（信号も消えるため）
            autoGainControl: false   // 勝手に音量が変わると困るのでOFF
        } 
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

// 周波数と音量を取得
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
            // ターゲット判定色分け
            if (Math.abs(freq - targetStart) < STRICT_RANGE) debugFreq.style.color = "green";
            else if (Math.abs(freq - target1) < STRICT_RANGE) debugFreq.style.color = "red";
            else if (Math.abs(freq - target0) < STRICT_RANGE) debugFreq.style.color = "blue";
            else debugFreq.style.color = "#333";
        }
    }

    // --- IDLE状態: スタート合図待ち ---
    if (state === "IDLE") {
        // 条件: 音量が十分あり、周波数が17000Hz付近であること
        // ★修正: 範囲を ±400Hz に狭めて誤検知を減らす
        if (vol > 15 && Math.abs(freq - BASE_START) < START_RANGE) {
            startSignalCount++;
        } else {
            // 途切れたら即リセット (椅子の音対策)
            startSignalCount = 0;
        }

        // ★修正: 閾値を 15 (約0.25秒) に増やして、瞬発ノイズを無視
        if (startSignalCount > START_SIGNAL_THRESHOLD) {
            // キャリブレーション
            const offset = freq - BASE_START;
            targetStart = freq;
            target0     = BASE_0 + offset;
            target1     = BASE_1 + offset;
            signalBaseVolume = vol; // 基準音量を保存

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

    // 時間管理開始
    const startTime = performance.now(); 
    
    // 最初のビット読み取りタイミング (0.8秒後)
    const firstBitOffset = 800; 

    for (let i = 1; i <= 4; i++) {
        const targetTime = startTime + firstBitOffset + ((i - 1) * 500);
        const waitTime = targetTime - performance.now();
        
        if (waitTime > 0) await sleep(waitTime);

        const bit = await sampleBit();
        
        // エラーなら即中断
        if (bit === "ERROR") {
            console.warn(`Bit ${i} Lost. Aborting.`);
            handleResult(true, ""); 
            return;
        }

        detectedBits += bit;
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
    }

    handleResult(false, detectedBits);
}

// サンプリング処理
async function sampleBit() {
    let score0 = 0;
    let score1 = 0;
    let validSamples = 0;
    
    const samples = 10;
    const interval = 30; 

    for (let j = 0; j < samples; j++) {
        const { freq, vol } = getDominantFreqAndVol();
        
        // ★修正: 相対音量チェック
        // 「スタート合図の音量」の30%以上出ているか？ (距離対策)
        // かつ、最低限のノイズ閾値(10)を超えているか
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

    // 有効サンプルが少なすぎる場合はエラー
    if (validSamples < 4) return "ERROR";

    if (score1 > score0 + 1) return "1";
    if (score0 > score1 + 1) return "0";

    return "ERROR"; // 僅差の場合はエラー
}

async function handleResult(isAborted, resultBits) {
    if (isAborted) {
        updateStatus("信号ロスト: 再試行します...", "red");
        // ロスト時は少し長めに待って、前の信号が消えるのを待つ
        state = "COOLDOWN";
        await sleep(2000);
    } else {
        console.log("Result:", resultBits);
        
        // 成功判定
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