let audioCtx, analyser, dataArray;
let isListening = false;
let detectedBits = "";
let state = "IDLE"; // IDLE, WAITING_START, RECEIVING
let lastFreq = 0;

// 定数定義（先生側と合わせる）
const FREQ_START_MIN = 20800;
const FREQ_START_MAX = 21200;
const THRESHOLD_1 = 19800; // これ以上なら1
const THRESHOLD_0 = 19200; // これ以下なら0

document.getElementById('btn-start').addEventListener('click', startMic);

async function startMic() {
    document.getElementById('btn-start').style.display = 'none';
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    updateLoop();
    document.getElementById('status-msg').innerText = "👂 信号を待っています...";
}

function getDominantFrequency() {
    analyser.getByteFrequencyData(dataArray);
    let maxVal = 0;
    let maxIndex = 0;
    
    // 18kHz以上だけスキャンして負荷を下げる
    const nyquist = audioCtx.sampleRate / 2;
    const minIndex = Math.floor(18000 * dataArray.length / nyquist);

    for (let i = minIndex; i < dataArray.length; i++) {
        if (dataArray[i] > maxVal) {
            maxVal = dataArray[i];
            maxIndex = i;
        }
    }

    if (maxVal < 100) return 0; // ノイズ除去
    return maxIndex * nyquist / dataArray.length;
}

// 簡易的なステートマシン
// Start信号検知 -> 1.5秒待つ(最初のビットの中央) -> 1秒ごとにサンプリング -> 4回やる
let receiveTimer = null;

function updateLoop() {
    requestAnimationFrame(updateLoop);
    const freq = getDominantFrequency();
    document.getElementById('current-freq').innerText = Math.round(freq);

    // スタート信号 (21kHz付近) を検知したら受信モードへ
    if (state === "IDLE" && freq > FREQ_START_MIN && freq < FREQ_START_MAX) {
        startReceivingSequence();
    }
}

function startReceivingSequence() {
    if (state !== "IDLE") return;
    state = "RECEIVING";
    detectedBits = "";
    document.getElementById('status-msg').innerText = "📡 信号受信中...";
    document.getElementById('status-msg').style.color = "red";

    // タイミング合わせ (同期)
    // スタート信号(1秒)の後、最初のビット(1秒)が来る。
    // 安定して読み取るため、スタート検知から「1.5秒後」に最初のビットを読む
    
    let bitCount = 0;
    
    const readBit = () => {
        const freq = getDominantFrequency();
        let bit = "?";
        
        // 判定ロジック
        if (freq > 19500 && freq < 20500) bit = "1";
        else if (freq > 18500 && freq <= 19500) bit = "0";
        
        console.log(`Bit ${bitCount + 1}: ${Math.round(freq)}Hz -> ${bit}`);
        
        if (bit !== "?") {
            detectedBits += bit;
            document.getElementById('signal-history').innerText = detectedBits;
        }

        bitCount++;
        
        if (bitCount < 4) {
            // 次のビットは1秒後
            setTimeout(readBit, 1000); 
        } else {
            finishReceiving();
        }
    };

    // 最初の読み取り予約 (スタート信号検知直後だと早すぎるので、1.5秒待ってビット1の中央を狙う)
    setTimeout(readBit, 1500);
}

function finishReceiving() {
    state = "IDLE";
    document.getElementById('status-msg').innerText = "受信完了！";
    document.getElementById('status-msg').style.color = "green";
    
    // 出席ボタン有効化
    const btn = document.getElementById('btn-attend');
    btn.disabled = false;
    btn.innerText = `コード ${parseInt(detectedBits, 2)} で出席登録`;
    
    btn.onclick = () => submitAttendance(parseInt(detectedBits, 2));
}

async function submitAttendance(value) {
    const res = await fetch('/api/check_attend', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ otp_value: value })
    });
    const result = await res.json();
    alert(result.message);
}