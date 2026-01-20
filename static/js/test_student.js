let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";

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
        // 連打防止
        if (registerBtn.classList.contains('is-processing')) return;
        
        try {
            // iOS対策のため、ここから一気に開始処理を呼ぶ
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
// ==========================================
// 周波数設定（test_teacher.jsと同期）
// ==========================================
const FREQ_MARKER_MIN = 18800; 
const FREQ_MARKER_MAX = 19200; // 19000Hz付近をスタート信号に
const FREQ_BIT_0_MIN  = 18300;
const FREQ_BIT_0_MAX  = 18700; // 18500Hz付近をビット0に
const FREQ_BIT_1_MIN  = 19300;
const FREQ_BIT_1_MAX  = 19700; // 19500Hz付近をビット1に
// --- 音響処理 ---
async function startMic() {
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing');
    if(statusMsg) statusMsg.innerText = "マイク起動中...";
    if(debugBits) debugBits.innerText = ""; // 履歴クリア

    // 1. AudioContextの作成 (同期的に即座に行う)
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // ==============================================
    // 🔥 iOS対策：最強の「無音再生」アンロック処理 🔥
    // ==============================================
    // クリックイベント内で即座に音を鳴らすことで、iOSの制限を解除します。
    
    // 空の音データを作成して一瞬だけ再生
    const emptyBuffer = audioCtx.createBuffer(1, 1, 22050);
    const source = audioCtx.createBufferSource();
    source.buffer = emptyBuffer;
    source.connect(audioCtx.destination);
    source.start(0);

    // 念押しで resume も呼んでおく
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    // ==============================================

    // 2. マイク設定 (iPhoneノイズ除去無効化)
    const constraints = {
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
        }
    };

    // マイク許可を求める (ここは待機時間が長くてもOK)
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    const mediaSource = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    // バンドパスフィルタ (16kHz以上の音だけ通す)
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 16000; 

    mediaSource.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // ==========================================
    // ステップ2：動的しきい値（キャリブレーション）
    // ==========================================
    setTimeout(() => {
        analyser.getByteFrequencyData(dataArray);
        const avgNoise = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        dynamicThreshold = Math.max(35, avgNoise + 25); 
        console.log("キャリブレーション完了。しきい値:", dynamicThreshold);
        
        registerBtn.textContent = '信号を探しています...';
        isListening = true;
        updateLoop();
    }, 600);
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    const nyquist = audioCtx.sampleRate / 2;
    // 16kHz付近からスキャン開始
    const minIndex = Math.floor(16000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    // 動的しきい値未満なら無視
    if (maxVal < dynamicThreshold) return 0; 
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    
    const freq = getDominantFrequency();
    
    // 可視化: 周波数表示
    if (debugFreq) {
        if (freq > 0) {
            debugFreq.innerText = Math.round(freq) + " Hz";
            debugFreq.style.color = "#333";
        } else {
            debugFreq.innerText = "---";
            debugFreq.style.color = "#ccc";
        }
    }

    // スタート信号検知 (19kHz付近)
    // スタート信号検知（19000Hz付近）
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
                // 多数決判定
                const count1 = samples.filter(s => s === "1").length;
                const count0 = samples.filter(s => s === "0").length;
                let finalBit = (count1 > count0 && count1 >= 3) ? "1" : "0";
                
                detectedBits += finalBit;
                bitCount++;
                console.log(`ビット${bitCount}確定: ${finalBit} (1検出数: ${count1}, 0検出数: ${count0})`);

                if (bitCount < 4) {
                    setTimeout(readBit, 100); 
                } else {
                    finishReceiving();
                }
            };
        takeSample();
    };
    setTimeout(readBit, 800);
}


async function finishReceiving() {
    state = "IDLE";
    isListening = false;
    registerBtn.textContent = '照合中...';

    const val = parseInt(detectedBits, 2);
    console.log("Result:", val);

    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: val })
        });
        const result = await res.json();

        if (result.status === "success") {
            // 成功時
            if (modal) modal.classList.add('active');
            if(statusMsg) statusMsg.innerText = "登録完了";
            if(debugBits) debugBits.innerHTML += "<br><span style='color:green; font-weight:bold;'>[OK] 出席完了</span>";
        } else {
            // 失敗時
            alert(`コード不一致 (受信:${val})`);
            if(debugBits) debugBits.innerHTML += "<br><span style='color:red; font-weight:bold;'>[NG] 不一致</span>";
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
}