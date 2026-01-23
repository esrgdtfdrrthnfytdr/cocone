let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; 
let animationId = null; 

// === 設定値 ===
const BASE_START = 17000;
const BASE_0     = 18000;
const BASE_1     = 19000;
const START_RANGE = 1000; 
const STRICT_RANGE = 400; 

// キャリブレーション用
let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let startSignalVolume = 0; // スタート合図の音量を基準にする

// 連続検知カウンタ
let startSignalCount = 0;
const START_SIGNAL_THRESHOLD = 3; 

// 正解定義 (0000)
const TARGET_BINARY = "0000";

// UI
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
    updateStatus(`マイク起動: '${TARGET_BINARY}'を待っています`, "black");
    if(debugBits) debugBits.innerText = "";

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // iOS対策
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
    
    // 高解像度・高速反応
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

// 最も強い周波数と、その強さ(Volume)を返す
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
    
    // デバッグ表示
    if (debugFreq) {
        // 音量が小さすぎる(10以下)なら --- 表示
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

    if (state === "IDLE") {
        // スタート検知 (閾値10以上かつ周波数一致)
        if (vol > 10 && freq > (BASE_START - START_RANGE) && freq < (BASE_START + START_RANGE)) {
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
            startSignalVolume = vol; // 基準音量を保存

            console.log(`🚀 START: ${Math.round(freq)}Hz, Offset: ${Math.round(offset)}, BaseVol: ${vol}`);
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

    // ★重要: 絶対時間管理
    // 現在時刻を基準に、次の読み取りタイミングを計算する
    const startTime = performance.now(); 
    
    // スタート合図(0.5s)の終了付近 + マージン
    // Start(0.5) + Bit1の中心(0.25) = 0.75s後 を最初のターゲットにする
    // 少し遅らせて 0.8s (800ms) 後に最初のサンプリングを行う
    const firstBitTime = 800; 

    for (let i = 1; i <= 4; i++) {
        // 次のサンプリング予定時間まで待機
        const targetTime = startTime + firstBitTime + ((i - 1) * 500); // 500ms間隔
        const waitTime = targetTime - performance.now();
        
        if (waitTime > 0) await sleep(waitTime);

        // サンプリング実行
        const bit = await sampleBit();
        
        // エラー(信号ロスト)なら即中断
        if (bit === "ERROR") {
            console.warn(`Bit ${i} Lost. Aborting.`);
            handleResult(true); // 強制失敗
            return;
        }

        detectedBits += bit;
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
    }

    handleResult(false);
}

// 多数決サンプリング (10回計測 = 約300ms)
async function sampleBit() {
    let score0 = 0;
    let score1 = 0;
    let validSamples = 0;
    
    const samples = 10;
    const interval = 30; 

    for (let j = 0; j < samples; j++) {
        const { freq, vol } = getDominantFreqAndVol();
        
        // ★信号品質チェック
        // 音量が「スタート合図の半分以上」かつ「10以上」あること
        // これにより、無音時のノイズを拾わなくなる
        if (vol > 10 && vol > (startSignalVolume * 0.4)) {
            const dist0 = Math.abs(freq - target0);
            const dist1 = Math.abs(freq - target1);

            if (dist0 < dist1 && dist0 < STRICT_RANGE) { score0++; validSamples++; }
            else if (dist1 < dist0 && dist1 < STRICT_RANGE) { score1++; validSamples++; }
        }
        await sleep(interval);
    }

    console.log(`Sampled: 1=${score1}, 0=${score0}, Valid=${validSamples}`);

    // 有効なサンプルが半分未満なら「聞こえなかった」と判断してエラー
    if (validSamples < 4) return "ERROR";

    if (score1 > score0) return "1";
    return "0";
}

async function handleResult(isAborted) {
    if (isAborted) {
        updateStatus("信号ロスト: 再受信します", "red");
        // 短いクールダウン
        state = "COOLDOWN";
        await sleep(1000);
    } else {
        const finalBits = detectedBits;
        console.log("Result:", finalBits);

        if (finalBits === TARGET_BINARY) {
            alert(`【テスト成功】\n正しく '${TARGET_BINARY}' を受信しました！`);
            updateStatus(`受信成功: ${TARGET_BINARY}`, "green");
            if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
            
            // 成功時は停止
            state = "IDLE";
            isListening = false;
            if(audioCtx) audioCtx.close(); 
            cancelAnimationFrame(animationId);
            registerBtn.classList.remove('is-processing');
            registerBtn.textContent = '出席登録(テスト)';
            return;
        } else {
            updateStatus(`不一致: ${finalBits}`, "red");
            // 失敗時は長いクールダウン
            state = "COOLDOWN";
            await sleep(3000);
        }
    }

    // 待機状態へ復帰
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