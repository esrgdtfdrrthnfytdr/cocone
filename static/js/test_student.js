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
//      多数決方式（デバッグ・安定化強化版）
// ==========================================
// ==========================================
//      多数決方式（デバッグ・安定化強化版）
// ==========================================
function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        let samples = [];      
        let sampleCount = 0;   
        const maxSamples = 12;      // サンプル数を増やして精度を上げる
        const sampleInterval = 35;  // 間隔をさらに詰める

        const takeSample = () => {
            const freq = getDominantFrequency();
            let bit = null;
            
            // 判定幅を少し広めに設定 (±250Hz)
            if (freq > 19250 && freq < 19750) bit = "1";      // 19500Hz付近
            else if (freq > 18250 && freq < 18750) bit = "0"; // 18500Hz付近
            
            if (bit !== null) samples.push(bit);
            sampleCount++;

            if (sampleCount < maxSamples) {
                setTimeout(takeSample, sampleInterval);
            } else {
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                
                let finalBit = "x";
                
                // 判定ロジックの調整
                // 1または0が少しでも（2回以上）検知されれば、多い方を採用
                if (count1 >= 2 && count1 > count0) {
                    finalBit = "1";
                } else if (count0 >= 2 && count0 >= count1) {
                    finalBit = "0";
                } else if (count1 === 1 || count0 === 1) {
                    // 1回しか検知できなかった場合の救済措置
                    finalBit = count1 > count0 ? "1" : "0";
                }
                
                detectedBits += finalBit;
                bitCount++;
                
                // ★詳細ログ：これで原因が特定できます
                console.log(`Bit ${bitCount} 確定プロセス: 最終=${finalBit} (詳細 -> 1検知数:${count1}, 0検知数:${count0}, サンプル総数:${samples.length})`);
                
                if (debugBits) debugBits.innerText += finalBit + " ";

                if (bitCount < 4) {
                    setTimeout(readBit, 100); 
                } else {
                    finishReceiving();
                }
            }
        };
        takeSample();
    };
    // スタート合図検知後の待ち時間を少し短縮して食い込みを防ぐ
    setTimeout(readBit, 400); 
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