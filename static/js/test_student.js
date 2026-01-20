// static/js/test_student.js

let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = ""; // ★ここだけでなく、関数内でもリセットが必要
let state = "IDLE";
let dynamicThreshold = 30;

// ==========================================
// 周波数設定（Teacher側 1.0秒送信モードに対応）
// ==========================================
const FREQ_MARKER_MIN = 18800; const FREQ_MARKER_MAX = 19200; // Marker: 19000
const FREQ_BIT_0_MIN  = 19150; const FREQ_BIT_0_MAX  = 19450; // Bit 0: 19300
const FREQ_BIT_1_MIN  = 19550; const FREQ_BIT_1_MAX  = 19850; // Bit 1: 19700

// UI要素
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const modal = document.getElementById('completion-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const debugFreq = document.getElementById('debug-freq');
const debugBits = document.getElementById('debug-bits');

// --- イベントリスナー ---
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        if (registerBtn.classList.contains('is-processing')) return;
        try { await startMic(); } catch (e) { alert("マイクエラー: " + e); }
    });
}
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        if(modal) modal.classList.remove('active');
        resetUI();
    });
}

// --- マイク起動とキャリブレーション ---
async function startMic() {
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "マイク起動中...";
    if(debugBits) debugBits.innerText = ""; 

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // iOS対策：無音再生
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
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.1; // 反応速度優先

    // ハイパスフィルタ（環境音カット）
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 17000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    setTimeout(() => {
        // キャリブレーション（しきい値設定）
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        dynamicThreshold = Math.max(10, avgNoise + 8); // 感度を高めに設定
        console.log("Calibration complete. Threshold:", dynamicThreshold);
        
        isListening = true;
        state = "IDLE";
        updateLoop();
    }, 500);
}

// --- 周波数取得 ---
function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(18000 * dataArray.length / nyquist); 

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < dynamicThreshold) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

// --- 監視ループ ---
function updateLoop() {
    if (!isListening) return;
    
    // IDLE（待ち受け）状態のときだけ、スタート信号を探す
    if (state === "IDLE") {
        const freq = getDominantFrequency();
        if (debugFreq) debugFreq.innerText = freq > 0 ? Math.round(freq) + " Hz" : "---";

        if (freq > FREQ_MARKER_MIN && freq < FREQ_MARKER_MAX) {
            console.log("🚀 START SIGNAL DETECTED");
            if(statusMsg) statusMsg.innerText = "受信開始...";
            startReceivingSequence();
        }
    }
    requestAnimationFrame(updateLoop);
}

// ==========================================
//      受信シーケンス（ここが修正の核心）
// ==========================================
function startReceivingSequence() {
    // 多重起動防止
    if (state !== "IDLE") return;
    state = "RECEIVING"; 

    // ★重要修正1：変数をここで必ずリセットする（前のデータを消す）
    detectedBits = ""; 
    let bitCount = 0;
    if(debugBits) debugBits.innerText = "";

    // ★重要修正2：待ち時間を「1.5秒」にする
    // Start(1.0s) + Buffer(0.5s) = 1.5s
    // これでスタート音の残響を完全に無視し、Bit1の真ん中から読み始める
    const INITIAL_WAIT = 1500; 

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 20; 
        const sampleInterval = 20; // 20ms * 20回 = 400ms間測定する

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            
            if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) bit = "1";      
            else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) bit = "0"; 
            
            if (bit !== null) samples.push(bit);
            
            // デバッグ表示
            if (debugFreq) debugFreq.innerText = `Scan: ${Math.round(freq)} Hz -> ${bit || '?'}`;

            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                // --- 1ビット分の測定終了、判定 ---
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                // 救済措置：1回でも検知できれば採用
                if (count1 === 0 && count0 === 0) {
                    finalBit = "x";
                } else if (count1 >= count0) {
                    finalBit = "1";
                } else {
                    finalBit = "0";
                }
                
                detectedBits += finalBit; // 結果を結合
                bitCount++;
                console.log(`Bit ${bitCount}: ${finalBit} (1:${count1}, 0:${count0})`);
                if (debugBits) debugBits.innerText = detectedBits; 

                if (bitCount < 4) {
                    // --- 次のビットまでの待機時間 ---
                    // 先生は1.0秒間隔で送っている。
                    // こちらは0.4秒測定した。残り0.6秒待てば次のビットの真ん中に行ける。
                    setTimeout(readBit, 600); 
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };

    // 最初の待機（1.5秒）スタート
    setTimeout(readBit, INITIAL_WAIT); 
}

// --- 終了処理 ---
async function finishReceiving() {
    console.log("Final Result:", detectedBits);
    
    // xが含まれていたら即失敗
    if (detectedBits.includes("x")) {
        if(statusMsg) statusMsg.innerText = "受信失敗: 再試行します";
        if(debugBits) debugBits.innerHTML += " <span style='color:red'>[失敗]</span>";
        setTimeout(() => { resetUI(); }, 2000); // 2秒後にリセット
        return;
    }

    const val = parseInt(detectedBits, 2);
    if (isNaN(val)) {
        setTimeout(() => { resetUI(); }, 2000);
        return;
    }

    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: val })
        });
        const result = await res.json();

        if (result.status === "success") {
            if (modal) modal.classList.add('active');
            if(statusMsg) statusMsg.innerText = "登録完了";
            // 成功時は state を戻さない（完了画面のままにする）
        } else {
            alert(`コード不一致: 受信${val} (正解: ${result.correct_otp || '?'})`);
            resetUI();
        }
    } catch(e) {
        alert("通信エラー");
        resetUI();
    }
}

function resetUI() {
    registerBtn.textContent = '出席登録';
    registerBtn.classList.remove('is-processing');
    if(statusMsg) statusMsg.innerText = "";
    // 変数のリセットは startReceivingSequence でもやっているが念のため
    detectedBits = ""; 
    state = "IDLE";
    isListening = true; 
}