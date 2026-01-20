let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";
let dynamicThreshold = 35; // 動的しきい値（キャリブレーションで上書き）

// ==========================================
// 周波数設定（test_teacher.jsと完全に同期）
// ==========================================
const FREQ_MARKER_MIN = 18800; 
const FREQ_MARKER_MAX = 19200; // 19000Hz付近をスタート信号に
const FREQ_BIT_0_MIN  = 18300;
const FREQ_BIT_0_MAX  = 18700; // 18500Hz付近をビット0に
const FREQ_BIT_1_MIN  = 19300;
const FREQ_BIT_1_MAX  = 19700; // 19500Hz付近をビット1に

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
    if(statusMsg) statusMsg.innerText = "マイク起動中...";
    if(debugBits) debugBits.innerText = ""; 

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // iOS対策：無音再生によるアンロック
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    // バンドパスフィルタ
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // キャリブレーション（環境音の測定）
    setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        dynamicThreshold = Math.max(35, avgNoise + 20); 
        console.log("キャリブレーション完了。しきい値:", dynamicThreshold);
        
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
    
    if (debugFreq) {
        debugFreq.innerText = freq > 0 ? Math.round(freq) + " Hz" : "---";
    }

    // スタート信号検知
    if (state === "IDLE" && freq > FREQ_MARKER_MIN && freq < FREQ_MARKER_MAX) {
        console.log("Start signal detected!");
        if(statusMsg) statusMsg.innerText = `受信開始! (${Math.round(freq)}Hz)`;
        startReceivingSequence();
    }
}

// ==========================================
//      多数決方式（オーバーサンプリング）
// ==========================================
function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        // ★修正：各ビットごとにサンプリング変数を初期化
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 8;  
        const sampleInterval = 50; 

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
                // 多数決判定ロジック
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                // どちらかが2回以上検知されていれば優勢な方を採用
                let finalBit = "x";
                if (count1 >= 2 && count1 > count0) finalBit = "1";
                else if (count0 >= 2 && count0 >= count1) finalBit = "0";
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`ビット${bitCount}確定: ${finalBit} (1検出:${count1}, 0検出:${count0})`);

                if (bitCount < 4) {
                    setTimeout(readBit, 150); 
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };
    setTimeout(readBit, 500);
}

async function finishReceiving() {
    state = "IDLE";
    isListening = false;
    registerBtn.textContent = '照合中...';

    const val = parseInt(detectedBits, 2);
    console.log("最終結果(バイナリ):", detectedBits, "数値:", val);

    if (isNaN(val)) {
        alert(`判定に失敗しました (受信結果:${detectedBits})`);
        resetUI();
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
            alert(`コード不一致 (受信:${val})`);
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
    state = "IDLE";
}