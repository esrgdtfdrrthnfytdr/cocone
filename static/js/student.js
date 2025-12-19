let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE";

// 定数定義
const FREQ_START_MIN = 20800;
const FREQ_START_MAX = 21200;

// UI要素の取得
const registerBtn = document.getElementById('register-btn');
const statusMsg = document.getElementById('status-msg');
const modal = document.getElementById('completion-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');

// --- イベントリスナー設定 ---

// 1. 出席登録ボタン
if (registerBtn) {
    registerBtn.addEventListener('click', async () => {
        // 連打防止
        if (registerBtn.classList.contains('is-processing')) return;
        
        try {
            await startMic();
        } catch (e) {
            alert("マイクエラー: " + e);
            console.error(e);
        }
    });
}

// 2. モーダルの閉じるボタン
if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', () => {
        if(modal) modal.classList.remove('active');
        resetUI(); // 画面を初期状態に戻す
    });
}

// --- 音響処理ロジック ---

async function startMic() {
    // UIを「受信中」に変更
    registerBtn.textContent = '信号を探しています...';
    registerBtn.classList.add('is-processing'); // 波紋アニメ開始
    if(statusMsg) statusMsg.innerText = "マイク起動中...";

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 解析設定
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    
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
    // 18kHz以上だけ見る
    const minIndex = Math.floor(18000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }
    if (maxVal < 50) return 0; // ノイズカット
    return maxIndex * nyquist / dataArray.length;
}

function updateLoop() {
    if (!isListening) return;
    requestAnimationFrame(updateLoop);
    const freq = getDominantFrequency();

    // スタート信号検知 (21kHz付近)
    if (state === "IDLE" && freq > FREQ_START_MIN && freq < FREQ_START_MAX) {
        console.log("Start signal detected!");
        if(statusMsg) statusMsg.innerText = "データ受信中...";
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    let bitCount = 0;

    // 読み取りロジック
    const readBit = () => {
        const freq = getDominantFrequency();
        let bit = "?";
        
        if (freq > 19500 && freq < 20500) bit = "1";      // 20kHz
        else if (freq > 18500 && freq <= 19500) bit = "0"; // 19kHz
        
        console.log(`Bit check: ${Math.round(freq)}Hz -> ${bit}`);
        
        if (bit !== "?") detectedBits += bit;
        
        bitCount++;
        if (bitCount < 4) {
            setTimeout(readBit, 1000); // 次のビットへ
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
    registerBtn.textContent = 'サーバー照合中...';

    // 2進数文字列を数値に変換 (例: "1010" -> 10)
    // エラー回避: 空っぽなら0扱い
    const val = detectedBits ? parseInt(detectedBits, 2) : 0;
    console.log("Result:", val);

    // ★★★ ここでサーバーに送信 ★★★
    try {
        const res = await fetch('/api/check_attend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp_value: val })
        });
        const result = await res.json();

        if (result.status === "success") {
            // === 成功！モーダルを表示 ===
            if (modal) {
                // 必要ならここでモーダルの中身（名前など）を書き換える
                // document.querySelector('.detail-value').innerText = "出席済み"; 
                modal.classList.add('active');
            }
            if(statusMsg) statusMsg.innerText = "登録完了";
        } else {
            // 失敗
            alert("コード不一致: " + result.message);
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