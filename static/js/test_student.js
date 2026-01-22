let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; 

// ==========================================
// 1. 設定値 (基準値)
// ==========================================
const BASE_START = 17000;
const BASE_0     = 18000;
const BASE_1     = 19000;

// 許容する「ズレ」の初期範囲 (スタート検知用)
// 最初だけは広めに待ち受ける必要があります
const START_RANGE = 1000; 

// ★重要: 精密判定用の狭い範囲 (キャリブレーション後はこの狭さで判定)
const STRICT_RANGE = 200; // ±200Hz以内ならOKとする

// 自動補正されたターゲット周波数 (初期値は基準値と同じ)
let targetStart = BASE_START;
let target0     = BASE_0;
let target1     = BASE_1;
let freqOffset  = 0; // 検出されたズレ (例: +125Hz)

// テスト用正解
const TARGET_BINARY = "1111";

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
    registerBtn.textContent = '信号待機中...';
    registerBtn.classList.add('is-processing');
    updateStatus("マイク起動: '1111'を待っています", "black");
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
    
    // ★改良点1: FFTサイズを2048 -> 4096に倍増
    // これにより周波数分解能が約21Hz -> 約10Hzになり、より細かく数値を拾えます
    analyser.fftSize = 4096; 
    analyser.smoothingTimeConstant = 0.5;

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 
    mediaSource.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    state = "IDLE";
    
    // 補正値をリセット
    freqOffset = 0;
    
    updateLoop();
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    // 16kHz付近からスキャン
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < 50) return 0; // ノイズ閾値（少し厳しくしました）
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    
    const freq = getDominantFrequency();
    
    if (debugFreq) {
        // 現在の補正値を表示
        let offsetInfo = freqOffset !== 0 ? ` (補正: ${Math.round(freqOffset)}Hz)` : "";
        debugFreq.innerText = Math.round(freq) + " Hz" + offsetInfo;

        // 判定基準の色付け (補正後のターゲットと比較)
        if (Math.abs(freq - targetStart) < STRICT_RANGE) debugFreq.style.color = "green";
        else if (Math.abs(freq - target1) < STRICT_RANGE) debugFreq.style.color = "red";
        else if (Math.abs(freq - target0) < STRICT_RANGE) debugFreq.style.color = "blue";
        else debugFreq.style.color = "#ccc";
    }

    // ステートマシン
    if (state === "IDLE") {
        // スタート待ち（ここはまだ補正前なので広めに待つ）
        if (freq > (BASE_START - START_RANGE) && freq < (BASE_START + START_RANGE)) {
            
            // ★改良点2: ズレ(Offset)を確定させるキャリブレーション処理
            // 検出された周波数(例: 17120) - 基準(17000) = +120Hz のズレ
            freqOffset = freq - BASE_START;
            
            // ターゲット周波数を更新
            targetStart = freq;          // 今鳴っている音そのものをスタート基準に
            target0     = BASE_0 + freqOffset; // 18000 + 120
            target1     = BASE_1 + freqOffset; // 19000 + 120
            
            console.log(`🚀 START DETECTED: ${Math.round(freq)}Hz`);
            console.log(`🔧 CALIBRATION: Offset is ${Math.round(freqOffset)}Hz. Expecting 0=${Math.round(target0)}, 1=${Math.round(target1)}`);
            
            updateStatus(`受信開始 (補正:${Math.round(freqOffset)}Hz)`, "green");
            startReceivingSequence();
        }
    } else if (state === "COOLDOWN") {
        // 待機中
    }
}

async function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";

    // スタート音の残り時間を待つ
    await sleep(600); 

    // 4ビット受信
    for (let i = 1; i <= 4; i++) {
        const bit = await sampleBit();
        detectedBits += bit;
        
        if(debugBits) debugBits.innerText += bit + " ";
        console.log(`Bit ${i}: ${bit}`);
        
        await sleep(200); 
    }

    handleResult();
}

// 判定ロジック
async function sampleBit() {
    let score0 = 0;
    let score1 = 0;
    const samples = 10; 
    const interval = 30;

    for (let j = 0; j < samples; j++) {
        const freq = getDominantFrequency();
        
        if (freq > 0) {
            // ★改良点3: 補正されたターゲット周波数(target0, target1)と比較
            const dist0 = Math.abs(freq - target0);
            const dist1 = Math.abs(freq - target1);

            // どちらに近いか判定 (閾値は STRICT_RANGE = 200Hz で厳密に)
            if (dist0 < dist1 && dist0 < STRICT_RANGE) {
                score0++;
            } else if (dist1 < dist0 && dist1 < STRICT_RANGE) {
                score1++;
            }
        }
        await sleep(interval);
    }

    console.log(`Sampling: 1=${score1}, 0=${score0} (Targets: ${Math.round(target1)}/${Math.round(target0)})`);

    if (score1 > score0) return "1";
    if (score0 > score1) return "0";
    
    // エラー時は補正
    return (score1 + score0 === 0) ? "?" : "0"; 
}

async function handleResult() {
    const finalBits = detectedBits.replace(/\?/g, "0");
    console.log("Final Result:", finalBits);

    if (finalBits === TARGET_BINARY) {
        alert("【テスト成功】\n正しく '1111' を受信しました！");
        updateStatus("受信成功: 1111", "green");
        if(debugBits) debugBits.innerHTML += "<br>✅ MATCHED!";
        
        state = "IDLE";
        isListening = false;
        registerBtn.classList.remove('is-processing');
        registerBtn.textContent = '出席登録(テスト)';
    } else {
        updateStatus(`不一致: ${finalBits} -> クールダウン中...`, "red");
        state = "COOLDOWN";
        await sleep(3000);
        updateStatus("信号待機中...", "black");
        state = "IDLE"; 
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