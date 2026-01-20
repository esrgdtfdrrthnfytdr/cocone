// static/js/test_student.js

let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";
let dynamicThreshold = 35; // キャリブレーションで動的に上書きされます

// static/js/test_student.js

// ==========================================
// 周波数設定（高周波シフト版）
// ==========================================

// スタート信号（19000Hz付近）：ここは実績があるのでそのまま維持
const FREQ_MARKER_MIN = 18900; 
const FREQ_MARKER_MAX = 19100; 

// ビット0（19300Hz付近）：ここが今回のキモです
const FREQ_BIT_0_MIN  = 19200;
const FREQ_BIT_0_MAX  = 19400; 

// ビット1（19700Hz付近）：さらに高い位置へ
const FREQ_BIT_1_MIN  = 19600;
const FREQ_BIT_1_MAX  = 19800;

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
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: " + e);
        }
    });
}

if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        if(modal) modal.classList.remove('active');
        resetUI();
    });
}

// --- 音響処理 ---
async function startMic() {
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "環境音を測定中...";
    if(debugBits) debugBits.innerText = ""; 

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // iOS対策：無音再生による制限解除
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    });
    
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2; // 反応速度を重視

    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // キャリブレーション（動的しきい値の設定）
    setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        // 感度を上げるためオフセットを少し下げる（+20 -> +15）
        dynamicThreshold = Math.max(30, avgNoise + 15); 
        console.log("Calibration complete. Threshold:", dynamicThreshold);
        
        isListening = true;
        state = "IDLE";
        updateLoop();
    }, 600);
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < dynamicThreshold) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    const freq = getDominantFrequency();
    if (debugFreq) debugFreq.innerText = freq > 0 ? Math.round(freq) + " Hz" : "---";

    // スタート信号検知
    if (state === "IDLE" && freq > FREQ_MARKER_MIN && freq < FREQ_MARKER_MAX) {
        console.log("Start signal detected!");
        if(statusMsg) statusMsg.innerText = "信号を受信中...";
        startReceivingSequence();
    }
}

// ==========================================
//      多数決方式（超高感度サンプリング）
// ==========================================
function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 15;      // サンプル数を増やして網を広げる
        const sampleInterval = 25;  // 25ms間隔で超高速スキャン

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            
            if (freq > FREQ_BIT_1_MIN && freq < FREQ_BIT_1_MAX) bit = "1";      
            else if (freq > FREQ_BIT_0_MIN && freq < FREQ_BIT_0_MAX) bit = "0"; 
            
            if (bit !== null) samples.push(bit);
            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                // 多数決ロジックの緩和
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                // 救済：1回でも検知された方を優先。同数なら高い方の「1」を優先。
                if (count1 > 0 && count1 >= count0) finalBit = "1";
                else if (count0 > 0) finalBit = "0";
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`Bit ${bitCount}: ${finalBit} (1検知:${count1}, 0検知:${count0})`);
                
                if (debugBits) debugBits.innerText = detectedBits; 

                if (bitCount < 4) {
                    setTimeout(readBit, 80); // 次のビットへの遷移
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };
    // スタート信号後の「待ち」を350msに短縮
    setTimeout(readBit, 350); 
}

async function finishReceiving() {
    const val = parseInt(detectedBits, 2);
    console.log("Final Result:", detectedBits, "Value:", val);

    if (detectedBits.includes("x") || isNaN(val)) {
        if(statusMsg) statusMsg.innerText = "受信失敗";
        setTimeout(() => { resetUI(); }, 1500);
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
        } else {
            alert(`コード不一致: ${val}`);
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
    if(debugBits) debugBits.innerText = "";
    state = "IDLE";
    isListening = false;
}