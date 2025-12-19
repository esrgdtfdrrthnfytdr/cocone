let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";
let receiveTimer = null;

const FREQ_START_MIN = 20800;
const FREQ_START_MAX = 21200;
const FREQ_1_TARGET = 20000;
const FREQ_0_TARGET = 19000;

// UI要素 (ID: register-btn に合わせました)
const registerBtn = document.getElementById('register-btn');
const modal = document.getElementById('completion-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        // 処理中なら無視
        if (registerBtn.classList.contains('is-processing')) return;
        
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: ブラウザの設定を確認してください");
            console.error(e);
        }
    });
}

if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        // UIリセット
        registerBtn.textContent = '出席登録';
        registerBtn.classList.remove('is-processing');
    });
}

async function startMic() {
    // UIを「登録中...」に変更
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing'); // 収束アニメーション

    // AudioContext初期化
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // バンドパスフィルタ設定
    const source = audioCtx.createMediaStreamSource(stream);
    const filter = audioCtx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 18000;

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;

    source.connect(filter);
    filter.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isListening = true;
    state = "IDLE";
    updateLoop();
}

function getFrequencyStrength(targetFreq) {
    const nyquist = audioCtx.sampleRate / 2;
    const index = Math.round(targetFreq / nyquist * analyser.fftSize / 2);
    let maxVal = 0;
    for (let i = -2; i <= 2; i++) {
        const val = dataArray[index + i] || 0;
        if (val > maxVal) maxVal = val;
    }
    return maxVal;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    analyser.getByteFrequencyData(dataArray);

    const startSig = getFrequencyStrength(21000);

    // スタート信号検知
    if (state === "IDLE" && startSig > 100) {
        console.log("🚀 スタート信号検知！");
        registerBtn.textContent = 'データ受信中...';
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    // タイミング調整 (Start信号検知から1.2秒後に読み始め)
    const readBit = () => {
        analyser.getByteFrequencyData(dataArray);
        const str1 = getFrequencyStrength(FREQ_1_TARGET);
        const str0 = getFrequencyStrength(FREQ_0_TARGET);
        
        // 簡易判定
        let bit = (str1 > str0) ? "1" : "0";
        // ノイズ対策: 両方とも弱すぎる場合は無視したいが、今回は強制判定
        
        console.log(`Bit check: 1=${str1}, 0=${str0} -> ${bit}`);
        detectedBits += bit;
        bitCount++;
        
        if (bitCount < 4) {
            setTimeout(readBit, 1000);
        } else {
            finishReceiving();
        }
    };
    
    setTimeout(readBit, 1200);
}

async function finishReceiving() {
    state = "IDLE";
    isListening = false;
    
    registerBtn.textContent = '登録処理中...';

    const finalVal = parseInt(detectedBits, 2);
    console.log("Result:", finalVal);

    // サーバー送信
    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: finalVal })
        });
        const result = await res.json();

        if (result.status === "success") {
            // 成功モーダル表示
            document.querySelector('.detail-value').innerText = "出席済み"; // 簡易表示
            modal.classList.add('active');
        } else {
            alert("出席コードが一致しませんでした。再試行してください。");
            registerBtn.textContent = '出席登録';
            registerBtn.classList.remove('is-processing');
        }
    } catch(e) {
        alert("通信エラー");
        registerBtn.textContent = '出席登録';
        registerBtn.classList.remove('is-processing');
    }
}

