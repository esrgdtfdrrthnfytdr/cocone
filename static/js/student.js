let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";

// 定数定義 (iPhoneでも拾いやすい16kHz〜19kHz帯を使用)
const FREQ_START_MIN = 18500;
const FREQ_START_MAX = 19500;

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
    
    isListening = true;
    state = "IDLE";
    updateLoop();
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
    // ノイズカット (閾値30)
    if (maxVal < 30) return 0; 
    
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
    if (state === "IDLE" && freq > FREQ_START_MIN && freq < FREQ_START_MAX) {
        console.log("Start signal detected!");
        if(statusMsg) statusMsg.innerText = `受信開始! (${Math.round(freq)}Hz)`;
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    const readBit = () => {
        const freq = getDominantFrequency();
        let bit = "?";
        
        // 判定ロジック
        // 1 = 18000Hz (17500-18500)
        // 0 = 17000Hz (16500-17500)
        if (freq > 17500 && freq < 18500) bit = "1";      
        else if (freq > 16500 && freq <= 17500) bit = "0"; 
        
        // 可視化: 判定結果
        if (debugBits) {
            debugBits.innerText += (bit === "?" ? "X" : bit) + " ";
        }
        
        // エラー訂正: 不明な場合は0扱い
        if (bit === "?") bit = "0";
        
        detectedBits += bit;
        bitCount++;
        
        if (bitCount < 4) {
            setTimeout(readBit, 1000); 
        } else {
            finishReceiving();
        }
    };
    
    // 最初のビットはスタート検知から1.5秒後
    setTimeout(readBit, 1500);
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